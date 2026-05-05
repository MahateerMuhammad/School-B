const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Guardians Controller
 * Manages guardian information and relationships with students
 */
class GuardiansController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.create = this.create.bind(this);
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.update = this.update.bind(this);
    this.delete = this.delete.bind(this);
  }

  /**
   * Create or link guardian to student
   * POST /api/guardians
   */
  async create(req, res, next) {
    const client = await pool.connect();
    try {
      const { name, cnic, phone, occupation } = req.body;

      // Validate input
      const schema = Joi.object({
        name: Joi.string().required(),
        cnic: Joi.string().pattern(/^[0-9]{13}$/).optional().allow(''),
        phone: Joi.string().optional().allow(''),
        occupation: Joi.string().optional().allow('')
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if guardian with same CNIC already exists
      if (cnic) {
        const existingGuardian = await client.query(
          'SELECT * FROM guardians WHERE cnic = $1',
          [cnic]
        );

        if (existingGuardian.rows.length > 0) {
          return ApiResponse.error(
            res,
            'Guardian with this CNIC already exists',
            409,
            { existing_guardian: existingGuardian.rows[0] }
          );
        }
      }

      // Create guardian
      const result = await client.query(
        `INSERT INTO guardians (name, cnic, phone, occupation) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [name, cnic || null, phone || null, occupation || null]
      );

      return ApiResponse.created(res, result.rows[0], 'Guardian created successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get guardian by ID
   * GET /api/guardians/:id
   */
  async getById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const guardian = await this.getGuardianById(client, id);

      if (!guardian) {
        return ApiResponse.error(res, 'Guardian not found', 404);
      }

      return ApiResponse.success(res, guardian);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Get complete guardian data with students
   */
  async getGuardianById(client, guardianId) {
    const result = await client.query(
      'SELECT * FROM guardians WHERE id = $1',
      [guardianId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const guardian = result.rows[0];

    // Get associated students
    const studentsResult = await client.query(
      `SELECT s.id, s.name, s.roll_no, s.phone, s.is_active, 
              sg.relation
       FROM students s
       JOIN student_guardians sg ON s.id = sg.student_id
       WHERE sg.guardian_id = $1
       ORDER BY s.name`,
      [guardianId]
    );

    return {
      ...guardian,
      students: studentsResult.rows
    };
  }

  /**
   * List guardians
   * GET /api/guardians
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const { 
        search,
        page = 1, 
        limit = 500 
      } = req.query;

      let query = `
        SELECT g.id, g.name, g.cnic, g.phone, g.occupation,
               COUNT(DISTINCT sg.student_id) as student_count
        FROM guardians g
        LEFT JOIN student_guardians sg ON g.id = sg.guardian_id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (search) {
        query += ` AND (g.name ILIKE $${paramCount} OR g.cnic ILIKE $${paramCount} OR g.phone ILIKE $${paramCount})`;
        params.push(`%${search}%`);
        paramCount++;
      }

      query += ` GROUP BY g.id, g.name, g.cnic, g.phone, g.occupation`;

      // Count total records - need a separate count query
      const countQuery = `
        SELECT COUNT(DISTINCT g.id) 
        FROM guardians g
        WHERE 1=1
      ` + (search ? ` AND (g.name ILIKE $1 OR g.cnic ILIKE $1 OR g.phone ILIKE $1)` : '');
      
      const countResult = await client.query(
        countQuery,
        search ? [`%${search}%`] : []
      );
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      query += ` ORDER BY g.name`;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);

      return ApiResponse.paginated(
        res,
        result.rows,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Guardians retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update guardian
   * PUT /api/guardians/:id
   */
  async update(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { name, cnic, phone, occupation } = req.body;

      // Validate input
      const schema = Joi.object({
        name: Joi.string().optional(),
        cnic: Joi.string().pattern(/^[0-9]{13}$/).optional().allow('', null),
        phone: Joi.string().optional().allow('', null),
        occupation: Joi.string().optional().allow('', null)
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if CNIC is being changed to one that already exists
      if (cnic) {
        const existingGuardian = await client.query(
          'SELECT id FROM guardians WHERE cnic = $1 AND id != $2',
          [cnic, id]
        );

        if (existingGuardian.rows.length > 0) {
          return ApiResponse.error(
            res,
            'Another guardian with this CNIC already exists',
            409
          );
        }
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        values.push(name);
        paramCount++;
      }

      if (cnic !== undefined) {
        updates.push(`cnic = $${paramCount}`);
        values.push(cnic || null);
        paramCount++;
      }

      if (phone !== undefined) {
        updates.push(`phone = $${paramCount}`);
        values.push(phone || null);
        paramCount++;
      }

      if (occupation !== undefined) {
        updates.push(`occupation = $${paramCount}`);
        values.push(occupation || null);
        paramCount++;
      }

      if (updates.length === 0) {
        return ApiResponse.error(res, 'No fields to update', 400);
      }

      values.push(id);
      const result = await client.query(
        `UPDATE guardians SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Guardian not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Guardian updated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete guardian
   * DELETE /api/guardians/:id
   */
  async delete(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Remove student-guardian associations first
      await client.query(
        'DELETE FROM student_guardians WHERE guardian_id = $1',
        [id]
      );

      const result = await client.query(
        'DELETE FROM guardians WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Guardian not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Guardian deleted successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Search guardian by CNIC
   * GET /api/guardians/search/cnic/:cnic
   */
  async searchByCnic(req, res, next) {
    const client = await pool.connect();
    try {
      const { cnic } = req.params;

      if (!/^[0-9]{13}$/.test(cnic)) {
        return ApiResponse.error(res, 'Invalid CNIC format. Must be 13 digits.', 400);
      }

      const result = await client.query(
        'SELECT * FROM guardians WHERE cnic = $1',
        [cnic]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Guardian not found', 404);
      }

      return ApiResponse.success(res, result.rows[0]);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new GuardiansController();
