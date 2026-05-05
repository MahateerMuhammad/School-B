const multer = require('multer');
const ApiResponse = require('../utils/response');
const r2Service = require('../services/r2.service');

/**
 * Configure Multer for memory storage
 * Files are stored in memory as Buffer objects
 */
const storage = multer.memoryStorage();

/**
 * File filter function
 */
const fileFilter = (req, file, cb) => {
  // Allowed MIME types for school documents
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

/**
 * Create Multer upload instance
 */
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10 // Maximum 10 files at once
  }
});

/**
 * Upload middleware for single file
 */
const uploadSingle = (fieldName = 'file') => {
  return (req, res, next) => {
    const uploadHandler = upload.single(fieldName);
    
    uploadHandler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
          return ApiResponse.error(res, 'File size exceeds 5MB limit', 400);
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return ApiResponse.error(res, 'Too many files uploaded', 400);
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return ApiResponse.error(res, `Unexpected field: ${err.field}`, 400);
        }
        return ApiResponse.error(res, err.message, 400);
      } else if (err) {
        // Other errors (like file type validation)
        return ApiResponse.error(res, err.message, 400);
      }
      
      // Validate file presence
      if (!req.file) {
        return ApiResponse.error(res, 'No file uploaded', 400);
      }

      next();
    });
  };
};

/**
 * Upload middleware for multiple files
 */
const uploadMultiple = (fieldName = 'files', maxCount = 10) => {
  return (req, res, next) => {
    const uploadHandler = upload.array(fieldName, maxCount);
    
    uploadHandler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return ApiResponse.error(res, 'One or more files exceed 5MB limit', 400);
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return ApiResponse.error(res, `Maximum ${maxCount} files allowed`, 400);
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return ApiResponse.error(res, `Unexpected field: ${err.field}`, 400);
        }
        return ApiResponse.error(res, err.message, 400);
      } else if (err) {
        return ApiResponse.error(res, err.message, 400);
      }
      
      // Validate files presence
      if (!req.files || req.files.length === 0) {
        return ApiResponse.error(res, 'No files uploaded', 400);
      }

      next();
    });
  };
};

/**
 * Upload middleware for multiple fields
 */
const uploadFields = (fields) => {
  return (req, res, next) => {
    const uploadHandler = upload.fields(fields);
    
    uploadHandler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return ApiResponse.error(res, 'One or more files exceed 5MB limit', 400);
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return ApiResponse.error(res, 'Too many files uploaded', 400);
        }
        return ApiResponse.error(res, err.message, 400);
      } else if (err) {
        return ApiResponse.error(res, err.message, 400);
      }

      next();
    });
  };
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  uploadFields
};
