const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Vouchers Controller
 * Handles fee voucher generation and management
 */
class VouchersController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.generate = this.generate.bind(this);
    this.generateBulk = this.generateBulk.bind(this);
    this.previewBulk = this.previewBulk.bind(this);
    this.generateBulkPDF = this.generateBulkPDF.bind(this);
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.updateItems = this.updateItems.bind(this);
    this.delete = this.delete.bind(this);
    this.downloadPDF = this.downloadPDF.bind(this);
    this.printPDF = this.printPDF.bind(this);
    this.bulkPrintPDF = this.bulkPrintPDF.bind(this);
  }

  formatDuesMonthLabel(monthValue) {
    const parsed = new Date(monthValue);
    if (Number.isNaN(parsed.getTime())) return 'Dues';
    return `Dues (${parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
  }

  toAmount(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  isSystemGeneratedDuesDescription(description) {
    if (typeof description !== 'string') return false;
    const normalized = description.trim();
    return normalized.startsWith('Dues (') && normalized.endsWith(')') && normalized.length === 15;
  }

  normalizeVoucherItemsForPersistence(items = []) {
    return items.map((rawItem) => {
      const trimmedDescription = typeof rawItem.description === 'string'
        ? rawItem.description.trim()
        : '';

      // Manual dues must be billable base items so outstanding reflects them correctly.
      if (rawItem.item_type === 'ARREARS' && !this.isSystemGeneratedDuesDescription(trimmedDescription)) {
        return {
          item_type: 'CUSTOM',
          amount: rawItem.amount,
          description: trimmedDescription || 'Dues'
        };
      }

      if (rawItem.item_type === 'CUSTOM') {
        return {
          item_type: 'CUSTOM',
          amount: rawItem.amount,
          description: trimmedDescription || 'Dues'
        };
      }

      return {
        item_type: rawItem.item_type,
        amount: rawItem.amount,
        ...(trimmedDescription ? { description: trimmedDescription } : {})
      };
    });
  }

  async resyncStudentVoucherDues(client, studentId) {
    const vouchersResult = await client.query(
      `WITH student_vouchers AS (
         SELECT v.id as voucher_id, v.month
         FROM fee_vouchers v
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         WHERE sch.student_id = $1
       ),
       base_totals AS (
         SELECT voucher_id, COALESCE(SUM(amount), 0) as base_total
         FROM fee_voucher_items
         WHERE item_type <> 'ARREARS'
         GROUP BY voucher_id
       ),
       payment_totals AS (
         SELECT voucher_id, COALESCE(SUM(amount), 0) as paid_total
         FROM fee_payments
         GROUP BY voucher_id
       )
       SELECT sv.voucher_id,
              sv.month,
              COALESCE(bt.base_total, 0) as base_total,
              COALESCE(pt.paid_total, 0) as paid_total,
              GREATEST(COALESCE(bt.base_total, 0) - COALESCE(pt.paid_total, 0), 0) as outstanding
       FROM student_vouchers sv
       LEFT JOIN base_totals bt ON bt.voucher_id = sv.voucher_id
       LEFT JOIN payment_totals pt ON pt.voucher_id = sv.voucher_id
       ORDER BY sv.month ASC, sv.voucher_id ASC`,
      [studentId]
    );

    const vouchers = vouchersResult.rows;

    for (const current of vouchers) {
      await client.query(
        `DELETE FROM fee_voucher_items
         WHERE voucher_id = $1 AND item_type = 'ARREARS'`,
        [current.voucher_id]
      );

      const currentMonth = new Date(current.month);
      if (Number.isNaN(currentMonth.getTime())) continue;

      const duesFromPrevious = vouchers.filter(prev => {
        const prevMonth = new Date(prev.month);
        return (
          !Number.isNaN(prevMonth.getTime()) &&
          prevMonth < currentMonth &&
          this.toAmount(prev.outstanding) > 0
        );
      });

      for (const due of duesFromPrevious) {
        await client.query(
          `INSERT INTO fee_voucher_items (voucher_id, item_type, amount, description)
           VALUES ($1, 'ARREARS', $2, $3)`,
          [
            current.voucher_id,
            this.toAmount(due.outstanding),
            this.formatDuesMonthLabel(due.month)
          ]
        );
      }
    }
  }

  async getDuesBreakdownForEnrollment(client, enrollmentId, targetMonth) {
    const duesResult = await client.query(
      `WITH target_student AS (
         SELECT student_id
         FROM student_class_history
         WHERE id = $1
       ),
       voucher_financials AS (
         SELECT
           v.id as voucher_id,
           v.month,
           COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) as base_total,
           COALESCE((SELECT SUM(fp.amount) FROM fee_payments fp WHERE fp.voucher_id = v.id), 0) as paid_total
         FROM fee_vouchers v
         JOIN student_class_history sch ON sch.id = v.student_class_history_id
         JOIN target_student ts ON ts.student_id = sch.student_id
         LEFT JOIN fee_voucher_items vi ON v.id = vi.voucher_id
         WHERE DATE_TRUNC('month', v.month) < DATE_TRUNC('month', $2::date)
         GROUP BY v.id, v.month
       )
       SELECT
         voucher_id,
         month,
         GREATEST(base_total - paid_total, 0) as due_amount
       FROM voucher_financials
       WHERE GREATEST(base_total - paid_total, 0) > 0
       ORDER BY month ASC, voucher_id ASC`,
      [enrollmentId, targetMonth]
    );

    return duesResult.rows.map(row => ({
      item_type: 'ARREARS',
      amount: parseFloat(row.due_amount) || 0,
      description: this.formatDuesMonthLabel(row.month)
    }));
  }

  async findExistingMonthlyVoucherForStudentMonth(client, studentId, targetMonth, options = {}) {
    const parsedMonth = new Date(targetMonth);
    if (Number.isNaN(parsedMonth.getTime())) {
      return null;
    }

    const monthStart = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth(), 1);
    const params = [studentId, monthStart];
    const lockRows = options.lockRows === true;

    let query = `
      SELECT
        v.id as voucher_id,
        v.student_class_history_id,
        v.month,
        COALESCE(v.voucher_type, 'MONTHLY') as voucher_type,
        c.id as class_id,
        c.name as class_name,
        sec.id as section_id,
        sec.name as section_name
      FROM fee_vouchers v
      JOIN student_class_history sch ON sch.id = v.student_class_history_id
      JOIN classes c ON c.id = sch.class_id
      JOIN sections sec ON sec.id = sch.section_id
      WHERE sch.student_id = $1
        AND COALESCE(v.voucher_type, 'MONTHLY') = 'MONTHLY'
        AND DATE_TRUNC('month', v.month) = DATE_TRUNC('month', $2::date)
    `;

    query += ` ORDER BY v.created_at DESC, v.id DESC LIMIT 1`;

    if (lockRows) {
      query += ` FOR UPDATE OF v`;
    }

    const result = await client.query(query, params);
    return result.rows[0] || null;
  }

  /**
   * Generate fee voucher for a student
   * POST /api/vouchers/generate
   */
  async generate(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { student_id, month, fee_types, custom_items = [], due_date, yearly_package_amount } = req.body;

      // Validate input
      const schema = Joi.object({
        student_id: Joi.number().integer().required(),
        month: Joi.date().required(),
        due_date: Joi.date().optional(),
        yearly_package_amount: Joi.number().positive().optional(),
        fee_types: Joi.array().items(
          Joi.string().valid('ADMISSION', 'MONTHLY', 'PAPER_FUND', 'EXAM', 'TRANSPORT', 'OTHER')
        ).optional(),
        custom_items: Joi.array().items(
          Joi.object({
            item_type: Joi.string().optional().default('CUSTOM'),
            amount: Joi.number().required(),
            description: Joi.string().optional().allow('', null)
          })
        ).optional()
      });

      const { error } = schema.validate(req.body, { stripUnknown: true });
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if student is currently enrolled
      const enrollmentCheck = await client.query(
        `SELECT sch.id, sch.class_id, s.name as student_name, s.is_active, s.is_bulk_imported, s.is_fee_free
         FROM student_class_history sch
         JOIN students s ON sch.student_id = s.id
         WHERE sch.student_id = $1 AND sch.end_date IS NULL`,
        [student_id]
      );

      if (enrollmentCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Student is not currently enrolled in any class', 404);
      }

      if (!enrollmentCheck.rows[0].is_active) {
        return ApiResponse.error(res, 'Student is not active', 400);
      }

      const enrollment = enrollmentCheck.rows[0];
      const isBulkImported = enrollment.is_bulk_imported || false;

      // ── College class: single YEARLY_COLLEGE voucher path ──────────────────
      const classTypeResult = await client.query(
        `SELECT class_type FROM classes WHERE id = $1`,
        [enrollment.class_id]
      );
      const isCollegeClass = classTypeResult.rows[0]?.class_type === 'COLLEGE';

      if (isCollegeClass) {
        if (!yearly_package_amount || parseFloat(yearly_package_amount) <= 0) {
          await client.query('ROLLBACK');
          return ApiResponse.error(
            res,
            'yearly_package_amount is required for College class students',
            400
          );
        }

        // Block duplicate yearly voucher for this enrollment
        const existingYearly = await client.query(
          `SELECT id FROM fee_vouchers
           WHERE student_class_history_id = $1 AND voucher_type = 'YEARLY_COLLEGE'`,
          [enrollment.id]
        );
        if (existingYearly.rows.length > 0) {
          await client.query('ROLLBACK');
          return ApiResponse.error(
            res,
            'Annual fee voucher already exists for this student. Use the Edit Voucher Items feature to revise the package amount.',
            400
          );
        }

        // Create the single yearly voucher (no due_date concept for yearly)
        const voucherResult = await client.query(
          `INSERT INTO fee_vouchers (student_class_history_id, month, voucher_type)
           VALUES ($1, $2, 'YEARLY_COLLEGE')
           RETURNING *`,
          [enrollment.id, month]
        );
        const voucher = voucherResult.rows[0];

        // Single fee item representing the entire yearly package
        await client.query(
          `INSERT INTO fee_voucher_items (voucher_id, item_type, amount, description)
           VALUES ($1, 'YEARLY_PACKAGE', $2, 'Annual Fee Package')`,
          [voucher.id, parseFloat(yearly_package_amount)]
        );

        await client.query('COMMIT');
        const complete = await this.getVoucherById(client, voucher.id);
        return ApiResponse.created(res, complete, 'Annual fee voucher generated successfully');
      }
      // ── End college path ────────────────────────────────────────────────────

      // Check if student is fee-free
      if (enrollment.is_fee_free) {
        console.log(`Student ${enrollment.student_name} is marked as fee-free. Skipping voucher generation.`);
        return ApiResponse.error(
          res,
          `Student ${enrollment.student_name} is marked as fee-free. No voucher will be generated.`,
          400
        );
      }

      // Enforce a single monthly voucher per student per month across all enrollments.
      // This prevents post-promotion/transfer duplicate month vouchers (old + new class).
      const existingMonthlyVoucher = await this.findExistingMonthlyVoucherForStudentMonth(
        client,
        student_id,
        month,
        { lockRows: true }
      );

      if (existingMonthlyVoucher) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          `Monthly voucher already exists for ${enrollment.student_name} in ${new Date(month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (${existingMonthlyVoucher.class_name} - ${existingMonthlyVoucher.section_name}).`,
          409,
          {
            existing_voucher_id: existingMonthlyVoucher.voucher_id,
            existing_class_id: existingMonthlyVoucher.class_id,
            existing_section_id: existingMonthlyVoucher.section_id,
          }
        );
      }

      // Get current fee structure for the class
      const feeStructure = await client.query(
        `SELECT admission_fee, monthly_fee, paper_fund, promotion_fee
         FROM class_fee_structure 
         WHERE class_id = $1
         ORDER BY effective_from DESC
         LIMIT 1`,
        [enrollment.class_id]
      );

      if (feeStructure.rows.length === 0) {
        return ApiResponse.error(res, 'Fee structure not defined for this class', 400);
      }

      const fees = feeStructure.rows[0];

      // Check for individual monthly fee from CSV import
      const studentFeeResult = await client.query(
        `SELECT individual_monthly_fee FROM students WHERE id = $1`,
        [student_id]
      );
      const individualMonthlyFee = studentFeeResult.rows[0]?.individual_monthly_fee;

      // Check for student-specific fee overrides
      const feeOverrideResult = await client.query(
        `SELECT admission_fee, monthly_fee, paper_fund, discount_description 
         FROM student_fee_overrides
         WHERE student_id = $1 AND class_id = $2`,
        [student_id, enrollment.class_id]
      );

      // Use fees in priority order: individual_monthly_fee > fee_override > class_default
      const effectiveFees = {
        admission_fee: feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].admission_fee !== null
          ? feeOverrideResult.rows[0].admission_fee
          : fees.admission_fee,
        monthly_fee: individualMonthlyFee !== null && individualMonthlyFee !== undefined
          ? individualMonthlyFee
          : (feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].monthly_fee !== null
            ? feeOverrideResult.rows[0].monthly_fee
            : fees.monthly_fee),
        paper_fund: feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].paper_fund !== null
          ? feeOverrideResult.rows[0].paper_fund
          : fees.paper_fund,
        promotion_fee: fees.promotion_fee // Promotion fee is not overridable
      };

      // Log fee calculation for debugging
      console.log(`[Single Voucher] Student ${enrollment.student_name} (${student_id})`);
      console.log(`  - individual_monthly_fee: ${individualMonthlyFee} (type: ${typeof individualMonthlyFee})`);
      console.log(`  - class_monthly_fee: ${fees.monthly_fee}`);
      console.log(`  - fee_override: ${feeOverrideResult.rows.length > 0 ? feeOverrideResult.rows[0].monthly_fee : 'none'}`);
      console.log(`  - effective_monthly_fee: ${effectiveFees.monthly_fee}`);
      console.log(`  - condition check: null=${individualMonthlyFee !== null}, undefined=${individualMonthlyFee !== undefined}`);

      // Get discount description if available
      const discountDescription = feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].discount_description
        ? feeOverrideResult.rows[0].discount_description
        : null;

      // Determine if this is the first voucher for this class enrollment
      // Check BEFORE creating the voucher
      const existingVouchersCount = await client.query(
        `SELECT COUNT(*) as count FROM fee_vouchers fv
         WHERE fv.student_class_history_id = $1`,
        [enrollment.id]
      );
      const isFirstEnrollment = parseInt(existingVouchersCount.rows[0].count) === 0;

      // Calculate due date (default: 10th of the voucher month)
      const calculatedDueDate = due_date || (() => {
        const voucherMonth = new Date(month);
        return new Date(voucherMonth.getFullYear(), voucherMonth.getMonth(), 10);
      })();

      // Create voucher with due date and discount description (MONTHLY type)
      const voucherResult = await client.query(
        `INSERT INTO fee_vouchers (student_class_history_id, month, due_date, discount_description, voucher_type)
         VALUES ($1, $2, $3, $4, 'MONTHLY')
         RETURNING *`,
        [enrollment.id, month, calculatedDueDate, discountDescription]
      );

      const voucher = voucherResult.rows[0];

      // Build fee items based on fee_types parameter or smart logic
      let feeItems = [];

      // For bulk imported students (CSV import): ONLY monthly fee, always
      if (isBulkImported) {
        feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
      } else {
        // Regular admission flow

        // 1. One-time fees (Admission) - only for first enrollment
        if (fee_types && fee_types.length > 0) {
          if (fee_types.includes('ADMISSION')) {
            feeItems.push({ item_type: 'ADMISSION', amount: parseFloat(effectiveFees.admission_fee) || 0 });
          }
        } else if (isFirstEnrollment) {
          // First voucher gets admission fee
          feeItems.push({ item_type: 'ADMISSION', amount: parseFloat(effectiveFees.admission_fee) || 0 });
        }

        // 2. Promotion fee (if applicable)
        const promotionFee = parseFloat(effectiveFees.promotion_fee) || 0;
        if (isFirstEnrollment && promotionFee > 0) {
          // Check if student has previous history to confirm this is a promotion
          const historyCheck = await client.query(
            `SELECT COUNT(*) as count FROM student_class_history 
             WHERE student_id = $1 AND end_date IS NOT NULL`,
            [student_id]
          );
          if (parseInt(historyCheck.rows[0].count) > 0) {
            feeItems.push({ item_type: 'PROMOTION', amount: promotionFee });
          }
        }

        // 3. Recurring fees
        if (fee_types && fee_types.length > 0) {
          // If specific fee types requested, use those
          if (fee_types.includes('MONTHLY')) {
            feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
          }
          if (fee_types.includes('PAPER_FUND')) {
            feeItems.push({ item_type: 'PAPER_FUND', amount: parseFloat(effectiveFees.paper_fund) || 0 });
          }
        } else if (isFirstEnrollment) {
          // First voucher (admission): include monthly AND paper fund
          feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
          feeItems.push({ item_type: 'PAPER_FUND', amount: parseFloat(effectiveFees.paper_fund) || 0 });
        } else {
          // Subsequent vouchers: ONLY monthly fee
          feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
        }
      }

      // 4. Dues logic: add month-wise dues entries.
      const duesItems = await this.getDuesBreakdownForEnrollment(client, enrollment.id, month);
      feeItems.push(...duesItems);

      // Insert fee items
      for (const item of feeItems) {
        if (item.amount !== 0) {
          if (item.description) {
            await client.query(
              `INSERT INTO fee_voucher_items (voucher_id, item_type, amount, description)
               VALUES ($1, $2, $3, $4)`,
              [voucher.id, item.item_type, item.amount, item.description]
            );
          } else {
            await client.query(
              `INSERT INTO fee_voucher_items (voucher_id, item_type, amount)
               VALUES ($1, $2, $3)`,
              [voucher.id, item.item_type, item.amount]
            );
          }
        }
      }

      // Apply persistent student discount (if exists)
      const discountResult = await client.query(
        `SELECT discount_type, discount_value FROM student_discounts
         WHERE student_id = $1 AND class_id = $2`,
        [student_id, enrollment.class_id]
      );

      if (discountResult.rows.length > 0) {
        const discount = discountResult.rows[0];
        let discountAmount = 0;

        if (discount.discount_type === 'PERCENTAGE') {
          // Calculate percentage discount on total fees
          const totalFees = feeItems.reduce((sum, item) => sum + item.amount, 0);
          discountAmount = (totalFees * parseFloat(discount.discount_value)) / 100;
        } else {
          // Flat discount
          discountAmount = parseFloat(discount.discount_value);
        }

        if (discountAmount > 0) {
          await client.query(
            `INSERT INTO fee_voucher_items (voucher_id, item_type, amount)
             VALUES ($1, 'DISCOUNT', $2)`,
            [voucher.id, -discountAmount] // Negative amount for discount
          );
        }
      }

      // Insert custom items (arrears, transport, late fees, etc.)
      for (const item of custom_items) {
        const itemType = item.item_type || 'CUSTOM';
        if (item.description && itemType === 'CUSTOM') {
          await client.query(
            `INSERT INTO fee_voucher_items (voucher_id, item_type, amount, description)
             VALUES ($1, $2, $3, $4)`,
            [voucher.id, itemType, item.amount, item.description]
          );
        } else {
          await client.query(
            `INSERT INTO fee_voucher_items (voucher_id, item_type, amount)
             VALUES ($1, $2, $3)`,
            [voucher.id, itemType, item.amount]
          );
        }
      }

      // Rebuild ARREARS across all student vouchers so future vouchers stay in sync
      // when this voucher is generated for an earlier month.
      await this.resyncStudentVoucherDues(client, student_id);

      await client.query('COMMIT');

      // Fetch complete voucher details
      const complete = await this.getVoucherById(client, voucher.id);

      return ApiResponse.created(res, complete, 'Voucher generated successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Generate vouchers in bulk (for class/section)
   * POST /api/vouchers/generate-bulk
   */
  async generateBulk(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { class_id, section_id, month, fee_types, due_date, custom_charges } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().optional(),
        month: Joi.date().required(),
        due_date: Joi.date().optional(),
        fee_types: Joi.array().items(
          Joi.string().valid('ADMISSION', 'MONTHLY', 'PAPER_FUND', 'EXAM', 'TRANSPORT', 'OTHER')
        ).optional(),
        custom_charges: Joi.array().items(
          Joi.object({
            description: Joi.string().required(),
            amount: Joi.number().required()
          })
        ).optional()
      });

      const { error } = schema.validate(req.body, { stripUnknown: true });
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Get fee structure for the class
      const feeStructure = await client.query(
        `SELECT admission_fee, monthly_fee, paper_fund, promotion_fee
         FROM class_fee_structure
         WHERE class_id = $1
         ORDER BY effective_from DESC
         LIMIT 1`,
        [class_id]
      );

      if (feeStructure.rows.length === 0) {
        return ApiResponse.error(res, 'Fee structure not defined for this class', 400);
      }

      // Block bulk generation for college classes (they get yearly vouchers at admission)
      const bulkClassTypeResult = await client.query(
        `SELECT class_type FROM classes WHERE id = $1`,
        [class_id]
      );
      if (bulkClassTypeResult.rows[0]?.class_type === 'COLLEGE') {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Bulk voucher generation is not applicable for College classes. College students receive a single annual fee voucher at the time of admission.',
          400
        );
      }

      const fees = feeStructure.rows[0];

      // Get all enrolled students in class/section (exclude fee-free students)
      let query = `
        SELECT sch.id as enrollment_id, s.id as student_id, s.name as student_name, s.is_bulk_imported, s.individual_monthly_fee
        FROM student_class_history sch
        JOIN students s ON sch.student_id = s.id
        WHERE sch.class_id = $1 
        AND sch.end_date IS NULL
        AND s.is_active = true
        AND (s.is_fee_free IS NULL OR s.is_fee_free = false)
      `;

      const params = [class_id];
      if (section_id) {
        query += ` AND sch.section_id = $2`;
        params.push(section_id);
      }

      const students = await client.query(query, params);

      if (students.rows.length === 0) {
        return ApiResponse.error(res, 'No active students found in this class/section', 404);
      }

      const results = {
        generated: [],
        skipped: [],
        failed: []
      };

      // Calculate due date (default: 10th of the voucher month)
      const calculatedDueDate = due_date || (() => {
        const voucherMonth = new Date(month);
        return new Date(voucherMonth.getFullYear(), voucherMonth.getMonth(), 10);
      })();

      const baseFeeItems = [
        { item_type: 'ADMISSION', amount: parseFloat(fees.admission_fee) || 0 },
        { item_type: 'MONTHLY', amount: parseFloat(fees.monthly_fee) || 0 },
        { item_type: 'PAPER_FUND', amount: parseFloat(fees.paper_fund) || 0 }
      ];

      // Generate voucher for each student
      for (const student of students.rows) {
        try {
          const existingMonthlyVoucher = await this.findExistingMonthlyVoucherForStudentMonth(
            client,
            student.student_id,
            month,
            { lockRows: true }
          );

          if (existingMonthlyVoucher) {
            results.skipped.push({
              student_id: student.student_id,
              student_name: student.student_name,
              reason: `Monthly voucher already exists for this student in ${new Date(month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (${existingMonthlyVoucher.class_name} - ${existingMonthlyVoucher.section_name})`,
              voucher_id: existingMonthlyVoucher.voucher_id
            });
            continue;
          }

          // Get individual monthly fee (already fetched in main query)
          const individualMonthlyFee = student.individual_monthly_fee;

          // Check for student-specific fee overrides
          const feeOverrideResult = await client.query(
            `SELECT admission_fee, monthly_fee, paper_fund 
             FROM student_fee_overrides
             WHERE student_id = $1 AND class_id = $2`,
            [student.student_id, class_id]
          );

          // Use fees in priority order: individual_monthly_fee > fee_override > class_default
          const effectiveFees = {
            admission_fee: feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].admission_fee !== null
              ? feeOverrideResult.rows[0].admission_fee
              : fees.admission_fee,
            monthly_fee: individualMonthlyFee !== null && individualMonthlyFee !== undefined
              ? individualMonthlyFee
              : (feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].monthly_fee !== null
                ? feeOverrideResult.rows[0].monthly_fee
                : fees.monthly_fee),
            paper_fund: feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].paper_fund !== null
              ? feeOverrideResult.rows[0].paper_fund
              : fees.paper_fund,
            promotion_fee: fees.promotion_fee
          };

          // Log fee calculation for debugging
          console.log(`[Bulk] Student ${student.student_name} (${student.student_id})`);
          console.log(`  - individual_monthly_fee from DB: ${student.individual_monthly_fee} (type: ${typeof student.individual_monthly_fee})`);
          console.log(`  - assigned individualMonthlyFee: ${individualMonthlyFee} (type: ${typeof individualMonthlyFee})`);
          console.log(`  - class_monthly_fee: ${fees.monthly_fee}`);
          console.log(`  - effective_monthly_fee: ${effectiveFees.monthly_fee}`);

          // Determine if this is the first voucher for this class enrollment
          const isFirstVoucherForClass = await client.query(
            `SELECT 1 FROM fee_vouchers fv
             WHERE fv.student_class_history_id = $1
             LIMIT 1`,
            [student.enrollment_id]
          );
          const isFirstEnrollment = isFirstVoucherForClass.rows.length === 0;
          const isBulkImported = student.is_bulk_imported || false;

          // Build fee items for this student
          let feeItems = [];

          // For bulk imported students (CSV import): ONLY monthly fee, always
          if (isBulkImported) {
            feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
          } else {
            // Regular admission flow

            // 1. One-time fees (Admission) - only for first enrollment
            if (fee_types && fee_types.length > 0) {
              if (fee_types.includes('ADMISSION')) {
                feeItems.push({ item_type: 'ADMISSION', amount: parseFloat(effectiveFees.admission_fee) || 0 });
              }
            } else if (isFirstEnrollment) {
              // First voucher gets admission fee
              feeItems.push({ item_type: 'ADMISSION', amount: parseFloat(effectiveFees.admission_fee) || 0 });
            }

            // 2. Promotion fee (if applicable)
            const promotionFee = parseFloat(effectiveFees.promotion_fee) || 0;
            if (isFirstEnrollment && promotionFee > 0) {
              // Check if student has previous history to confirm this is a promotion
              const historyCheck = await client.query(
                `SELECT COUNT(*) as count FROM student_class_history 
                 WHERE student_id = $1 AND end_date IS NOT NULL`,
                [student.student_id]
              );
              if (parseInt(historyCheck.rows[0].count) > 0) {
                feeItems.push({ item_type: 'PROMOTION', amount: promotionFee });
              }
            }

            // 3. Recurring fees
            if (fee_types && fee_types.length > 0) {
              // If specific fee types requested, use those
              if (fee_types.includes('MONTHLY')) {
                feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
              }
              if (fee_types.includes('PAPER_FUND')) {
                feeItems.push({ item_type: 'PAPER_FUND', amount: parseFloat(effectiveFees.paper_fund) || 0 });
              }
            } else if (isFirstEnrollment) {
              // First voucher (admission): include monthly AND paper fund
              feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
              feeItems.push({ item_type: 'PAPER_FUND', amount: parseFloat(effectiveFees.paper_fund) || 0 });
            } else {
              // Subsequent vouchers: ONLY monthly fee
              feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
            }
          }

          // 4. Dues logic: add month-wise dues entries.
          const duesItems = await this.getDuesBreakdownForEnrollment(client, student.enrollment_id, month);
          feeItems.push(...duesItems);

          // 5. Add custom charges if provided
          if (custom_charges && Array.isArray(custom_charges) && custom_charges.length > 0) {
            for (const charge of custom_charges) {
              if (charge.description && charge.amount && parseFloat(charge.amount) > 0) {
                feeItems.push({ 
                  item_type: 'CUSTOM', 
                  amount: parseFloat(charge.amount),
                  description: charge.description 
                });
              }
            }
          }

          // Create monthly voucher
          const voucherResult = await client.query(
            `INSERT INTO fee_vouchers (student_class_history_id, month, due_date, voucher_type)
             VALUES ($1, $2, $3, 'MONTHLY')
             RETURNING *`,
            [student.enrollment_id, month, calculatedDueDate]
          );

          const voucher = voucherResult.rows[0];

          // Insert fee items
          for (const item of feeItems) {
            if (item.amount !== 0) {
              if (item.description) {
                // Insert with description for CUSTOM items
                await client.query(
                  `INSERT INTO fee_voucher_items (voucher_id, item_type, amount, description)
                   VALUES ($1, $2, $3, $4)`,
                  [voucher.id, item.item_type, item.amount, item.description]
                );
              } else {
                // Insert without description for standard items
                await client.query(
                  `INSERT INTO fee_voucher_items (voucher_id, item_type, amount)
                   VALUES ($1, $2, $3)`,
                  [voucher.id, item.item_type, item.amount]
                );
              }
            }
          }

          // Apply persistent student discount (if exists)
          const discountResult = await client.query(
            `SELECT discount_type, discount_value FROM student_discounts
             WHERE student_id = $1 AND class_id = $2`,
            [student.student_id, class_id]
          );

          if (discountResult.rows.length > 0) {
            const discount = discountResult.rows[0];
            let discountAmount = 0;

            if (discount.discount_type === 'PERCENTAGE') {
              // Calculate percentage discount on total fees
              const totalFees = feeItems.reduce((sum, item) => sum + item.amount, 0);
              discountAmount = (totalFees * parseFloat(discount.discount_value)) / 100;
            } else {
              // Flat discount
              discountAmount = parseFloat(discount.discount_value);
            }

            if (discountAmount > 0) {
              await client.query(
                `INSERT INTO fee_voucher_items (voucher_id, item_type, amount)
                 VALUES ($1, 'DISCOUNT', $2)`,
                [voucher.id, -discountAmount] // Negative amount for discount
              );
            }
          }

          // Rebuild ARREARS for this student so existing future vouchers include
          // dues when a back-dated voucher is generated in bulk.
          await this.resyncStudentVoucherDues(client, student.student_id);

          results.generated.push({
            student_id: student.student_id,
            student_name: student.student_name,
            voucher_id: voucher.id
          });
        } catch (itemError) {
          results.failed.push({
            student_id: student.student_id,
            student_name: student.student_name,
            error: itemError.message
          });
        }
      }

      await client.query('COMMIT');

      return ApiResponse.success(res, {
        summary: {
          total: students.rows.length,
          generated: results.generated.length,
          skipped: results.skipped.length,
          failed: results.failed.length
        },
        details: results
      }, 'Bulk voucher generation completed');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List vouchers with filters
   * GET /api/vouchers
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const {
        student_id,
        class_id,
        section_id,
        month,
        year,
        status,
        from_date,
        to_date,
        page = 1,
        limit
      } = req.query;

      // Handle month/year parameters - convert to date format
      let monthDate = null;
      if (month && year) {
        // month=2, year=2026 -> '2026-02-01'
        const paddedMonth = month.toString().padStart(2, '0');
        monthDate = `${year}-${paddedMonth}-01`;
      } else if (month && month.length >= 7) {
        // month='2026-02' or month='2026-02-01' format
        monthDate = month.length === 7 ? `${month}-01` : month;
      }

      let query = `
        SELECT v.id as voucher_id,
               v.month,
               v.created_at,
               v.voucher_type,
               s.id as student_id,
               s.name as student_name,
               s.father_name,
               NULLIF(TRIM(s.phone), '') as father_phone,
               s.roll_no,
               c.id as class_id,
               c.name as class_name,
               sec.id as section_id,
               sec.name as section_name,
               SUM(vi.amount) as total_fee,
               COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) as base_total,
               COALESCE(MAX(p.paid_total), 0) as paid_amount,
               GREATEST(
                 COALESCE(SUM(vi.amount), 0) - COALESCE(MAX(p.paid_total), 0),
                 0
               ) as due_amount,
               CASE 
                 WHEN COALESCE(SUM(vi.amount), 0) <= COALESCE(MAX(p.paid_total), 0) THEN 'PAID'
                 WHEN COALESCE(MAX(p.paid_total), 0) > 0 THEN 'PARTIAL'
                 ELSE 'UNPAID'
               END as status,
               COALESCE(MAX(p.last_payment_date), null) as last_payment_date
        FROM fee_vouchers v
        JOIN student_class_history sch ON v.student_class_history_id = sch.id
        JOIN students s ON sch.student_id = s.id
        JOIN classes c ON sch.class_id = c.id
        JOIN sections sec ON sch.section_id = sec.id
        JOIN fee_voucher_items vi ON v.id = vi.voucher_id
        LEFT JOIN (
          SELECT voucher_id, 
                 SUM(amount) as paid_total,
                 MAX(payment_date) as last_payment_date
          FROM fee_payments 
          GROUP BY voucher_id
        ) p ON v.id = p.voucher_id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (student_id) {
        query += ` AND s.id = $${paramCount}`;
        params.push(student_id);
        paramCount++;
      }

      if (class_id) {
        query += ` AND c.id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      if (section_id) {
        query += ` AND sec.id = $${paramCount}`;
        params.push(section_id);
        paramCount++;
      }

      if (monthDate) {
        query += ` AND DATE_TRUNC('month', v.month) = DATE_TRUNC('month', $${paramCount}::date)`;
        params.push(monthDate);
        paramCount++;
      }

      if (from_date) {
        query += ` AND v.month >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        query += ` AND v.month <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      query += ` GROUP BY v.id, v.month, v.created_at, v.voucher_type, s.id, s.name, s.father_name, s.phone, s.roll_no, c.id, c.name, sec.id, sec.name`;

      // Apply status filter after grouping
      if (status) {
        const statusMap = {
          'PAID': 'COALESCE(SUM(vi.amount), 0) <= COALESCE(MAX(p.paid_total), 0)',
          'UNPAID': 'COALESCE(MAX(p.paid_total), 0) = 0',
          'PARTIAL': 'COALESCE(MAX(p.paid_total), 0) > 0 AND COALESCE(SUM(vi.amount), 0) > COALESCE(MAX(p.paid_total), 0)'
        };
        if (statusMap[status.toUpperCase()]) {
          query += ` HAVING ${statusMap[status.toUpperCase()]}`;
        }
      }

      // Count total
      const countQuery = `
        SELECT COUNT(*) FROM (
          ${query}
        ) as counted
      `;
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Add ordering and optional pagination
      query += ` ORDER BY s.roll_no, v.month DESC`;

      let result;
      if (limit) {
        const limitNum = parseInt(limit);
        const offsetNum = (parseInt(page) - 1) * limitNum;
        query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limitNum, offsetNum);
        result = await client.query(query, params);
        return ApiResponse.paginated(
          res,
          result.rows,
          { page: parseInt(page), limit: limitNum, total },
          'Vouchers retrieved successfully'
        );
      } else {
        // No limit specified - return all vouchers
        result = await client.query(query, params);
        return ApiResponse.paginated(
          res,
          result.rows,
          { page: 1, limit: result.rows.length || 1, total },
          'Vouchers retrieved successfully'
        );
      }
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get voucher by ID with complete details
   * GET /api/vouchers/:id
   */
  async getById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const voucher = await this.getVoucherById(client, id);

      if (!voucher) {
        return ApiResponse.error(res, 'Voucher not found', 404);
      }

      return ApiResponse.success(res, voucher);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Get complete voucher details
   */
  async getVoucherById(client, voucherId) {
    const result = await client.query(
      `WITH PaymentTotal AS (
         SELECT voucher_id, COALESCE(SUM(amount), 0) as paid_amount
         FROM fee_payments
         WHERE voucher_id = $1
         GROUP BY voucher_id
       )
       SELECT v.id as voucher_id,
              v.month,
              v.due_date,
              v.created_at,
              v.voucher_type,
              s.id as student_id,
              s.name as student_name,
              s.father_name,
              s.roll_no,
              NULLIF(TRIM(s.phone), '') as father_phone,
              c.id as class_id,
              c.name as class_name,
              sec.id as section_id,
              sec.name as section_name,
              json_agg(json_build_object(
                'item_type', vi.item_type,
                'amount', vi.amount,
                'description', vi.description
              )) as items,
              (SELECT json_agg(json_build_object(
                'id', p.id,
                'amount', p.amount,
                'payment_date', p.payment_date,
                'created_at', p.created_at
              ))
              FROM fee_payments p
              WHERE p.voucher_id = v.id) as payments,
              SUM(vi.amount) as total_fee,
              COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) as base_total,
              COALESCE(pt.paid_amount, 0) as paid_amount,
              GREATEST(
                COALESCE(SUM(vi.amount), 0) - COALESCE(pt.paid_amount, 0),
                0
              ) as due_amount,
              CASE 
                WHEN COALESCE(SUM(vi.amount), 0) <= COALESCE(pt.paid_amount, 0) THEN 'PAID'
                WHEN COALESCE(pt.paid_amount, 0) > 0 THEN 'PARTIAL'
                ELSE 'UNPAID'
              END as status
       FROM fee_vouchers v
       JOIN student_class_history sch ON v.student_class_history_id = sch.id
       JOIN students s ON sch.student_id = s.id
       JOIN classes c ON sch.class_id = c.id
       JOIN sections sec ON sch.section_id = sec.id
       JOIN fee_voucher_items vi ON v.id = vi.voucher_id
       LEFT JOIN PaymentTotal pt ON v.id = pt.voucher_id
       WHERE v.id = $1
       GROUP BY v.id, v.month, v.due_date, v.created_at, v.voucher_type, s.id, s.name, s.father_name, s.roll_no, s.phone, 
                c.id, c.name, sec.id, sec.name, pt.paid_amount`,
      [voucherId]
    );

    return result.rows[0];
  }

  /**
   * Update voucher items (add custom items like arrears, discount)
   * PUT /api/vouchers/:id/items
   */
  async updateItems(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { items } = req.body;

      // Validate input
      const schema = Joi.object({
        items: Joi.array().items(
          Joi.object({
            item_type: Joi.string().valid('MONTHLY','ADMISSION','PAPER_FUND','TRANSPORT','DISCOUNT','ARREARS','CUSTOM','YEARLY_PACKAGE').required(),
            amount: Joi.number().when('item_type', {
              is: 'DISCOUNT',
              then: Joi.number().max(0).required(),
              otherwise: Joi.number().min(0).required()
            }),
            description: Joi.string().optional().allow('', null)
          })
        ).min(1).required()
      });

      const { error } = schema.validate(req.body, { stripUnknown: true });
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      const normalizedItems = this.normalizeVoucherItemsForPersistence(items);

      // Check if voucher exists and get its type and payment status
      const voucherCheck = await client.query(
        `SELECT v.id,
                v.voucher_type,
                sch.student_id,
                COALESCE(SUM(p.amount), 0) as paid_amount
         FROM fee_vouchers v
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         LEFT JOIN fee_payments p ON v.id = p.voucher_id
         WHERE v.id = $1
         GROUP BY v.id, v.voucher_type, sch.student_id`,
        [id]
      );

      if (voucherCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Voucher not found', 404);
      }

      await client.query(
        `SELECT v.id
         FROM fee_vouchers v
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         WHERE sch.student_id = $1
         FOR UPDATE`,
        [voucherCheck.rows[0].student_id]
      );

      // Allow editing yearly college vouchers even with payments (package amount revision)
      // Block editing only for MONTHLY vouchers that already have payments
      if (
        parseFloat(voucherCheck.rows[0].paid_amount) > 0 &&
        voucherCheck.rows[0].voucher_type !== 'YEARLY_COLLEGE'
      ) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Cannot modify items for a voucher that has payments',
          400
        );
      }

      // Delete existing items first
      await client.query(
        `DELETE FROM fee_voucher_items WHERE voucher_id = $1`,
        [id]
      );

      // Insert new items
      for (const item of normalizedItems) {
        if (item.description && (item.item_type === 'CUSTOM' || item.item_type === 'ARREARS')) {
          await client.query(
            `INSERT INTO fee_voucher_items (voucher_id, item_type, amount, description)
             VALUES ($1, $2, $3, $4)`,
            [id, item.item_type, item.amount, item.description]
          );
        } else {
          await client.query(
            `INSERT INTO fee_voucher_items (voucher_id, item_type, amount)
             VALUES ($1, $2, $3)`,
            [id, item.item_type, item.amount]
          );
        }
      }

      await this.resyncStudentVoucherDues(client, voucherCheck.rows[0].student_id);

      const integrityCheck = await client.query(
        `WITH base_totals AS (
           SELECT v.id as voucher_id,
                  COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) as base_total
           FROM fee_vouchers v
           JOIN student_class_history sch ON v.student_class_history_id = sch.id
           LEFT JOIN fee_voucher_items vi ON vi.voucher_id = v.id
           WHERE sch.student_id = $1
           GROUP BY v.id
         ),
         paid_totals AS (
           SELECT v.id as voucher_id,
                  COALESCE(SUM(fp.amount), 0) as paid_total
           FROM fee_vouchers v
           JOIN student_class_history sch ON v.student_class_history_id = sch.id
           LEFT JOIN fee_payments fp ON fp.voucher_id = v.id
           WHERE sch.student_id = $1
           GROUP BY v.id
         )
         SELECT bt.voucher_id, bt.base_total, COALESCE(pt.paid_total, 0) as paid_total
         FROM base_totals bt
         LEFT JOIN paid_totals pt ON pt.voucher_id = bt.voucher_id
         WHERE COALESCE(pt.paid_total, 0) > bt.base_total
         LIMIT 1`,
        [voucherCheck.rows[0].student_id]
      );

      if (integrityCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Voucher update would create negative outstanding. Operation cancelled.',
          400
        );
      }

      await client.query('COMMIT');

      // Fetch updated voucher
      const updated = await this.getVoucherById(client, id);

      return ApiResponse.success(res, updated, 'Voucher items updated successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete voucher (only if unpaid)
   * DELETE /api/vouchers/:id
   */
  async delete(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Check if voucher has any payments
      const paymentCheck = await client.query(
        `SELECT COUNT(*) as payment_count
         FROM fee_payments
         WHERE voucher_id = $1`,
        [id]
      );

      if (parseInt(paymentCheck.rows[0].payment_count) > 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Cannot delete voucher with existing payments. Delete payments first.',
          400
        );
      }

      // Delete voucher and fetch owning student for dues resync.
      const result = await client.query(
        `DELETE FROM fee_vouchers v
         USING student_class_history sch
         WHERE v.id = $1
           AND v.student_class_history_id = sch.id
         RETURNING v.*, sch.student_id`,
        [id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Voucher not found', 404);
      }

      await this.resyncStudentVoucherDues(client, result.rows[0].student_id);

      await client.query('COMMIT');

      console.log(`Voucher ${id} deleted successfully for student_class_history_id: ${result.rows[0].student_class_history_id}, month: ${result.rows[0].month}`);

      return ApiResponse.success(res, result.rows[0], 'Voucher deleted successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Download fee voucher as PDF
   * GET /api/vouchers/:id/pdf
   */
  async downloadPDF(req, res, next) {
    try {
      const { id } = req.params;
      const pdfService = require('../services/pdf.service');

      const { filepath, filename } = await pdfService.generateFeeVoucher(id);

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');

      res.download(filepath, filename, (err) => {
        // Clean up the file after sending
        const fs = require('fs');
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }

        if (err) {
          next(err);
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Print fee voucher as PDF (inline, not download)
   * GET /api/vouchers/:id/print
   */
  async printPDF(req, res, next) {
    try {
      const { id } = req.params;
      const pdfService = require('../services/pdf.service');

      const { filepath, filename } = await pdfService.generateFeeVoucher(id);

      // Set headers for inline display (for printing)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');

      const fs = require('fs');
      const fileStream = fs.createReadStream(filepath);
      
      fileStream.pipe(res);
      
      fileStream.on('end', () => {
        // Clean up the file after sending
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      });

      fileStream.on('error', (err) => {
        // Clean up on error
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        next(err);
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Preview bulk voucher generation (without creating them)
   * POST /api/vouchers/preview-bulk
   */
  async previewBulk(req, res, next) {
    const client = await pool.connect();
    try {
      const { class_id, section_id, month, fee_types, due_date, custom_charges } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().optional(),
        month: Joi.date().required(),
        due_date: Joi.date().optional(),
        fee_types: Joi.array().items(
          Joi.string().valid('ADMISSION', 'MONTHLY', 'PAPER_FUND', 'EXAM', 'TRANSPORT', 'OTHER')
        ).optional(),
        custom_charges: Joi.array().items(
          Joi.object({
            description: Joi.string().required(),
            amount: Joi.number().required()
          })
        ).optional()
      });

      const { error } = schema.validate(req.body, { stripUnknown: true });
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Get fee structure for the class
      const feeStructure = await client.query(
        `SELECT admission_fee, monthly_fee, paper_fund, promotion_fee
         FROM class_fee_structure
         WHERE class_id = $1
         ORDER BY effective_from DESC
         LIMIT 1`,
        [class_id]
      );

      if (feeStructure.rows.length === 0) {
        return ApiResponse.error(res, 'Fee structure not defined for this class', 400);
      }

      // Block preview for college classes
      const previewClassTypeResult = await client.query(
        `SELECT class_type FROM classes WHERE id = $1`,
        [class_id]
      );
      if (previewClassTypeResult.rows[0]?.class_type === 'COLLEGE') {
        return ApiResponse.error(
          res,
          'Bulk voucher preview is not applicable for College classes. College students receive a single annual fee voucher at the time of admission.',
          400
        );
      }

      const fees = feeStructure.rows[0];

      // Get all enrolled students in class/section (exclude fee-free students)
      let query = `
        SELECT sch.id as enrollment_id, s.id as student_id, s.name as student_name, s.roll_no, NULLIF(TRIM(s.phone), '') as father_phone, s.is_bulk_imported, s.father_name, s.individual_monthly_fee
        FROM student_class_history sch
        JOIN students s ON sch.student_id = s.id
        WHERE sch.class_id = $1 
        AND sch.end_date IS NULL
        AND s.is_active = true
        AND (s.is_fee_free IS NULL OR s.is_fee_free = false)
      `;

      const params = [class_id];
      if (section_id) {
        query += ` AND sch.section_id = $2`;
        params.push(section_id);
      }

      query += ` ORDER BY s.roll_no, s.name`;

      const students = await client.query(query, params);

      if (students.rows.length === 0) {
        return ApiResponse.error(res, 'No active students found in this class/section', 404);
      }

      const preview = [];

      for (const student of students.rows) {
        const existingMonthlyVoucher = await this.findExistingMonthlyVoucherForStudentMonth(
          client,
          student.student_id,
          month
        );

        if (existingMonthlyVoucher) {
          continue; // Skip students who already have a voucher for this month
        }

        // Get individual monthly fee (already fetched in main query)
        const individualMonthlyFee = student.individual_monthly_fee;

        // Check for student-specific fee overrides
        const feeOverrideResult = await client.query(
          `SELECT admission_fee, monthly_fee, paper_fund 
           FROM student_fee_overrides
           WHERE student_id = $1 AND class_id = $2`,
          [student.student_id, class_id]
        );

        const hasCustomFees = feeOverrideResult.rows.length > 0 || (individualMonthlyFee !== null && individualMonthlyFee !== undefined);

        // Use fees in priority order: individual_monthly_fee > fee_override > class_default
        const effectiveFees = {
          admission_fee: feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].admission_fee !== null
            ? feeOverrideResult.rows[0].admission_fee
            : fees.admission_fee,
          monthly_fee: individualMonthlyFee !== null && individualMonthlyFee !== undefined
            ? individualMonthlyFee
            : (feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].monthly_fee !== null
              ? feeOverrideResult.rows[0].monthly_fee
              : fees.monthly_fee),
          paper_fund: feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].paper_fund !== null
            ? feeOverrideResult.rows[0].paper_fund
            : fees.paper_fund,
          promotion_fee: fees.promotion_fee
        };

        // Determine if this is the first voucher for this class enrollment
        const isFirstVoucherForClass = await client.query(
          `SELECT 1 FROM fee_vouchers fv
           WHERE fv.student_class_history_id = $1
           LIMIT 1`,
          [student.enrollment_id]
        );
        const isFirstEnrollment = isFirstVoucherForClass.rows.length === 0;
        const isBulkImported = student.is_bulk_imported || false;

        // Build fee items for this student
        let feeItems = [];

        // For bulk imported students (CSV import): ONLY monthly fee, always
        if (isBulkImported) {
          feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
        } else {
          // Regular admission flow

          // 1. One-time fees (Admission) - only for first enrollment
          if (fee_types && fee_types.length > 0) {
            if (fee_types.includes('ADMISSION')) {
              feeItems.push({ item_type: 'ADMISSION', amount: parseFloat(effectiveFees.admission_fee) || 0 });
            }
          } else if (isFirstEnrollment) {
            // First voucher gets admission fee
            feeItems.push({ item_type: 'ADMISSION', amount: parseFloat(effectiveFees.admission_fee) || 0 });
          }

          // 2. Promotion fee (if applicable)
          const promotionFee = parseFloat(effectiveFees.promotion_fee) || 0;
          if (isFirstEnrollment && promotionFee > 0) {
            const historyCheck = await client.query(
              `SELECT COUNT(*) as count FROM student_class_history 
               WHERE student_id = $1 AND end_date IS NOT NULL`,
              [student.student_id]
            );
            if (parseInt(historyCheck.rows[0].count) > 0) {
              feeItems.push({ item_type: 'PROMOTION', amount: promotionFee });
            }
          }

          // 3. Recurring fees
          if (fee_types && fee_types.length > 0) {
            // If specific fee types requested, use those
            if (fee_types.includes('MONTHLY')) {
              feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
            }
            if (fee_types.includes('PAPER_FUND')) {
              feeItems.push({ item_type: 'PAPER_FUND', amount: parseFloat(effectiveFees.paper_fund) || 0 });
            }
          } else if (isFirstEnrollment) {
            // First voucher (admission): include monthly AND paper fund
            feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
            feeItems.push({ item_type: 'PAPER_FUND', amount: parseFloat(effectiveFees.paper_fund) || 0 });
          } else {
            // Subsequent vouchers: ONLY monthly fee
            feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
          }
        }

        // 4. Dues logic: add month-wise dues entries.
        const duesItems = await this.getDuesBreakdownForEnrollment(client, student.enrollment_id, month);
        feeItems.push(...duesItems);

        // 5. Add custom charges if provided
        if (custom_charges && Array.isArray(custom_charges) && custom_charges.length > 0) {
          for (const charge of custom_charges) {
            if (charge.description && charge.amount && parseFloat(charge.amount) > 0) {
              feeItems.push({ 
                item_type: 'CUSTOM', 
                amount: parseFloat(charge.amount),
                description: charge.description 
              });
            }
          }
        }

        // Apply discount if exists
        const discountResult = await client.query(
          `SELECT discount_type, discount_value FROM student_discounts
           WHERE student_id = $1 AND class_id = $2`,
          [student.student_id, class_id]
        );

        let discountAmount = 0;
        if (discountResult.rows.length > 0) {
          const discount = discountResult.rows[0];
          if (discount.discount_type === 'PERCENTAGE') {
            const totalFees = feeItems.reduce((sum, item) => sum + item.amount, 0);
            discountAmount = (totalFees * parseFloat(discount.discount_value)) / 100;
          } else {
            discountAmount = parseFloat(discount.discount_value);
          }

          if (discountAmount > 0) {
            feeItems.push({ item_type: 'DISCOUNT', amount: -discountAmount });
          }
        }

        const totalAmount = feeItems.reduce((sum, item) => sum + item.amount, 0);

        preview.push({
          student_id: student.student_id,
          student_name: student.student_name,
          father_name: student.father_name,
          father_phone: student.father_phone,
          roll_no: student.roll_no,
          items: feeItems,
          total_amount: totalAmount,
          has_custom_fees: hasCustomFees
        });
      }

      const totalAmount = preview.reduce((sum, v) => sum + v.total_amount, 0);
      const studentsWithCustomFees = preview.filter(v => v.has_custom_fees).length;

      return ApiResponse.success(res, {
        summary: {
          total_students: preview.length,
          total_amount: totalAmount,
          students_with_custom_fees: studentsWithCustomFees,
          month: new Date(month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        },
        vouchers: preview
      }, 'Bulk voucher preview generated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Generate bulk vouchers as PDF without saving to database
   * POST /api/vouchers/generate-bulk-pdf
   */
  async generateBulkPDF(req, res, next) {
    const client = await pool.connect();
    try {
      const { class_id, section_id, month, fee_types, due_date } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().optional(),
        month: Joi.date().required(),
        due_date: Joi.date().optional(),
        fee_types: Joi.array().items(
          Joi.string().valid('ADMISSION', 'MONTHLY', 'PAPER_FUND', 'EXAM', 'TRANSPORT', 'OTHER')
        ).optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Get preview data using the same logic
      const { class_id: classId, section_id: sectionId, month: voucherMonth, fee_types: feeTypes, due_date: dueDate } = req.body;
      const calculatedDueDate = dueDate || (() => {
        const monthDate = new Date(voucherMonth);
        return new Date(monthDate.getFullYear(), monthDate.getMonth(), 10);
      })();
      
      // Get fee structure for the class
      const feeStructure = await client.query(
        `SELECT admission_fee, monthly_fee, paper_fund, promotion_fee
         FROM class_fee_structure
         WHERE class_id = $1
         ORDER BY effective_from DESC
         LIMIT 1`,
        [classId]
      );

      if (feeStructure.rows.length === 0) {
        return ApiResponse.error(res, 'Fee structure not defined for this class', 400);
      }

      const fees = feeStructure.rows[0];

      // Get class and section names
      const classInfo = await client.query(
        `SELECT c.name as class_name, c.class_type, s.name as section_name
         FROM classes c
         LEFT JOIN sections s ON s.id = $2
         WHERE c.id = $1`,
        [classId, sectionId || null]
      );

      // Get all enrolled students in class/section
      let query = `
        SELECT sch.id as enrollment_id, s.id as student_id, s.name as student_name, sch.serial_number, NULLIF(TRIM(s.phone), '') as father_phone, s.father_name, s.individual_monthly_fee
        FROM student_class_history sch
        JOIN students s ON sch.student_id = s.id
        WHERE sch.class_id = $1 
        AND sch.end_date IS NULL
        AND s.is_active = true
      `;

      const params = [classId];
      if (sectionId) {
        query += ` AND sch.section_id = $2`;
        params.push(sectionId);
      }

      query += ` ORDER BY sch.serial_number NULLS LAST, s.name`;

      const students = await client.query(query, params);

      if (students.rows.length === 0) {
        return ApiResponse.error(res, 'No active students found in this class/section', 404);
      }

      const vouchersData = [];

      for (const student of students.rows) {
        const existingMonthlyVoucher = await this.findExistingMonthlyVoucherForStudentMonth(
          client,
          student.student_id,
          voucherMonth
        );

        if (existingMonthlyVoucher) {
          continue; // Skip if voucher already exists
        }

        // Get individual monthly fee (already fetched in main query)
        const individualMonthlyFee = student.individual_monthly_fee;

        // Check for student-specific fee overrides
        const feeOverrideResult = await client.query(
          `SELECT admission_fee, monthly_fee, paper_fund 
           FROM student_fee_overrides
           WHERE student_id = $1 AND class_id = $2`,
          [student.student_id, classId]
        );

        // Use fees in priority order: individual_monthly_fee > fee_override > class_default
        const effectiveFees = {
          admission_fee: feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].admission_fee !== null
            ? feeOverrideResult.rows[0].admission_fee
            : fees.admission_fee,
          monthly_fee: individualMonthlyFee !== null && individualMonthlyFee !== undefined
            ? individualMonthlyFee
            : (feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].monthly_fee !== null
              ? feeOverrideResult.rows[0].monthly_fee
              : fees.monthly_fee),
          paper_fund: feeOverrideResult.rows.length > 0 && feeOverrideResult.rows[0].paper_fund !== null
            ? feeOverrideResult.rows[0].paper_fund
            : fees.paper_fund,
          promotion_fee: fees.promotion_fee
        };

        const isFirstVoucherForClass = await client.query(
          `SELECT 1 FROM fee_vouchers fv WHERE fv.student_class_history_id = $1 LIMIT 1`,
          [student.enrollment_id]
        );
        const isFirstEnrollment = isFirstVoucherForClass.rows.length === 0;

        let feeItems = [];

        if (feeTypes && feeTypes.length > 0) {
          if (feeTypes.includes('ADMISSION')) {
            feeItems.push({ item_type: 'ADMISSION', amount: parseFloat(effectiveFees.admission_fee) || 0 });
          }
        } else if (isFirstEnrollment) {
          feeItems.push({ item_type: 'ADMISSION', amount: parseFloat(effectiveFees.admission_fee) || 0 });
        }

        const promotionFee = parseFloat(effectiveFees.promotion_fee) || 0;
        if (isFirstEnrollment && promotionFee > 0) {
          const historyCheck = await client.query(
            `SELECT COUNT(*) as count FROM student_class_history 
             WHERE student_id = $1 AND end_date IS NOT NULL`,
            [student.student_id]
          );
          if (parseInt(historyCheck.rows[0].count) > 0) {
            feeItems.push({ item_type: 'PROMOTION', amount: promotionFee });
          }
        }

        if (feeTypes && feeTypes.length > 0) {
          if (feeTypes.includes('MONTHLY')) {
            feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
          }
          if (feeTypes.includes('PAPER_FUND')) {
            feeItems.push({ item_type: 'PAPER_FUND', amount: parseFloat(effectiveFees.paper_fund) || 0 });
          }
        } else {
          feeItems.push({ item_type: 'MONTHLY', amount: parseFloat(effectiveFees.monthly_fee) || 0 });
          feeItems.push({ item_type: 'PAPER_FUND', amount: parseFloat(effectiveFees.paper_fund) || 0 });
        }

        const duesItems = await this.getDuesBreakdownForEnrollment(client, student.enrollment_id, voucherMonth);
        feeItems.push(...duesItems);

        const discountResult = await client.query(
          `SELECT discount_type, discount_value FROM student_discounts
           WHERE student_id = $1 AND class_id = $2`,
          [student.student_id, classId]
        );

        if (discountResult.rows.length > 0) {
          const discount = discountResult.rows[0];
          let discountAmount = 0;
          if (discount.discount_type === 'PERCENTAGE') {
            const totalFees = feeItems.reduce((sum, item) => sum + item.amount, 0);
            discountAmount = (totalFees * parseFloat(discount.discount_value)) / 100;
          } else {
            discountAmount = parseFloat(discount.discount_value);
          }
          if (discountAmount > 0) {
            feeItems.push({ item_type: 'DISCOUNT', amount: -discountAmount });
          }
        }

        vouchersData.push({
          student_name: student.student_name,
          father_name: student.father_name,
          father_phone: student.father_phone,
          serial_number: student.serial_number,
          class_name: classInfo.rows[0].class_name,
          class_type: classInfo.rows[0].class_type,
          section_name: classInfo.rows[0].section_name || 'N/A',
          month: voucherMonth,
          due_date: calculatedDueDate,
          items: feeItems
        });
      }

      // Generate PDF using pdf.service
      const pdfService = require('../services/pdf.service');
      const { filepath, filename } = await pdfService.generateBulkFeeVouchers(vouchersData);

      // Send PDF for printing (inline)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

      const fs = require('fs');
      const fileStream = fs.createReadStream(filepath);
      
      fileStream.pipe(res);
      
      fileStream.on('end', () => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      });

      fileStream.on('error', (err) => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        next(err);
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Bulk print multiple vouchers in a single PDF
   * POST /api/vouchers/bulk-print
   */
  async bulkPrintPDF(req, res, next) {
    const client = await pool.connect();
    try {
      const { voucher_ids } = req.body;

      // Validate input
      if (!Array.isArray(voucher_ids) || voucher_ids.length === 0) {
        return ApiResponse.error(res, 'voucher_ids must be a non-empty array', 400);
      }

      // Fetch all vouchers with their details including individual payment records
      const query = `
        SELECT 
          v.id,
          v.month,
          v.due_date,
          v.created_at,
          s.id as student_id,
          s.name as student_name,
          s.father_name,
          NULLIF(TRIM(s.phone), '') as father_phone,
          sch.serial_number,
          c.name as class_name,
          sec.name as section_name,
          SUM(vi.amount) as total_amount,
          COALESCE(MAX(p.paid_total), 0) as paid_amount,
          json_agg(
            json_build_object(
              'item_type', vi.item_type,
              'description', vi.description,
              'amount', vi.amount
            ) ORDER BY vi.id
          ) as items,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'amount', fp.amount,
                  'payment_date', fp.payment_date
                ) ORDER BY fp.payment_date, fp.created_at
              )
              FROM fee_payments fp
              WHERE fp.voucher_id = v.id
            ),
            '[]'::json
          ) as payments
        FROM fee_vouchers v
        JOIN student_class_history sch ON v.student_class_history_id = sch.id
        JOIN students s ON sch.student_id = s.id
        JOIN classes c ON sch.class_id = c.id
        LEFT JOIN sections sec ON sch.section_id = sec.id
        JOIN fee_voucher_items vi ON v.id = vi.voucher_id
        LEFT JOIN (
          SELECT voucher_id, SUM(amount) as paid_total 
          FROM fee_payments 
          GROUP BY voucher_id
        ) p ON v.id = p.voucher_id
        WHERE v.id = ANY($1::int[])
        GROUP BY v.id, v.month, v.due_date, v.created_at, s.id, s.name, s.father_name, s.phone,
                 sch.serial_number, c.name, sec.name
        ORDER BY c.name, sch.serial_number NULLS LAST, s.name
      `;

      const result = await client.query(query, [voucher_ids]);

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'No vouchers found with the provided IDs', 404);
      }

      // Format vouchers data for PDF generation
      const vouchersData = result.rows.map(row => ({
        id: row.id,
        voucher_no: `V-${row.id}`,
        student_name: row.student_name,
        father_name: row.father_name,
        father_phone: row.father_phone,
        serial_number: row.serial_number,
        class_name: row.class_name,
        section_name: row.section_name,
        month: row.month,
        due_date: row.due_date,
        items: row.items,
        total_amount: parseFloat(row.total_amount),
        paid_amount: parseFloat(row.paid_amount) || 0,
        payments: row.payments || []
      }));

      // Generate bulk PDF using pdf.service
      const pdfService = require('../services/pdf.service');
      const { filepath, filename } = await pdfService.generateBulkFeeVouchers(vouchersData);

      // Set response headers for inline display
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

      // Stream the PDF file
      const fs = require('fs');
      const fileStream = fs.createReadStream(filepath);
      
      fileStream.pipe(res);
      
      fileStream.on('end', () => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      });

      fileStream.on('error', (err) => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        next(err);
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new VouchersController();
