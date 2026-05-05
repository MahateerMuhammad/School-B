const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Student Fee Overrides Controller
 * Manages per-student fee overrides
 */
class StudentFeeOverridesController {
  constructor() {
    this.setOverride = this.setOverride.bind(this);
    this.getOverride = this.getOverride.bind(this);
    this.removeOverride = this.removeOverride.bind(this);
    this.listOverrides = this.listOverrides.bind(this);
  }

  /**
   * Set or update fee override for a student
   * POST /api/student-fee-overrides
   */
  async setOverride(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { student_id, class_id, admission_fee, monthly_fee, paper_fund, reason, discount_description } = req.body;

      // Validate input
      const schema = Joi.object({
        student_id: Joi.number().integer().required(),
        class_id: Joi.number().integer().required(),
        admission_fee: Joi.number().allow(null).optional(),
        monthly_fee: Joi.number().allow(null).optional(),
        paper_fund: Joi.number().allow(null).optional(),
        reason: Joi.string().optional().allow('', null),
        discount_description: Joi.string().optional().allow('', null)
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Verify student exists
      const studentCheck = await client.query(
        'SELECT id, name FROM students WHERE id = $1',
        [student_id]
      );

      if (studentCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      // Verify class exists
      const classCheck = await client.query(
        'SELECT id, name FROM classes WHERE id = $1',
        [class_id]
      );

      if (classCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Class not found', 404);
      }

      // Check if override already exists
      const existingOverride = await client.query(
        'SELECT id FROM student_fee_overrides WHERE student_id = $1 AND class_id = $2',
        [student_id, class_id]
      );

      let result;
      if (existingOverride.rows.length > 0) {
        // Update existing override
        result = await client.query(
          `UPDATE student_fee_overrides 
           SET admission_fee = $1, monthly_fee = $2, paper_fund = $3, reason = $4, discount_description = $5, applied_by = $6
           WHERE student_id = $7 AND class_id = $8
           RETURNING *`,
          [
            admission_fee,
            monthly_fee,
            paper_fund,
            reason || null,
            discount_description || null,
            req.user.id,
            student_id,
            class_id
          ]
        );
      } else {
        // Create new override
        result = await client.query(
          `INSERT INTO student_fee_overrides 
           (student_id, class_id, admission_fee, monthly_fee, paper_fund, reason, discount_description, applied_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [student_id, class_id, admission_fee, monthly_fee, paper_fund, reason || null, discount_description || null, req.user.id]
        );
      }

      await client.query('COMMIT');

      return ApiResponse.success(
        res,
        {
          ...result.rows[0],
          student_name: studentCheck.rows[0].name,
          class_name: classCheck.rows[0].name
        },
        existingOverride.rows.length > 0 ? 'Fee override updated successfully' : 'Fee override created successfully'
      );
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get fee override for a student in a specific class
   * GET /api/student-fee-overrides/:student_id/class/:class_id
   */
  async getOverride(req, res, next) {
    const client = await pool.connect();
    try {
      const { student_id, class_id } = req.params;

      const result = await client.query(
        `SELECT sfo.*, s.name as student_name, c.name as class_name, u.email as applied_by_email
         FROM student_fee_overrides sfo
         JOIN students s ON sfo.student_id = s.id
         JOIN classes c ON sfo.class_id = c.id
         LEFT JOIN users u ON sfo.applied_by = u.id
         WHERE sfo.student_id = $1 AND sfo.class_id = $2`,
        [student_id, class_id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Fee override not found', 404);
      }

      return ApiResponse.success(res, result.rows[0]);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Remove fee override for a student
   * DELETE /api/student-fee-overrides/:student_id/class/:class_id
   */
  async removeOverride(req, res, next) {
    const client = await pool.connect();
    try {
      const { student_id, class_id } = req.params;

      const result = await client.query(
        'DELETE FROM student_fee_overrides WHERE student_id = $1 AND class_id = $2 RETURNING *',
        [student_id, class_id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Fee override not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Fee override removed successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List all fee overrides with optional filters
   * GET /api/student-fee-overrides
   */
  async listOverrides(req, res, next) {
    const client = await pool.connect();
    try {
      const { student_id, class_id, page = 1, limit = 500 } = req.query;

      let query = `
        SELECT sfo.*, s.name as student_name, s.roll_no, c.name as class_name, u.email as applied_by_email
        FROM student_fee_overrides sfo
        JOIN students s ON sfo.student_id = s.id
        JOIN classes c ON sfo.class_id = c.id
        LEFT JOIN users u ON sfo.applied_by = u.id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (student_id) {
        query += ` AND sfo.student_id = $${paramCount}`;
        params.push(student_id);
        paramCount++;
      }

      if (class_id) {
        query += ` AND sfo.class_id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      // Count total
      const countQuery = `SELECT COUNT(*) FROM (${query}) as counted`;
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      query += ` ORDER BY sfo.created_at DESC`;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);

      return ApiResponse.paginated(
        res,
        result.rows,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Fee overrides retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new StudentFeeOverridesController();
