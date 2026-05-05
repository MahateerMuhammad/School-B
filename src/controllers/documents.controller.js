const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const r2Service = require('../services/r2.service');
const Joi = require('joi');

/**
 * Standard document types for student admission
 */
const DOCUMENT_TYPES = {
  PHOTO: 'PHOTO',
  BAY_FORM: 'BAY_FORM',
  FATHER_CNIC: 'FATHER_CNIC',
  BIRTH_CERTIFICATE: 'BIRTH_CERTIFICATE',
  CUSTOM: 'CUSTOM'
};

/**
 * Documents Controller
 * Handles student document uploads and management
 */
class DocumentsController {
  constructor() {
    this.uploadDocument = this.uploadDocument.bind(this);
    this.uploadMultipleDocuments = this.uploadMultipleDocuments.bind(this);
    this.getStudentDocuments = this.getStudentDocuments.bind(this);
    this.getDocumentById = this.getDocumentById.bind(this);
    this.downloadDocument = this.downloadDocument.bind(this);
    this.getSignedUrl = this.getSignedUrl.bind(this);
    this.deleteDocument = this.deleteDocument.bind(this);
    this.updateDocument = this.updateDocument.bind(this);
    this.getStats = this.getStats.bind(this);
  }

  /**
   * Upload document for student
   * POST /api/students/:id/documents
   */
  async uploadDocument(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { document_type, description } = req.body;
      const file = req.file;

      // Validate input
      const schema = Joi.object({
        document_type: Joi.string()
          .valid(...Object.values(DOCUMENT_TYPES))
          .required()
          .messages({
            'any.only': 'Document type must be one of: PHOTO, BAY_FORM, FATHER_CNIC, BIRTH_CERTIFICATE, CUSTOM'
          }),
        description: Joi.string().optional().allow(null, '')
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if student exists
      const studentCheck = await client.query(
        'SELECT id, name FROM students WHERE id = $1',
        [id]
      );

      if (studentCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      // Upload file to R2
      const uploadResult = await r2Service.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        `students/${id}`
      );

      // Save document record to database
      const result = await client.query(
        `INSERT INTO student_documents 
         (student_id, document_type, file_name, file_url, file_size, mime_type, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          id,
          document_type,
          uploadResult.originalName,
          uploadResult.url,
          uploadResult.size,
          uploadResult.mimeType,
          description
        ]
      );

      // Generate signed URL for immediate access
      const signedUrl = await r2Service.getSignedUrl(uploadResult.key);

      await client.query('COMMIT');

      return ApiResponse.created(res, {
        document: {
          ...result.rows[0],
          file_url: signedUrl,
          signed_url: signedUrl
        },
        file: {
          url: signedUrl,
          signed_url: signedUrl,
          size: uploadResult.size,
          type: uploadResult.mimeType
        }
      }, 'Document uploaded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Upload multiple documents for student
   * POST /api/students/:id/documents/bulk
   */
  async uploadMultipleDocuments(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { document_type, description } = req.body;
      const files = req.files;

      // Check if student exists
      const studentCheck = await client.query(
        'SELECT id, name FROM students WHERE id = $1',
        [id]
      );

      if (studentCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      // Upload all files to R2
      const uploadResults = await r2Service.uploadMultipleFiles(
        files,
        `students/${id}`
      );

      // Save all document records
      const documents = [];
      for (const uploadResult of uploadResults) {
        const result = await client.query(
          `INSERT INTO student_documents 
           (student_id, document_type, file_name, file_url, file_size, mime_type, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            id,
            document_type || 'OTHER',
            uploadResult.originalName,
            uploadResult.url,
            uploadResult.size,
            uploadResult.mimeType,
            description
          ]
        );

        // Generate signed URL
        try {
          const signedUrl = await r2Service.getSignedUrl(uploadResult.key);
          documents.push({
            ...result.rows[0],
            file_url: signedUrl,
            signed_url: signedUrl
          });
        } catch (err) {
          console.error('Failed to sign URL:', err);
          documents.push({
            ...result.rows[0]
          });
        }
      }

      await client.query('COMMIT');

      return ApiResponse.created(res, {
        documents,
        count: documents.length
      }, `${documents.length} documents uploaded successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get all documents for a student
   * GET /api/students/:id/documents
   */
  async getStudentDocuments(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { document_type } = req.query;

      let query = `
        SELECT d.*, s.name as student_name
        FROM student_documents d
        JOIN students s ON d.student_id = s.id
        WHERE d.student_id = $1
      `;

      const params = [id];
      let paramCount = 2;

      if (document_type) {
        query += ` AND d.document_type = $${paramCount}`;
        params.push(document_type);
        paramCount++;
      }

      query += ' ORDER BY d.uploaded_at DESC';

      const result = await client.query(query, params);

      // Generate signed URLs for all documents
      const documentsWithUrls = await Promise.all(result.rows.map(async (doc) => {
        try {
          // Extract key from file_url (assuming format contains 'students/')
          // If file_url is absolute, we try to find the relative path
          let key = doc.file_url;
          if (doc.file_url.includes('students/')) {
            key = doc.file_url.substring(doc.file_url.indexOf('students/'));
          } else if (doc.file_url.includes('documents/')) {
            // Fallback for default folder
            key = doc.file_url.substring(doc.file_url.indexOf('documents/'));
          }

          const signedUrl = await r2Service.getSignedUrl(key);
          return { ...doc, file_url: signedUrl };
        } catch (err) {
          console.error(`Failed to generate signed URL for doc ${doc.id}:`, err);
          return { ...doc };
        }
      }));

      return ApiResponse.success(res, {
        student_id: parseInt(id),
        documents: documentsWithUrls,
        count: documentsWithUrls.length
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get document by ID
   * GET /api/documents/:id
   */
  async getDocumentById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `SELECT d.*, s.name as student_name, s.roll_no
         FROM student_documents d
         JOIN students s ON d.student_id = s.id
         WHERE d.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      const doc = result.rows[0];

      try {
        let key = doc.file_url;
        if (doc.file_url.includes('students/')) {
          key = doc.file_url.substring(doc.file_url.indexOf('students/'));
        } else if (doc.file_url.includes('documents/')) {
          key = doc.file_url.substring(doc.file_url.indexOf('documents/'));
        }

        doc.file_url = await r2Service.getSignedUrl(key);
      } catch (err) {
        console.error(`Failed to generate signed URL for doc ${doc.id}:`, err);
        // Keep original
      }

      return ApiResponse.success(res, doc);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Download document
   * GET /api/documents/:id/download
   */
  async downloadDocument(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Get document details
      const result = await client.query(
        'SELECT * FROM student_documents WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      const document = result.rows[0];

      // Extract key from URL
      const key = document.file_url.split('.r2.dev/')[1] ||
        document.file_url.split(process.env.R2_PUBLIC_URL + '/')[1];

      // Download from R2
      const fileData = await r2Service.downloadFile(key);

      // Set response headers
      res.setHeader('Content-Type', fileData.contentType);
      res.setHeader('Content-Length', fileData.contentLength);
      res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);

      // Send file
      return res.send(fileData.body);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get signed URL for document
   * GET /api/documents/:id/url
   */
  async getSignedUrl(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { expires = 3600 } = req.query;

      // Get document details
      const result = await client.query(
        'SELECT * FROM student_documents WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      const document = result.rows[0];

      // Extract key from URL
      const key = document.file_url.split('.r2.dev/')[1] ||
        document.file_url.split(process.env.R2_PUBLIC_URL + '/')[1];

      // Generate signed URL
      const signedUrl = await r2Service.getSignedUrl(key, parseInt(expires));

      return ApiResponse.success(res, {
        document_id: document.id,
        signed_url: signedUrl,
        expires_in: parseInt(expires),
        expires_at: new Date(Date.now() + parseInt(expires) * 1000).toISOString()
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete document
   * DELETE /api/documents/:id
   */
  async deleteDocument(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Get document details
      const result = await client.query(
        'SELECT * FROM student_documents WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      const document = result.rows[0];

      // Extract key from URL
      const key = document.file_url.split('.r2.dev/')[1] ||
        document.file_url.split(process.env.R2_PUBLIC_URL + '/')[1];

      // Delete from R2
      await r2Service.deleteFile(key);

      // Delete from database
      await client.query(
        'DELETE FROM student_documents WHERE id = $1',
        [id]
      );

      await client.query('COMMIT');

      // Generate signed URL for response (consistency)
      try {
        const signedUrl = await r2Service.getSignedUrl(key);
        document.file_url = signedUrl;
      } catch (err) {
        // Keep original
      }

      return ApiResponse.success(res, document, 'Document deleted successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update document details
   * PUT /api/documents/:id
   */
  async updateDocument(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { document_type, description } = req.body;

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (document_type) {
        // Validate document type
        if (!Object.values(DOCUMENT_TYPES).includes(document_type)) {
          return ApiResponse.error(
            res,
            'Document type must be one of: PHOTO, BAY_FORM, FATHER_CNIC, BIRTH_CERTIFICATE, CUSTOM',
            400
          );
        }
        updates.push(`document_type = $${paramCount}`);
        values.push(document_type);
        paramCount++;
      }

      if (description !== undefined) {
        updates.push(`description = $${paramCount}`);
        values.push(description);
        paramCount++;
      }

      if (updates.length === 0) {
        return ApiResponse.error(res, 'No fields to update', 400);
      }

      values.push(id);

      const result = await client.query(
        `UPDATE student_documents 
         SET ${updates.join(', ')} 
         WHERE id = $${paramCount} 
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      const doc = result.rows[0];
      try {
        let key = doc.file_url;
        if (doc.file_url.includes('students/')) {
          key = doc.file_url.substring(doc.file_url.indexOf('students/'));
        } else if (doc.file_url.includes('documents/')) {
          key = doc.file_url.substring(doc.file_url.indexOf('documents/'));
        }

        doc.file_url = await r2Service.getSignedUrl(key);
      } catch (err) {
        // Keep original
      }

      return ApiResponse.success(res, doc, 'Document updated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get document statistics
   * GET /api/documents/stats
   */
  async getStats(req, res, next) {
    const client = await pool.connect();
    try {
      const stats = await client.query(`
        SELECT 
          COUNT(*) as total_documents,
          COUNT(DISTINCT student_id) as students_with_documents,
          SUM(file_size) as total_size_bytes,
          ROUND(AVG(file_size)) as average_file_size,
          COUNT(DISTINCT document_type) as document_types,
          json_agg(DISTINCT document_type) as types_list
        FROM student_documents
      `);

      const typeBreakdown = await client.query(`
        SELECT 
          document_type,
          COUNT(*) as count,
          SUM(file_size) as total_size
        FROM student_documents
        GROUP BY document_type
        ORDER BY count DESC
      `);

      return ApiResponse.success(res, {
        overall: stats.rows[0],
        by_type: typeBreakdown.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new DocumentsController();
