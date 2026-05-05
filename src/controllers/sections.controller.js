const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Sections Controller
 * Manages sections within classes
 */
class SectionsController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.create = this.create.bind(this);
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.update = this.update.bind(this);
    this.delete = this.delete.bind(this);
    this.getStudents = this.getStudents.bind(this);
  }

  /**
   * Create a new section
   * POST /api/sections
   */
  async create(req, res, next) {
    const client = await pool.connect();
    try {
      const { class_id, name } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        name: Joi.string().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if class exists
      const classCheck = await client.query(
        'SELECT id, name, class_type FROM classes WHERE id = $1',
        [class_id]
      );

      if (classCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Class not found', 404);
      }

      // Create section
      const result = await client.query(
        `INSERT INTO sections (class_id, name) 
         VALUES ($1, $2) 
         RETURNING *`,
        [class_id, name]
      );

      const section = result.rows[0];

      // Get complete section data
      const completeSection = await this.getSectionById(client, section.id);

      return ApiResponse.created(res, completeSection, 'Section created successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get section by ID with related data
   */
  async getSectionById(client, sectionId) {
    const result = await client.query(
      `SELECT s.*, c.name as class_name, c.class_type
       FROM sections s
       JOIN classes c ON s.class_id = c.id
       WHERE s.id = $1 AND s.is_archived = false`,
      [sectionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const section = result.rows[0];

    // Get student count
    const studentsResult = await client.query(
      `SELECT COUNT(DISTINCT student_id) as student_count 
       FROM student_class_history 
       WHERE section_id = $1 AND end_date IS NULL`,
      [sectionId]
    );

    return {
      ...section,
      student_count: parseInt(studentsResult.rows[0].student_count)
    };
  }

  /**
   * Get section by ID
   * GET /api/sections/:id
   */
  async getById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const section = await this.getSectionById(client, id);

      if (!section) {
        return ApiResponse.error(res, 'Section not found', 404);
      }

      return ApiResponse.success(res, section);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List sections
   * GET /api/sections
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const { class_id, page = 1, limit = 500 } = req.query;

      let query = `
        SELECT s.*, 
               c.name as class_name, 
               c.class_type,
               (SELECT COUNT(DISTINCT student_id) 
                FROM student_class_history 
                WHERE section_id = s.id AND end_date IS NULL) as student_count
        FROM sections s
        JOIN classes c ON s.class_id = c.id
        WHERE s.is_archived = false
      `;

      const params = [];
      let paramCount = 1;

      if (class_id) {
        query += ` AND s.class_id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      // Count total records
      const countQuery = `
        SELECT COUNT(*)
        FROM sections s
        JOIN classes c ON s.class_id = c.id
        WHERE s.is_archived = false
      `;
      
      let countQueryWithFilters = countQuery;
      if (class_id) {
        countQueryWithFilters += ` AND s.class_id = $1`;
      }
      
      const countResult = await client.query(countQueryWithFilters, class_id ? [class_id] : []);
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      query += ` ORDER BY c.class_type, c.name, s.name`;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);

      return ApiResponse.paginated(
        res,
        result.rows,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Sections retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get sections by class ID
   * GET /api/sections/class/:classId
   */
  async getByClass(req, res, next) {
    const client = await pool.connect();
    try {
      const { classId } = req.params;

      const result = await client.query(
        `SELECT s.*, 
                (SELECT COUNT(DISTINCT student_id) 
                 FROM student_class_history 
                 WHERE section_id = s.id AND end_date IS NULL) as student_count
         FROM sections s
         WHERE s.class_id = $1 AND s.is_archived = false
         ORDER BY s.name`,
        [classId]
      );

      return ApiResponse.success(res, result.rows);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update section
   * PUT /api/sections/:id
   */
  async update(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { name } = req.body;

      // Validate input
      const schema = Joi.object({
        name: Joi.string().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      const result = await client.query(
        'UPDATE sections SET name = $1 WHERE id = $2 RETURNING *',
        [name, id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Section not found', 404);
      }

      const updatedSection = await this.getSectionById(client, id);

      return ApiResponse.success(res, updatedSection, 'Section updated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete section
   * DELETE /api/sections/:id
   */
  async delete(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Check if section has students
      const studentsCheck = await client.query(
        `SELECT COUNT(*) as count 
         FROM student_class_history 
         WHERE section_id = $1 AND end_date IS NULL`,
        [id]
      );

      if (parseInt(studentsCheck.rows[0].count) > 0) {
        return ApiResponse.error(
          res,
          'Cannot delete section with active students',
          400
        );
      }

      const result = await client.query(
        'DELETE FROM sections WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Section not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Section deleted successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get students in a section
   * GET /api/sections/:id/students
   */
  async getStudents(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `SELECT s.id, s.name, s.roll_no, s.phone, 
                sch.start_date as enrollment_date
         FROM students s
         JOIN student_class_history sch ON s.id = sch.student_id
         WHERE sch.section_id = $1 AND sch.end_date IS NULL AND s.is_active = true
         ORDER BY s.name`,
        [id]
      );

      return ApiResponse.success(res, result.rows);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new SectionsController();
