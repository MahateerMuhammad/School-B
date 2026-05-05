const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

/**
 * Test Reports Controller
 * Manages test report uploads and retrieval
 */
class TestReportsController {
  constructor() {
    this.create = this.create.bind(this);
    this.list = this.list.bind(this);
    this.delete = this.delete.bind(this);
    this.getById = this.getById.bind(this);
  }

  /**
   * Upload test report
   * POST /api/test-reports
   */
  async create(req, res, next) {
    const client = await pool.connect();
    try {
      const { class_id, section_id, report_date } = req.body;
      const file = req.file;

      if (!file) {
        return ApiResponse.error(res, 'No file uploaded', 400);
      }

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().optional().allow(null, ''),
        report_date: Joi.date().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        // Delete uploaded file if validation fails
        await fs.unlink(file.path).catch(() => {});
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if class exists
      const classCheck = await client.query(
        'SELECT id, name FROM classes WHERE id = $1',
        [class_id]
      );

      if (classCheck.rows.length === 0) {
        await fs.unlink(file.path).catch(() => {});
        return ApiResponse.error(res, 'Class not found', 404);
      }

      // Check if section exists (if provided)
      if (section_id) {
        const sectionCheck = await client.query(
          'SELECT id, name FROM sections WHERE id = $1 AND class_id = $2',
          [section_id, class_id]
        );

        if (sectionCheck.rows.length === 0) {
          await fs.unlink(file.path).catch(() => {});
          return ApiResponse.error(res, 'Section not found for this class', 404);
        }
      }

      // Insert test report record
      const result = await client.query(
        `INSERT INTO test_reports (class_id, section_id, report_date, file_name, file_path, file_type, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          class_id,
          section_id || null,
          report_date,
          file.originalname,
          file.path,
          file.mimetype,
          file.size,
          req.user?.id || null
        ]
      );

      return ApiResponse.success(res, result.rows[0], 'Test report uploaded successfully', 201);
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get test reports with filters
   * GET /api/test-reports
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const { class_id, section_id, start_date, end_date } = req.query;

      let query = `
        SELECT tr.*, c.name as class_name, s.name as section_name, u.email as uploaded_by_email
        FROM test_reports tr
        LEFT JOIN classes c ON tr.class_id = c.id
        LEFT JOIN sections s ON tr.section_id = s.id
        LEFT JOIN users u ON tr.uploaded_by = u.id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (class_id) {
        query += ` AND tr.class_id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      if (section_id) {
        query += ` AND tr.section_id = $${paramCount}`;
        params.push(section_id);
        paramCount++;
      }

      if (start_date) {
        query += ` AND tr.report_date >= $${paramCount}`;
        params.push(start_date);
        paramCount++;
      }

      if (end_date) {
        query += ` AND tr.report_date <= $${paramCount}`;
        params.push(end_date);
        paramCount++;
      }

      query += ' ORDER BY tr.report_date DESC, tr.created_at DESC';

      const result = await client.query(query, params);

      return ApiResponse.success(res, result.rows, 'Test reports retrieved successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get test report by ID
   * GET /api/test-reports/:id
   */
  async getById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `SELECT tr.*, c.name as class_name, s.name as section_name, u.email as uploaded_by_email
         FROM test_reports tr
         LEFT JOIN classes c ON tr.class_id = c.id
         LEFT JOIN sections s ON tr.section_id = s.id
         LEFT JOIN users u ON tr.uploaded_by = u.id
         WHERE tr.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Test report not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Test report retrieved successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete test report
   * DELETE /api/test-reports/:id
   */
  async delete(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Get file path before deleting
      const reportResult = await client.query(
        'SELECT file_path FROM test_reports WHERE id = $1',
        [id]
      );

      if (reportResult.rows.length === 0) {
        return ApiResponse.error(res, 'Test report not found', 404);
      }

      const filePath = reportResult.rows[0].file_path;

      // Delete from database
      await client.query('DELETE FROM test_reports WHERE id = $1', [id]);

      // Delete file from filesystem
      await fs.unlink(filePath).catch((err) => {
        console.error('Failed to delete file:', err);
      });

      return ApiResponse.success(res, null, 'Test report deleted successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new TestReportsController();
