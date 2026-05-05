const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Fees Controller
 * Handles fee payments, defaulters, and fee-related operations
 */
class FeesController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.recordPayment = this.recordPayment.bind(this);
    this.listPayments = this.listPayments.bind(this);
    this.getVoucherPayments = this.getVoucherPayments.bind(this);
    this.deletePayment = this.deletePayment.bind(this);
    this.getDefaulters = this.getDefaulters.bind(this);
    this.getStudentFeeHistory = this.getStudentFeeHistory.bind(this);
    this.getStudentDue = this.getStudentDue.bind(this);
    this.getStats = this.getStats.bind(this);
    this.downloadReceipt = this.downloadReceipt.bind(this);
  }

  /**
   * Helper: Parse a numeric DB value safely.
   */
  toAmount(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  toCents(value) {
    return Math.round(this.toAmount(value) * 100);
  }

  fromCents(cents) {
    return (Number.isFinite(cents) ? cents : 0) / 100;
  }

  formatDuesMonthLabel(monthValue) {
    const parsed = new Date(monthValue);
    if (Number.isNaN(parsed.getTime())) return 'Dues';
    return `Dues (${parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
  }

  /**
   * Rebuild ARREARS rows for all vouchers of the student so earlier voucher
   * payment edits/undo are reflected in all later vouchers (including latest).
   */
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
      // Always clear ARREARS and rebuild deterministically.
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

  /**
   * Record a fee payment
   * POST /api/fees/payment
   */
  async recordPayment(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { voucher_id, amount, payment_date } = req.body;

      // Validate input
      const schema = Joi.object({
        voucher_id: Joi.number().integer().required(),
        amount: Joi.number().positive().required(),
        payment_date: Joi.date().optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check voucher and fetch owner student context.
      const voucherCheck = await client.query(
        `SELECT v.id, v.month, sch.student_id
         FROM fee_vouchers v
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         WHERE v.id = $1`,
        [voucher_id]
      );

      if (voucherCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Fee voucher not found', 404);
      }

      const selectedVoucher = voucherCheck.rows[0];

      // Serialize payment writes per student to avoid concurrent over-allocation.
      await client.query(
        `SELECT v.id
         FROM fee_vouchers v
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         WHERE sch.student_id = $1
         FOR UPDATE`,
        [selectedVoucher.student_id]
      );

      let allocationQuery = `
        WITH voucher_totals AS (
          SELECT voucher_id,
                 COALESCE(SUM(CASE WHEN item_type <> 'ARREARS' THEN amount ELSE 0 END), 0) as total_fee
          FROM fee_voucher_items
          GROUP BY voucher_id
        ),
        payment_totals AS (
          SELECT voucher_id,
                 COALESCE(SUM(amount), 0) as paid_amount
          FROM fee_payments
          GROUP BY voucher_id
        )
        SELECT v.id as voucher_id,
               v.month,
               COALESCE(vt.total_fee, 0) as total_fee,
               COALESCE(pt.paid_amount, 0) as paid_amount,
               GREATEST(COALESCE(vt.total_fee, 0) - COALESCE(pt.paid_amount, 0), 0) as due_amount
        FROM fee_vouchers v
        JOIN student_class_history sch ON v.student_class_history_id = sch.id
        LEFT JOIN voucher_totals vt ON vt.voucher_id = v.id
        LEFT JOIN payment_totals pt ON pt.voucher_id = v.id
        WHERE sch.student_id = $1
      `;

      const allocationParams = [selectedVoucher.student_id];

      // Core rule: one payment settles student dues oldest-first across vouchers.
      allocationQuery += `
        AND COALESCE(vt.total_fee, 0) > COALESCE(pt.paid_amount, 0)
        ORDER BY v.month ASC, v.id ASC
      `;

      const allocationResult = await client.query(allocationQuery, allocationParams);
      const vouchersToAllocate = allocationResult.rows;

      if (vouchersToAllocate.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'No pending due found for this voucher', 400);
      }

      // Keep oldest-first order but guard against any duplicate rows from upstream joins.
      const orderedUniqueVouchers = [];
      const seenVoucherIds = new Set();
      for (const voucher of vouchersToAllocate) {
        const voucherId = parseInt(voucher.voucher_id, 10);
        if (!Number.isFinite(voucherId) || seenVoucherIds.has(voucherId)) continue;
        seenVoucherIds.add(voucherId);
        orderedUniqueVouchers.push({ ...voucher, voucher_id: voucherId });
      }

      if (orderedUniqueVouchers.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'No pending due found for this voucher', 400);
      }

      const liveDueResult = await client.query(
        `WITH base_totals AS (
           SELECT voucher_id,
                  COALESCE(SUM(CASE WHEN item_type <> 'ARREARS' THEN amount ELSE 0 END), 0) as base_total
           FROM fee_voucher_items
           WHERE voucher_id = ANY($1::int[])
           GROUP BY voucher_id
         ),
         payment_totals AS (
           SELECT voucher_id,
                  COALESCE(SUM(amount), 0) as paid_total
           FROM fee_payments
           WHERE voucher_id = ANY($1::int[])
           GROUP BY voucher_id
         )
         SELECT v.id as voucher_id,
                GREATEST(COALESCE(bt.base_total, 0) - COALESCE(pt.paid_total, 0), 0) as live_due_amount
         FROM fee_vouchers v
         LEFT JOIN base_totals bt ON bt.voucher_id = v.id
         LEFT JOIN payment_totals pt ON pt.voucher_id = v.id
         WHERE v.id = ANY($1::int[])`,
        [orderedUniqueVouchers.map((voucher) => voucher.voucher_id)]
      );

      const liveDueByVoucher = new Map(
        liveDueResult.rows
          .map((row) => [parseInt(row.voucher_id, 10), this.toCents(row.live_due_amount)])
          .filter(([voucherId]) => Number.isFinite(voucherId))
      );

      const refreshVoucherLiveDueCents = async (targetVoucherId) => {
        const refreshed = await client.query(
          `WITH base_totals AS (
             SELECT voucher_id,
                    COALESCE(SUM(CASE WHEN item_type <> 'ARREARS' THEN amount ELSE 0 END), 0) as base_total
             FROM fee_voucher_items
             WHERE voucher_id = $1
             GROUP BY voucher_id
           ),
           payment_totals AS (
             SELECT voucher_id,
                    COALESCE(SUM(amount), 0) as paid_total
             FROM fee_payments
             WHERE voucher_id = $1
             GROUP BY voucher_id
           )
           SELECT v.id as voucher_id,
                  GREATEST(COALESCE(bt.base_total, 0) - COALESCE(pt.paid_total, 0), 0) as live_due_amount
           FROM fee_vouchers v
           LEFT JOIN base_totals bt ON bt.voucher_id = v.id
           LEFT JOIN payment_totals pt ON pt.voucher_id = v.id
           WHERE v.id = $1`,
          [targetVoucherId]
        );

        const refreshedDueCents = refreshed.rows.length > 0
          ? this.toCents(refreshed.rows[0].live_due_amount)
          : 0;

        liveDueByVoucher.set(targetVoucherId, Math.max(refreshedDueCents, 0));
        return Math.max(refreshedDueCents, 0);
      };

      const insertPaymentAllocation = async (targetVoucherId, allocationAmountCents, paymentDate) => {
        await client.query('SAVEPOINT sp_fee_payment_alloc');
        try {
          const inserted = await client.query(
            `INSERT INTO fee_payments (voucher_id, amount, payment_date)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [targetVoucherId, this.fromCents(allocationAmountCents), paymentDate]
          );
          await client.query('RELEASE SAVEPOINT sp_fee_payment_alloc');
          return inserted;
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT sp_fee_payment_alloc');
          await client.query('RELEASE SAVEPOINT sp_fee_payment_alloc');
          throw error;
        }
      };

      const requestedCents = this.toCents(amount);

      if (requestedCents <= 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Payment amount must be greater than zero',
          400
        );
      }

      const totalAllocatableDueCents = orderedUniqueVouchers.reduce(
        (sum, row) => sum + (liveDueByVoucher.get(row.voucher_id) || 0),
        0
      );

      if (requestedCents > totalAllocatableDueCents) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          `Payment amount (Rs. ${this.fromCents(requestedCents).toFixed(2)}) exceeds allocatable due (Rs. ${this.fromCents(totalAllocatableDueCents).toFixed(2)}).`,
          400
        );
      }

      let remainingAmountCents = requestedCents;
      const paymentDateValue = payment_date || new Date();
      const insertedPayments = [];
      const skippedVoucherIds = [];

      for (const voucher of orderedUniqueVouchers) {
        if (remainingAmountCents <= 0) break;

        let voucherDueCents = liveDueByVoucher.get(voucher.voucher_id) || 0;
        if (voucherDueCents <= 0) continue;

        let allocationAmountCents = Math.min(remainingAmountCents, voucherDueCents);

        try {
          const paymentInsert = await insertPaymentAllocation(
            voucher.voucher_id,
            allocationAmountCents,
            paymentDateValue
          );

          insertedPayments.push(paymentInsert.rows[0]);
          remainingAmountCents -= allocationAmountCents;
          liveDueByVoucher.set(voucher.voucher_id, Math.max(voucherDueCents - allocationAmountCents, 0));
        } catch (insertError) {
          const insertMessage = `${insertError?.message || ''}`;
          const isOverBaseError = /exceed voucher .* base total|exceeds base total/i.test(insertMessage);

          if (!isOverBaseError) {
            throw insertError;
          }

          voucherDueCents = await refreshVoucherLiveDueCents(voucher.voucher_id);

          if (voucherDueCents <= 0) {
            skippedVoucherIds.push(voucher.voucher_id);
            continue;
          }

          allocationAmountCents = Math.min(remainingAmountCents, voucherDueCents);

          try {
            const retriedInsert = await insertPaymentAllocation(
              voucher.voucher_id,
              allocationAmountCents,
              paymentDateValue
            );

            insertedPayments.push(retriedInsert.rows[0]);
            remainingAmountCents -= allocationAmountCents;
            liveDueByVoucher.set(voucher.voucher_id, Math.max(voucherDueCents - allocationAmountCents, 0));
          } catch (retryError) {
            const retryMessage = `${retryError?.message || ''}`;
            const retryOverBase = /exceed voucher .* base total|exceeds base total/i.test(retryMessage);

            if (!retryOverBase) {
              throw retryError;
            }

            liveDueByVoucher.set(voucher.voucher_id, 0);
            skippedVoucherIds.push(voucher.voucher_id);
            continue;
          }
        }
      }

      if (remainingAmountCents > 0) {
        await client.query('ROLLBACK');
        const skippedPart = skippedVoucherIds.length > 0
          ? ` Skipped vouchers after over-base checks: ${[...new Set(skippedVoucherIds)].join(', ')}.`
          : '';
        return ApiResponse.error(
          res,
          `Payment could not be fully allocated after checking all eligible vouchers. Remaining amount: ${this.fromCents(remainingAmountCents).toFixed(2)}.${skippedPart}`,
          400
        );
      }

      const touchedVoucherIds = [
        ...new Set(
          insertedPayments
            .map((payment) => parseInt(payment.voucher_id, 10))
            .filter((id) => Number.isFinite(id))
        )
      ];

      const integrityCheck = await client.query(
        `WITH base_totals AS (
           SELECT v.id as voucher_id,
                  COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) as base_total
           FROM fee_vouchers v
           LEFT JOIN fee_voucher_items vi ON vi.voucher_id = v.id
           WHERE v.id = ANY($1::int[])
           GROUP BY v.id
         ),
         paid_totals AS (
           SELECT v.id as voucher_id,
                  COALESCE(SUM(fp.amount), 0) as paid_total
           FROM fee_vouchers v
           LEFT JOIN fee_payments fp ON fp.voucher_id = v.id
           WHERE v.id = ANY($1::int[])
           GROUP BY v.id
         )
         SELECT bt.voucher_id, bt.base_total, COALESCE(pt.paid_total, 0) as paid_total
         FROM base_totals bt
         LEFT JOIN paid_totals pt ON pt.voucher_id = bt.voucher_id
         WHERE COALESCE(pt.paid_total, 0) > bt.base_total
         LIMIT 1`,
        [touchedVoucherIds]
      );

      if (integrityCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Payment would create negative outstanding. Operation cancelled.',
          400
        );
      }

      await this.resyncStudentVoucherDues(client, selectedVoucher.student_id);

      await client.query('COMMIT');

      // Get updated status for originally selected voucher.
      const updatedVoucher = await this.getVoucherStatus(client, voucher_id);

      return ApiResponse.created(res, {
        payment: insertedPayments[insertedPayments.length - 1] || null,
        payments: insertedPayments,
        synchronized: insertedPayments.length > 1,
        allocation_count: insertedPayments.length,
        voucher_status: updatedVoucher
      }, 'Payment recorded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Get voucher payment status
   */
  async getVoucherStatus(client, voucherId) {
    const result = await client.query(
      `WITH VoucherTotals AS (
        SELECT voucher_id,
             COALESCE(SUM(CASE WHEN item_type <> 'ARREARS' THEN amount ELSE 0 END), 0) as total_fee
         FROM fee_voucher_items
         WHERE voucher_id = $1
         GROUP BY voucher_id
       ),
       PaymentTotals AS (
         SELECT voucher_id, SUM(amount) as paid_amount
         FROM fee_payments
         WHERE voucher_id = $1
         GROUP BY voucher_id
       )
       SELECT v.id,
              v.month,
              s.id as student_id,
              s.name as student_name,
              c.name as class_name,
              sec.name as section_name,
              COALESCE(vt.total_fee, 0) as total_fee,
              COALESCE(pt.paid_amount, 0) as paid_amount,
              GREATEST(COALESCE(vt.total_fee, 0) - COALESCE(pt.paid_amount, 0), 0) as due_amount,
              CASE 
                WHEN COALESCE(vt.total_fee, 0) <= COALESCE(pt.paid_amount, 0) THEN 'PAID'
                WHEN COALESCE(pt.paid_amount, 0) > 0 THEN 'PARTIAL'
                ELSE 'UNPAID'
              END as status
       FROM fee_vouchers v
       JOIN student_class_history sch ON v.student_class_history_id = sch.id
       JOIN students s ON sch.student_id = s.id
       JOIN classes c ON sch.class_id = c.id
       JOIN sections sec ON sch.section_id = sec.id
       LEFT JOIN VoucherTotals vt ON v.id = vt.voucher_id
       LEFT JOIN PaymentTotals pt ON v.id = pt.voucher_id
       WHERE v.id = $1`,
      [voucherId]
    );

    return result.rows[0];
  }

  /**
   * Get payment history for a voucher
   * GET /api/fees/voucher/:id/payments
   */
  async getVoucherPayments(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `SELECT * FROM fee_payments 
         WHERE voucher_id = $1 
         ORDER BY payment_date DESC`,
        [id]
      );

      const status = await this.getVoucherStatus(client, id);

      return ApiResponse.success(res, {
        voucher: status,
        payments: result.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get all payments with filters
   * GET /api/fees/payments
   */
  async listPayments(req, res, next) {
    const client = await pool.connect();
    try {
      const {
        student_id,
        class_id,
        section_id,
        month,
        from_date,
        to_date,
        page,
        limit
      } = req.query;

      let query = `
        SELECT p.*,
               s.name as student_name,
               s.roll_no,
               c.name as class_name,
               sec.name as section_name,
               v.month,
               SUM(vi.amount) as total_fee
        FROM fee_payments p
        JOIN fee_vouchers v ON p.voucher_id = v.id
        JOIN student_class_history sch ON v.student_class_history_id = sch.id
        JOIN students s ON sch.student_id = s.id
        JOIN classes c ON sch.class_id = c.id
        JOIN sections sec ON sch.section_id = sec.id
        JOIN fee_voucher_items vi ON v.id = vi.voucher_id
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

      const normalizedMonth = month
        ? (/^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month)
        : null;

      if (normalizedMonth) {
        query += ` AND DATE_TRUNC('month', v.month) = DATE_TRUNC('month', $${paramCount}::date)`;
        params.push(normalizedMonth);
        paramCount++;
      }

      if (from_date) {
        query += ` AND p.payment_date >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        query += ` AND p.payment_date <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      query += ` GROUP BY p.id, s.name, s.roll_no, c.name, sec.name, v.month`;

      // Count total
      let countQuery = `
        SELECT COUNT(DISTINCT p.id) as count
        FROM fee_payments p
        JOIN fee_vouchers v ON p.voucher_id = v.id
        JOIN student_class_history sch ON v.student_class_history_id = sch.id
        JOIN students s ON sch.student_id = s.id
        JOIN classes c ON sch.class_id = c.id
        JOIN sections sec ON sch.section_id = sec.id
        WHERE 1=1
      `;

      const countParams = [];
      let countParamCount = 1;

      if (student_id) {
        countQuery += ` AND s.id = $${countParamCount}`;
        countParams.push(student_id);
        countParamCount++;
      }

      if (class_id) {
        countQuery += ` AND c.id = $${countParamCount}`;
        countParams.push(class_id);
        countParamCount++;
      }

      if (section_id) {
        countQuery += ` AND sec.id = $${countParamCount}`;
        countParams.push(section_id);
        countParamCount++;
      }

      if (normalizedMonth) {
        countQuery += ` AND DATE_TRUNC('month', v.month) = DATE_TRUNC('month', $${countParamCount}::date)`;
        countParams.push(normalizedMonth);
        countParamCount++;
      }

      if (from_date) {
        countQuery += ` AND p.payment_date >= $${countParamCount}`;
        countParams.push(from_date);
        countParamCount++;
      }

      if (to_date) {
        countQuery += ` AND p.payment_date <= $${countParamCount}`;
        countParams.push(to_date);
        countParamCount++;
      }

      const countResult = await client.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      // Add ordering
      query += ` ORDER BY p.payment_date DESC, p.created_at DESC`;

      // Apply pagination only when a limit is explicitly provided.
      // If no limit is sent, return all matching rows.
      let pagination = null;
      if (limit !== undefined && String(limit).trim() !== '') {
        const limitNum = Math.max(parseInt(limit, 10) || 1, 1);
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const offsetNum = (pageNum - 1) * limitNum;

        query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limitNum, offsetNum);

        pagination = { page: pageNum, limit: limitNum, total };
      } else {
        pagination = { page: 1, limit: total || 1, total };
      }

      const result = await client.query(query, params);

      return ApiResponse.paginated(
        res,
        result.rows,
        pagination,
        'Payments retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get defaulters list
   * GET /api/fees/defaulters
   */
  async getDefaulters(req, res, next) {
    const client = await pool.connect();
    try {
      const {
        class_id,
        section_id,
        min_due_amount = 0,
        overdue_only = 'false',
        month
      } = req.query;

      const params = [];
      let paramCount = 1;
      let voucherMonthFilterClause = '';

      if (month) {
        const normalizedMonth = /^\d{4}-\d{2}$/.test(month)
          ? `${month}-01`
          : month;

        voucherMonthFilterClause = ` AND DATE_TRUNC('month', v.month) = DATE_TRUNC('month', $${paramCount}::date)`;
        params.push(normalizedMonth);
        paramCount++;
      }

      let query = `
        WITH voucher_financials AS (
          SELECT
            sch.student_id,
            v.id as voucher_id,
            v.month,
            v.due_date,
            COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) as voucher_total,
            COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.voucher_id = v.id), 0) as paid_total,
            GREATEST(
              COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) -
              COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.voucher_id = v.id), 0),
              0
            ) as due_amount
          FROM fee_vouchers v
          JOIN student_class_history sch ON v.student_class_history_id = sch.id
          LEFT JOIN fee_voucher_items vi ON vi.voucher_id = v.id
          WHERE 1=1
            ${voucherMonthFilterClause}
          GROUP BY sch.student_id, v.id, v.month, v.due_date
        ),
        student_financials AS (
          SELECT
            student_id,
            COUNT(*) FILTER (WHERE due_amount > 0) as total_vouchers,
            COALESCE(SUM(voucher_total), 0) as total_fee,
            COALESCE(SUM(paid_total), 0) as paid_amount,
            COALESCE(SUM(due_amount), 0) as due_amount,
            BOOL_OR(due_amount > 0 AND due_date IS NOT NULL AND due_date < CURRENT_DATE) as has_overdue_due
          FROM voucher_financials
          GROUP BY student_id
        )
        SELECT
          s.id as student_id,
          s.name as student_name,
          s.roll_no,
          s.phone,
          s.father_name,
          c.id as class_id,
          c.name as class_name,
          sec.id as section_id,
          sec.name as section_name,
          sf.total_vouchers,
          sf.total_fee,
          sf.paid_amount,
          sf.due_amount,
          sf.has_overdue_due
        FROM students s
        JOIN student_class_history sch_curr
          ON s.id = sch_curr.student_id AND sch_curr.end_date IS NULL
        JOIN classes c ON sch_curr.class_id = c.id
        JOIN sections sec ON sch_curr.section_id = sec.id
        JOIN student_financials sf ON sf.student_id = s.id
        WHERE s.is_active = true
          AND sf.due_amount > 0
      `;

      if (class_id) {
        query += ` AND sch_curr.class_id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      if (section_id) {
        query += ` AND sch_curr.section_id = $${paramCount}`;
        params.push(section_id);
        paramCount++;
      }

      // Filter by overdue latest voucher only
      if (overdue_only === 'true') {
        query += ` AND sf.has_overdue_due = true`;
      }

      if (min_due_amount > 0) {
        query += ` AND sf.due_amount >= $${paramCount}`;
        params.push(min_due_amount);
        paramCount++;
      }

      query += ` ORDER BY sf.due_amount DESC, s.name`;

      const result = await client.query(query, params);

      // Get guardian info for each defaulter
      const defaultersWithGuardians = await Promise.all(
        result.rows.map(async (defaulter) => {
          const guardians = await client.query(
            `SELECT g.name, g.phone, sg.relation 
             FROM guardians g
             JOIN student_guardians sg ON g.id = sg.guardian_id
             WHERE sg.student_id = $1`,
            [defaulter.student_id]
          );
          return {
            ...defaulter,
            guardians: guardians.rows
          };
        })
      );

      // Calculate summary
      const summary = {
        total_defaulters: defaultersWithGuardians.length,
        total_due_amount: defaultersWithGuardians.reduce((sum, d) => sum + parseFloat(d.due_amount), 0)
      };

      return ApiResponse.success(res, {
        summary,
        defaulters: defaultersWithGuardians
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get student fee history
   * GET /api/fees/student/:id
   */
  async getStudentFeeHistory(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Get all vouchers with payment status
      const result = await client.query(
        `SELECT v.id as voucher_id,
                CONCAT('V-', v.id) as voucher_no,
                v.month,
                v.created_at,
          v.voucher_type,
                c.name as class_name,
          c.class_type,
                sec.name as section_name,
                (SELECT COALESCE(SUM(CASE WHEN vi.item_type = 'ARREARS' THEN 0 ELSE COALESCE(vi.amount, 0) END), 0) FROM fee_voucher_items vi WHERE vi.voucher_id = v.id) as total_fee,
                (SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp WHERE fp.voucher_id = v.id) as paid_amount,
                GREATEST(
                  (SELECT COALESCE(SUM(CASE WHEN vi.item_type = 'ARREARS' THEN 0 ELSE COALESCE(vi.amount, 0) END), 0) FROM fee_voucher_items vi WHERE vi.voucher_id = v.id) -
                  (SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp WHERE fp.voucher_id = v.id),
                  0
                ) as due_amount,
                CASE 
                  WHEN (SELECT COALESCE(SUM(CASE WHEN vi.item_type = 'ARREARS' THEN 0 ELSE COALESCE(vi.amount, 0) END), 0) FROM fee_voucher_items vi WHERE vi.voucher_id = v.id) <= 
                       (SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp WHERE fp.voucher_id = v.id) THEN 'PAID'
                  WHEN (SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp WHERE fp.voucher_id = v.id) > 0 THEN 'PARTIAL'
                  ELSE 'UNPAID'
                END as status,
                (SELECT json_agg(json_build_object(
                  'item_type', vi.item_type,
                  'amount', vi.amount,
                  'description', vi.description,
                  'item_label', CASE
                    WHEN vi.item_type = 'ARREARS' THEN COALESCE(vi.description, 'Dues')
                    WHEN vi.item_type = 'YEARLY_PACKAGE' THEN COALESCE(vi.description, 'Annual Package')
                    ELSE vi.item_type
                  END
                ))
                FROM fee_voucher_items vi
                WHERE vi.voucher_id = v.id) as items,
                (SELECT json_agg(json_build_object(
                  'amount', fp.amount,
                  'payment_date', fp.payment_date,
                  'created_at', fp.created_at
                ))
                FROM fee_payments fp
                WHERE fp.voucher_id = v.id) as payments
         FROM fee_vouchers v
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         JOIN classes c ON sch.class_id = c.id
         JOIN sections sec ON sch.section_id = sec.id
         WHERE sch.student_id = $1
         ORDER BY v.month DESC`,
        [id]
      );

      // Calculate summary
      const summary = {
        total_vouchers: result.rows.length,
        paid_vouchers: result.rows.filter(v => v.status === 'PAID').length,
        unpaid_vouchers: result.rows.filter(v => v.status === 'UNPAID').length,
        partial_vouchers: result.rows.filter(v => v.status === 'PARTIAL').length,
        total_fee: result.rows.reduce((sum, v) => sum + parseFloat(v.total_fee), 0),
        total_paid: result.rows.reduce((sum, v) => sum + parseFloat(v.paid_amount), 0),
        total_due: result.rows.reduce((sum, v) => sum + parseFloat(v.due_amount), 0)
      };

      return ApiResponse.success(res, {
        summary,
        vouchers: result.rows,
        history: result.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get student current due amount
   * GET /api/fees/student/:id/due
   */
  async getStudentDue(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `WITH voucher_financials AS (
           SELECT
             v.id as voucher_id,
             v.month,
             COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) as base_total,
             COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.voucher_id = v.id), 0) as paid_total
           FROM student_class_history sch
           JOIN fee_vouchers v ON sch.id = v.student_class_history_id
           LEFT JOIN fee_voucher_items vi ON vi.voucher_id = v.id
           WHERE sch.student_id = $1
           GROUP BY v.id, v.month
         )
         SELECT
           s.id as student_id,
           s.name as student_name,
           s.roll_no,
           COUNT(*) FILTER (WHERE GREATEST(vf.base_total - vf.paid_total, 0) > 0) as unpaid_vouchers,
           COALESCE(SUM(GREATEST(vf.base_total - vf.paid_total, 0)), 0) as total_due
         FROM students s
         LEFT JOIN voucher_financials vf ON true
         WHERE s.id = $1
         GROUP BY s.id, s.name, s.roll_no`,
        [id]
      );

      if (result.rows.length === 0 || result.rows[0].total_due == 0) {
        return ApiResponse.success(res, {
          student_id: parseInt(id),
          total_due: 0,
          unpaid_vouchers: 0,
          message: 'No pending dues'
        });
      }

      return ApiResponse.success(res, result.rows[0]);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get fee collection statistics
   * GET /api/fees/stats
   */
  async getStats(req, res, next) {
    const client = await pool.connect();
    try {
      const { from_date, to_date, class_id } = req.query;

      let dateFilter = '';
      const params = [];
      let paramCount = 1;

      if (from_date) {
        dateFilter += ` AND p.payment_date >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        dateFilter += ` AND p.payment_date <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      let classFilter = '';
      if (class_id) {
        classFilter = ` AND c.id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      const stats = await client.query(`
        WITH voucher_totals AS (
          SELECT 
            v.id as voucher_id,
            sch.student_id,
            c.id as class_id,
            SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END) as voucher_total,
            COALESCE((
              SELECT SUM(p.amount) 
              FROM fee_payments p 
              WHERE p.voucher_id = v.id ${dateFilter}
            ), 0) as paid_total,
            CASE 
              WHEN SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END) <= COALESCE((
                SELECT SUM(p2.amount) 
                FROM fee_payments p2 
                WHERE p2.voucher_id = v.id
              ), 0) THEN 'PAID'
              WHEN COALESCE((
                SELECT SUM(p3.amount) 
                FROM fee_payments p3 
                WHERE p3.voucher_id = v.id
              ), 0) > 0 THEN 'PARTIAL'
              ELSE 'UNPAID'
            END as status
          FROM fee_vouchers v
          JOIN student_class_history sch ON v.student_class_history_id = sch.id
          JOIN classes c ON sch.class_id = c.id
          JOIN fee_voucher_items vi ON v.id = vi.voucher_id
          WHERE 1=1 ${classFilter}
          GROUP BY v.id, sch.student_id, c.id
        ),
        payment_counts AS (
          SELECT COUNT(DISTINCT p.id) as total_payments
          FROM fee_payments p
          WHERE 1=1 ${dateFilter.replace(/p\./g, 'p.')}
        )
        SELECT 
          COUNT(DISTINCT voucher_id) as total_vouchers,
          COUNT(DISTINCT CASE WHEN status = 'PAID' THEN voucher_id END) as paid_vouchers,
          COUNT(DISTINCT CASE WHEN status = 'UNPAID' THEN voucher_id END) as unpaid_vouchers,
          COUNT(DISTINCT CASE WHEN status = 'PARTIAL' THEN voucher_id END) as partial_vouchers,
          COALESCE(SUM(voucher_total), 0) as total_fee_generated,
          COALESCE(SUM(paid_total), 0) as total_collected,
          COALESCE(SUM(GREATEST(voucher_total - paid_total, 0)), 0) as total_pending,
          (SELECT total_payments FROM payment_counts) as total_payments,
          COUNT(DISTINCT student_id) as total_students
        FROM voucher_totals
      `, params);

      return ApiResponse.success(res, stats.rows[0]);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete a payment (Admin only - for corrections)
   * DELETE /api/fees/payment/:id
   */
  async deletePayment(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      const result = await client.query(
        'DELETE FROM fee_payments WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Payment not found', 404);
      }

      const deletedPayment = result.rows[0];

      const studentResult = await client.query(
        `SELECT sch.student_id
         FROM fee_vouchers v
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         WHERE v.id = $1`,
        [deletedPayment.voucher_id]
      );

      if (studentResult.rows.length > 0) {
        await this.resyncStudentVoucherDues(client, studentResult.rows[0].student_id);
      }

      await client.query('COMMIT');

      return ApiResponse.success(res, deletedPayment, 'Payment deleted successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Download payment receipt as PDF
   * GET /api/fees/payment/:id/receipt
   */
  async downloadReceipt(req, res, next) {
    try {
      const { id } = req.params;
      const pdfService = require('../services/pdf.service');

      const { filepath, filename } = await pdfService.generatePaymentReceipt(id, 'fee');

      res.download(filepath, filename, (err) => {
        // Clean up the file after sending
        const fs = require('fs');
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }

        if (err) {
          next(error);
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FeesController();
