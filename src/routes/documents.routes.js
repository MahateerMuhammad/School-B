const express = require('express');
const router = express.Router();
const documentsController = require('../controllers/documents.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly, staffOnly } = require('../middleware/role.middleware');
const { uploadSingle, uploadMultiple } = require('../middleware/upload.middleware');

/**
 * Document Management Routes
 * All routes require authentication
 */

// Upload single document for student (Admin only)
router.post(
  '/students/:id/documents',
  authenticate,
  adminOnly,
  uploadSingle('document'),
  documentsController.uploadDocument
);

// Upload multiple documents for student (Admin only)
router.post(
  '/students/:id/documents/bulk',
  authenticate,
  adminOnly,
  uploadMultiple('documents', 10),
  documentsController.uploadMultipleDocuments
);

// Get all documents for a student (Staff can view)
router.get(
  '/students/:id/documents',
  authenticate,
  staffOnly,
  documentsController.getStudentDocuments
);

// Get document by ID (Staff can view)
router.get(
  '/documents/:id',
  authenticate,
  staffOnly,
  documentsController.getDocumentById
);

// Download document (Staff can download)
router.get(
  '/documents/:id/download',
  authenticate,
  staffOnly,
  documentsController.downloadDocument
);

// Get signed URL for document (Staff can access)
router.get(
  '/documents/:id/url',
  authenticate,
  staffOnly,
  documentsController.getSignedUrl
);

// Update document details (Admin only)
router.put(
  '/documents/:id',
  authenticate,
  adminOnly,
  documentsController.updateDocument
);

// Delete document (Admin only)
router.delete(
  '/documents/:id',
  authenticate,
  adminOnly,
  documentsController.deleteDocument
);

// Get document statistics (Staff can view)
router.get(
  '/stats',
  authenticate,
  staffOnly,
  documentsController.getStats
);

module.exports = router;
