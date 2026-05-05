const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Faculty Controller
 * Handles faculty member management and salary structure
 */
class FacultyController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.create = this.create.bind(this);
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.update = this.update.bind(this);
    this.delete = this.delete.bind(this);
    this.activate = this.activate.bind(this);
    this.deactivate = this.deactivate.bind(this);
    this.updateSalary = this.updateSalary.bind(this);
    this.getSalaryHistory = this.getSalaryHistory.bind(this);
    this.getStats = this.getStats.bind(this);
  }

  /**
   * Create new faculty member
   * POST /api/faculty
   */
  async create(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        name,
        father_or_husband,
        cnic,
        phone,
        gender,
        role,
        subject,
        base_salary
      } = req.body;

      // Validate input
      const schema = Joi.object({
        name: Joi.string().required(),
        father_or_husband: Joi.string().optional().allow(null, ''),
        cnic: Joi.string().optional().allow(null, ''),
        phone: Joi.string().optional().allow(null, ''),
        gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').optional().allow(null, ''),
        role: Joi.string().optional().allow(null, ''),
        subject: Joi.string().optional().allow(null, ''),
        base_salary: Joi.number().positive().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check for duplicate CNIC if provided
      if (cnic) {
        const duplicateCheck = await client.query(
          'SELECT id FROM faculty WHERE cnic = $1',
          [cnic]
        );

        if (duplicateCheck.rows.length > 0) {
          return ApiResponse.error(res, 'Faculty member with this CNIC already exists', 409);
        }
      }

      // Insert faculty member
      const facultyResult = await client.query(
        `INSERT INTO faculty 
         (name, father_or_husband, cnic, phone, gender, role, subject)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [name, father_or_husband, cnic, phone, gender, role, subject]
      );

      const faculty = facultyResult.rows[0];

      // Create initial salary structure
      await client.query(
        `INSERT INTO salary_structure 
         (faculty_id, effective_from, base_salary)
         VALUES ($1, CURRENT_DATE, $2)`,
        [faculty.id, base_salary]
      );

      await client.query('COMMIT');

      // Fetch complete faculty data
      const complete = await this.getFacultyById(client, faculty.id);

      return ApiResponse.created(res, complete, 'Faculty member created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Get complete faculty data
   */
  async getFacultyById(client, facultyId) {
    const facultyResult = await client.query(
      'SELECT * FROM faculty WHERE id = $1',
      [facultyId]
    );

    if (facultyResult.rows.length === 0) {
      return null;
    }

    const faculty = facultyResult.rows[0];

    // Get current salary structure
    const salaryResult = await client.query(
      `SELECT * FROM salary_structure 
       WHERE faculty_id = $1 
       ORDER BY effective_from DESC 
       LIMIT 1`,
      [facultyId]
    );

    // Get salary history count
    const historyCount = await client.query(
      'SELECT COUNT(*) as count FROM salary_structure WHERE faculty_id = $1',
      [facultyId]
    );

    return {
      ...faculty,
      current_salary_structure: salaryResult.rows[0] || null,
      salary_history_count: parseInt(historyCount.rows[0].count)
    };
  }

  /**
   * Get faculty by ID
   * GET /api/faculty/:id
   */
  async getById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const faculty = await this.getFacultyById(client, id);

      if (!faculty) {
        return ApiResponse.error(res, 'Faculty member not found', 404);
      }

      return ApiResponse.success(res, faculty);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List faculty members with filters
   * GET /api/faculty
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const {
        is_active,
        role,
        search,
        page = 1,
        limit = 500
      } = req.query;

      let query = `
        SELECT f.*,
               (SELECT json_build_object(
                 'id', ss.id,
                 'base_salary', ss.base_salary,
                 'effective_from', ss.effective_from
               )
               FROM salary_structure ss
               WHERE ss.faculty_id = f.id
               ORDER BY ss.effective_from DESC
               LIMIT 1) as current_salary_structure
        FROM faculty f
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (is_active !== undefined) {
        query += ` AND f.is_active = $${paramCount}`;
        params.push(is_active === 'true');
        paramCount++;
      }

      if (role) {
        query += ` AND f.role ILIKE $${paramCount}`;
        params.push(`%${role}%`);
        paramCount++;
      }

      if (search) {
        query += ` AND (f.name ILIKE $${paramCount} OR f.cnic ILIKE $${paramCount} OR f.phone ILIKE $${paramCount})`;
        params.push(`%${search}%`);
        paramCount++;
      }

      // Count total
      const countQuery = `
        SELECT COUNT(*) as count
        FROM faculty f
        WHERE 1=1
        ${is_active !== undefined ? ` AND f.is_active = ${is_active === 'true'}` : ''}
        ${role ? ` AND f.role ILIKE '%${role}%'` : ''}
        ${search ? ` AND (f.name ILIKE '%${search}%' OR f.cnic ILIKE '%${search}%' OR f.phone ILIKE '%${search}%')` : ''}
      `;

      const countResult = await client.query(countQuery);
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      query += ` ORDER BY f.name LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);

      return ApiResponse.paginated(
        res,
        result.rows,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Faculty members retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update faculty member
   * PUT /api/faculty/:id
   */
  async update(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const updates = req.body;

      // Remove fields that shouldn't be updated directly
      delete updates.id;
      delete updates.created_at;
      delete updates.salary_structure;

      const fields = Object.keys(updates);
      const values = Object.values(updates);

      if (fields.length === 0) {
        return ApiResponse.error(res, 'No fields to update', 400);
      }

      // Check if faculty exists
      const existCheck = await client.query(
        'SELECT id FROM faculty WHERE id = $1',
        [id]
      );

      if (existCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Faculty member not found', 404);
      }

      const setClause = fields.map((field, index) =>
        `${field} = $${index + 1}`
      ).join(', ');

      values.push(id);

      const result = await client.query(
        `UPDATE faculty SET ${setClause} WHERE id = $${values.length} RETURNING *`,
        values
      );

      return ApiResponse.success(res, result.rows[0], 'Faculty member updated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update salary structure (creates new version)
   * PUT /api/faculty/:id/salary
   */
  async updateSalary(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { base_salary, effective_from } = req.body;

      // Validate input
      const schema = Joi.object({
        base_salary: Joi.number().positive().required(),
        effective_from: Joi.date().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if faculty exists and is active
      const facultyCheck = await client.query(
        'SELECT id, name, is_active FROM faculty WHERE id = $1',
        [id]
      );

      if (facultyCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Faculty member not found', 404);
      }

      if (!facultyCheck.rows[0].is_active) {
        return ApiResponse.error(res, 'Cannot update salary for inactive faculty member', 400);
      }

      // Check for existing salary structure on same date
      const duplicateCheck = await client.query(
        `SELECT id FROM salary_structure 
         WHERE faculty_id = $1 AND DATE(effective_from) = DATE($2::timestamp)`,
        [id, effective_from]
      );

      if (duplicateCheck.rows.length > 0) {
        return ApiResponse.error(
          res,
          'Salary structure already exists for this effective date',
          409
        );
      }

      // Insert new salary structure
      const result = await client.query(
        `INSERT INTO salary_structure 
         (faculty_id, base_salary, effective_from)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, base_salary, effective_from]
      );

      await client.query('COMMIT');

      return ApiResponse.created(
        res,
        result.rows[0],
        'Salary structure updated successfully'
      );
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get salary structure history
   * GET /api/faculty/:id/salary-history
   */
  async getSalaryHistory(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Check if faculty exists
      const facultyCheck = await client.query(
        'SELECT id, name FROM faculty WHERE id = $1',
        [id]
      );

      if (facultyCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Faculty member not found', 404);
      }

      const result = await client.query(
        `SELECT * FROM salary_structure 
         WHERE faculty_id = $1 
         ORDER BY effective_from DESC`,
        [id]
      );

      return ApiResponse.success(res, {
        faculty: facultyCheck.rows[0],
        salary_history: result.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Activate faculty member
   * PUT /api/faculty/:id/activate
   */
  async activate(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'UPDATE faculty SET is_active = true WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Faculty member not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Faculty member activated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Deactivate faculty member
   * PUT /api/faculty/:id/deactivate
   */
  async deactivate(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'UPDATE faculty SET is_active = false WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Faculty member not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Faculty member deactivated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete faculty member (only if no salary history)
   * DELETE /api/faculty/:id
   */
  async delete(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Check if faculty has any salary vouchers
      const voucherCheck = await client.query(
        'SELECT COUNT(*) as count FROM salary_vouchers WHERE faculty_id = $1',
        [id]
      );

      if (parseInt(voucherCheck.rows[0].count) > 0) {
        return ApiResponse.error(
          res,
          'Cannot delete faculty member with existing salary vouchers. Deactivate instead.',
          400
        );
      }

      // Delete salary structure history
      await client.query(
        'DELETE FROM salary_structure WHERE faculty_id = $1',
        [id]
      );

      // Delete faculty member
      const result = await client.query(
        'DELETE FROM faculty WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Faculty member not found', 404);
      }

      await client.query('COMMIT');

      return ApiResponse.success(res, result.rows[0], 'Faculty member deleted successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get faculty statistics
   * GET /api/faculty/stats
   */
  async getStats(req, res, next) {
    const client = await pool.connect();
    try {
      const stats = await client.query(`
        SELECT 
          COUNT(*) as total_faculty,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_faculty,
          COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_faculty,
          COUNT(DISTINCT role) as total_roles,
          (SELECT AVG(base_salary) 
           FROM salary_structure ss
           WHERE ss.id IN (
             SELECT DISTINCT ON (faculty_id) id
             FROM salary_structure
             ORDER BY faculty_id, effective_from DESC
           )) as average_salary
        FROM faculty
      `);

      return ApiResponse.success(res, stats.rows[0]);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new FacultyController();
