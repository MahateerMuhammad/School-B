const express = require('express');
const router = express.Router();
const testReportsController = require('../controllers/testReports.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly } = require('../middleware/role.middleware');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/test-reports/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'test-report-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images and PDFs
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// All routes require authentication
router.use(authenticate);
router.use(staffOnly);

// CRUD operations
router.post('/', upload.single('file'), testReportsController.create);
router.get('/', testReportsController.list);
router.get('/:id', testReportsController.getById);
router.delete('/:id', testReportsController.delete);

module.exports = router;
