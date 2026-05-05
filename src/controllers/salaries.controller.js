const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Salaries Controller
 * Handles salary voucher generation, adjustments, and payments
 */
class SalariesController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.generate = this.generate.bind(this);
    this.generateBulk = this.generateBulk.bind(this);
    this.getVoucherById = this.getVoucherById.bind(this);
    this.listVouchers = this.listVouchers.bind(this);
    this.addAdjustment = this.addAdjustment.bind(this);
    this.recordPayment = this.recordPayment.bind(this);
    this.getUnpaid = this.getUnpaid.bind(this);
    this.getStats = this.getStats.bind(this);
    this.deleteVoucher = this.deleteVoucher.bind(this);
    this.downloadPDF = this.downloadPDF.bind(this);
  }

  /**
   * Generate salary voucher for faculty member
   * POST /api/salaries/generate
   */
  async generate(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { faculty_id, month, adjustments = [] } = req.body;

      // Validate input
      const schema = Joi.object({
        faculty_id: Joi.number().integer().required(),
        month: Joi.date().required(),
        adjustments: Joi.array().items(
          Joi.object({
            type: Joi.string().valid('BONUS', 'ADVANCE').required(),
            amount: Joi.number().positive().required(),
            calc_type: Joi.string().valid('FLAT', 'PERCENTAGE').required()
          })
        ).optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if faculty member exists and is active
      const facultyCheck = await client.query(
        'SELECT id, name, is_active FROM faculty WHERE id = $1',
        [faculty_id]
      );

      if (facultyCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Faculty member not found', 404);
      }

      if (!facultyCheck.rows[0].is_active) {
        return ApiResponse.error(res, 'Cannot generate salary for inactive faculty member', 400);
      }

      // Check for duplicate voucher for the same month
      const duplicateCheck = await client.query(
        `SELECT id FROM salary_vouchers 
         WHERE faculty_id = $1 
         AND DATE_TRUNC('month', month) = DATE_TRUNC('month', $2::date)`,
        [faculty_id, month]
      );

      if (duplicateCheck.rows.length > 0) {
        return ApiResponse.error(
          res,
          `Salary voucher already exists for ${facultyCheck.rows[0].name} for the specified month`,
          400
        );
      }

      // Get current salary structure
      // Use DATE_TRUNC for month-level comparison to avoid timezone issues
      // effective_from should be <= the first day of the voucher month
      const salaryStructure = await client.query(
        `SELECT * FROM salary_structure 
         WHERE faculty_id = $1::int 
         AND DATE_TRUNC('month', effective_from) <= DATE_TRUNC('month', $2::date)
         ORDER BY effective_from DESC 
         LIMIT 1`,
        [faculty_id, month]
      );

      if (salaryStructure.rows.length === 0) {
        return ApiResponse.error(res, 'No salary structure found for this faculty member', 404);
      }

      // Create salary voucher
      const voucherResult = await client.query(
        `INSERT INTO salary_vouchers 
         (faculty_id, month)
         VALUES ($1, $2)
         RETURNING *`,
        [faculty_id, month]
      );

      const voucher = voucherResult.rows[0];

      // Add adjustments
      for (const adjustment of adjustments) {
        await client.query(
          `INSERT INTO salary_adjustments 
           (voucher_id, type, amount, calc_type)
           VALUES ($1, $2, $3, $4)`,
          [voucher.id, adjustment.type, adjustment.amount, adjustment.calc_type]
        );
      }

      await client.query('COMMIT');

      // Fetch complete voucher details
      const complete = await this.getVoucherDetails(client, voucher.id);

      return ApiResponse.created(res, complete, 'Salary voucher generated successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Generate bulk salary vouchers
   * POST /api/salaries/generate-bulk
   */
  async generateBulk(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { month, faculty_ids = [] } = req.body;

      // Validate input
      const schema = Joi.object({
        month: Joi.date().required(),
        faculty_ids: Joi.array().items(Joi.number().integer()).optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Get active faculty members
      let query = 'SELECT id, name FROM faculty WHERE is_active = true';
      const params = [];

      if (faculty_ids.length > 0) {
        query += ' AND id = ANY($1::int[])';
        params.push(faculty_ids);
      }

      const facultyResult = await client.query(query, params);

      if (facultyResult.rows.length === 0) {
        return ApiResponse.error(res, 'No active faculty members found', 404);
      }

      const results = {
        generated: [],
        skipped: [],
        failed: []
      };

      // Generate voucher for each faculty member
      for (const faculty of facultyResult.rows) {
        try {
          // Check for duplicate
          const duplicateCheck = await client.query(
            `SELECT id FROM salary_vouchers 
             WHERE faculty_id = $1 
             AND DATE_TRUNC('month', month) = DATE_TRUNC('month', $2::date)`,
            [faculty.id, month]
          );

          if (duplicateCheck.rows.length > 0) {
            results.skipped.push({
              faculty_id: faculty.id,
              faculty_name: faculty.name,
              reason: 'Voucher already exists for this month'
            });
            continue;
          }

          // Get salary structure
          const salaryStructure = await client.query(
            `SELECT * FROM salary_structure 
             WHERE faculty_id = $1::int 
             AND DATE_TRUNC('month', effective_from) <= DATE_TRUNC('month', $2::date)
             ORDER BY effective_from DESC 
             LIMIT 1`,
            [faculty.id, month]
          );

          if (salaryStructure.rows.length === 0) {
            results.failed.push({
              faculty_id: faculty.id,
              faculty_name: faculty.name,
              error: 'No salary structure found'
            });
            continue;
          }

          const salary = salaryStructure.rows[0];

          // Create voucher
          const voucherResult = await client.query(
            `INSERT INTO salary_vouchers 
             (faculty_id, month)
             VALUES ($1, $2)
             RETURNING *`,
            [faculty.id, month]
          );

          results.generated.push({
            faculty_id: faculty.id,
            faculty_name: faculty.name,
            voucher_id: voucherResult.rows[0].id,
            base_salary: salary.base_salary
          });
        } catch (itemError) {
          results.failed.push({
            faculty_id: faculty.id,
            faculty_name: faculty.name,
            error: itemError.message
          });
        }
      }

      await client.query('COMMIT');

      return ApiResponse.success(res, {
        summary: {
          total: facultyResult.rows.length,
          generated: results.generated.length,
          skipped: results.skipped.length,
          failed: results.failed.length
        },
        details: results
      }, 'Bulk salary generation completed');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Get complete voucher details
   */
  /**
   * Helper method to get voucher details with calculated salary
   */
  async getVoucherDetails(client, voucherId) {
    const result = await client.query(
      `SELECT sv.*,
              f.name as faculty_name,
              f.role,
              f.cnic,
              (SELECT ss2.base_salary 
               FROM salary_structure ss2 
               WHERE ss2.faculty_id::int = sv.faculty_id::int 
               AND DATE_TRUNC('month', ss2.effective_from) <= DATE_TRUNC('month', sv.month::date)
               ORDER BY ss2.effective_from DESC 
               LIMIT 1) as base_salary,
              (SELECT json_agg(json_build_object(
                'id', sa.id,
                'type', sa.type,
                'amount', sa.amount,
                'calc_type', sa.calc_type
              ))
              FROM salary_adjustments sa
              WHERE sa.voucher_id = sv.id) as adjustments,
              (SELECT json_agg(json_build_object(
                'id', sp.id,
                'amount', sp.amount,
                'payment_date', sp.payment_date
              ))
              FROM salary_payments sp
              WHERE sp.voucher_id = sv.id) as payments
       FROM salary_vouchers sv
       JOIN faculty f ON sv.faculty_id = f.id
       WHERE sv.id = $1::int`,
      [voucherId]
    );

    const voucher = result.rows[0];
    if (!voucher) return null;

    // Calculate salary dynamically
    let base_salary = parseFloat(voucher.base_salary || 0);
    let gross_salary = base_salary;
    let net_salary = base_salary;

    // Process adjustments
    if (voucher.adjustments) {
      for (const adj of voucher.adjustments) {
        let adjustment_amount = parseFloat(adj.amount);
        
        // Calculate percentage if needed
        if (adj.calc_type === 'PERCENTAGE') {
          adjustment_amount = (base_salary * adjustment_amount) / 100;
        }

        if (adj.type === 'BONUS') {
          net_salary += adjustment_amount;
        } else if (adj.type === 'ADVANCE') {
          net_salary -= adjustment_amount;
        }
      }
    }

    // Calculate payment status
    const paid_amount = voucher.payments 
      ? voucher.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0) 
      : 0;
    const due_amount = net_salary - paid_amount;

    let status = 'UNPAID';
    if (paid_amount >= net_salary) status = 'PAID';
    else if (paid_amount > 0) status = 'PARTIAL';

    return {
      ...voucher,
      base_salary,
      gross_salary,
      net_salary,
      paid_amount,
      due_amount,
      status
    };
  }

  /**
   * Get voucher by ID
   * GET /api/salaries/voucher/:id
   */
  async getVoucherById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const voucher = await this.getVoucherDetails(client, id);

      if (!voucher) {
        return ApiResponse.error(res, 'Salary voucher not found', 404);
      }

      return ApiResponse.success(res, voucher);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List salary vouchers with filters
   * GET /api/salaries/vouchers
   */
  async listVouchers(req, res, next) {
    const client = await pool.connect();
    try {
      const {
        faculty_id,
        month,
        from_date,
        to_date,
        page = 1,
        limit = 50
      } = req.query;

      let query = `
        SELECT sv.*,
               f.name as faculty_name,
               f.role
        FROM salary_vouchers sv
        JOIN faculty f ON sv.faculty_id = f.id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (faculty_id) {
        query += ` AND sv.faculty_id = $${paramCount}`;
        params.push(faculty_id);
        paramCount++;
      }

      // Normalize month format: '2026-01' -> '2026-01-01'
      const monthDate = month ? (month.length === 7 ? `${month}-01` : month) : null;

      if (monthDate) {
        query += ` AND DATE_TRUNC('month', sv.month) = DATE_TRUNC('month', $${paramCount}::date)`;
        params.push(monthDate);
        paramCount++;
      }

      if (from_date) {
        query += ` AND sv.month >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        query += ` AND sv.month <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      // Count total
      const countQuery = `
        SELECT COUNT(*) as count
        FROM salary_vouchers sv
        WHERE 1=1
        ${faculty_id ? ` AND sv.faculty_id = ${faculty_id}` : ''}
        ${monthDate ? ` AND DATE_TRUNC('month', sv.month) = DATE_TRUNC('month', '${monthDate}'::date)` : ''}
        ${from_date ? ` AND sv.month >= '${from_date}'` : ''}
        ${to_date ? ` AND sv.month <= '${to_date}'` : ''}
      `;

      const countResult = await client.query(countQuery);
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      query += ` ORDER BY sv.month DESC, f.name LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);

      return ApiResponse.paginated(
        res,
        result.rows,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Salary vouchers retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Add adjustment to existing voucher
   * POST /api/salaries/voucher/:id/adjustment
   */
  async addAdjustment(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { type, amount, calc_type } = req.body;

      // Validate input
      const schema = Joi.object({
        type: Joi.string().valid('BONUS', 'ADVANCE').required(),
        amount: Joi.number().positive().required(),
        calc_type: Joi.string().valid('FLAT', 'PERCENTAGE').required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if voucher exists and has no payments
      const voucherCheck = await client.query(
        `SELECT sv.id
         FROM salary_vouchers sv
         WHERE sv.id = $1`,
        [id]
      );

      if (voucherCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Salary voucher not found', 404);
      }

      // Check if voucher has payments
      const paymentCheck = await client.query(
        `SELECT COUNT(*) as count FROM salary_payments WHERE voucher_id = $1`,
        [id]
      );

      if (parseInt(paymentCheck.rows[0].count) > 0) {
        return ApiResponse.error(
          res,
          'Cannot add adjustment to a voucher that has payments',
          400
        );
      }

      // Add adjustment
      await client.query(
        `INSERT INTO salary_adjustments 
         (voucher_id, type, amount, calc_type)
         VALUES ($1, $2, $3, $4)`,
        [id, type, amount, calc_type]
      );

      await client.query('COMMIT');

      // Fetch updated voucher
      const updated = await this.getVoucherDetails(client, id);

      return ApiResponse.success(res, updated, 'Adjustment added successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Record salary payment
   * POST /api/salaries/payment
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
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check voucher exists and get current status
      const voucherCheck = await client.query(
        `SELECT sv.id
         FROM salary_vouchers sv
         WHERE sv.id = $1`,
        [voucher_id]
      );

      if (voucherCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Salary voucher not found', 404);
      }

      // Get voucher details with calculated amounts
      const voucherDetails = await this.getVoucherDetails(client, voucher_id);
      const dueAmount = parseFloat(voucherDetails.due_amount || 0);

      // Validate payment amount
      if (amount > dueAmount) {
        return ApiResponse.error(
          res,
          `Payment amount (${amount}) exceeds due amount (${dueAmount})`,
          400
        );
      }

      // Record payment
      const result = await client.query(
        `INSERT INTO salary_payments (voucher_id, amount, payment_date)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [voucher_id, amount, payment_date || new Date()]
      );

      await client.query('COMMIT');

      // Get updated voucher status
      const updatedVoucher = await this.getVoucherDetails(client, voucher_id);

      return ApiResponse.created(res, {
        payment: result.rows[0],
        voucher_status: updatedVoucher
      }, 'Salary payment recorded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get unpaid salary vouchers
   * GET /api/salaries/unpaid
   */
  async getUnpaid(req, res, next) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT sv.*,
               f.name as faculty_name,
               f.role,
               f.phone
        FROM salary_vouchers sv
        JOIN faculty f ON sv.faculty_id = f.id
        ORDER BY sv.month DESC, f.name
      `);

      // Calculate details for each voucher
      const vouchers = [];
      for (const row of result.rows) {
        const details = await this.getVoucherDetails(client, row.id);
        if (details && details.status !== 'PAID') {
          vouchers.push(details);
        }
      }

      const summary = {
        total_unpaid: vouchers.length,
        total_due_amount: vouchers.reduce((sum, v) => sum + parseFloat(v.due_amount || 0), 0)
      };

      return ApiResponse.success(res, {
        summary,
        vouchers
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get salary statistics
   * GET /api/salaries/stats
   */
  async getStats(req, res, next) {
    const client = await pool.connect();
    try {
      const { from_date, to_date } = req.query;

      let dateFilter = '';
      const params = [];
      let paramCount = 1;

      if (from_date) {
        dateFilter += ` AND sv.month >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        dateFilter += ` AND sv.month <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      const stats = await client.query(`
        SELECT 
          COUNT(DISTINCT sv.id) as total_vouchers,
          COALESCE((SELECT SUM(amount) FROM salary_payments sp 
                    JOIN salary_vouchers sv2 ON sp.voucher_id = sv2.id 
                    WHERE 1=1 ${dateFilter}), 0) as total_paid,
          COUNT(DISTINCT sv.faculty_id) as total_faculty
        FROM salary_vouchers sv
        WHERE 1=1 ${dateFilter}
      `, params);

      return ApiResponse.success(res, stats.rows[0]);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete salary voucher (only if unpaid)
   * DELETE /api/salaries/voucher/:id
   */
  async deleteVoucher(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Check if voucher has payments
      const paymentCheck = await client.query(
        'SELECT COUNT(*) as count FROM salary_payments WHERE voucher_id = $1',
        [id]
      );

      if (parseInt(paymentCheck.rows[0].count) > 0) {
        return ApiResponse.error(
          res,
          'Cannot delete salary voucher with existing payments. Delete payments first.',
          400
        );
      }

      // Delete adjustments
      await client.query(
        'DELETE FROM salary_adjustments WHERE voucher_id = $1',
        [id]
      );

      // Delete voucher
      const result = await client.query(
        'DELETE FROM salary_vouchers WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Salary voucher not found', 404);
      }

      await client.query('COMMIT');

      return ApiResponse.success(res, result.rows[0], 'Salary voucher deleted successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
  
  /**
   * Download salary slip as PDF
   * GET /api/salaries/voucher/:id/pdf
   */
  async downloadPDF(req, res, next) {
    try {
      const { id } = req.params;
      const pdfService = require('../services/pdf.service');
      
      const { filepath, filename } = await pdfService.generateSalarySlip(id);
      
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
}

module.exports = new SalariesController();
