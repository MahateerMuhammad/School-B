const ApiResponse = require('../utils/response');

/**
 * Global error handling middleware
 * Must be the last middleware in the chain
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    code: err.code,
    path: req.path,
    method: req.method
  });

  // PostgreSQL unique constraint violation
  if (err.code === '23505') {
    return ApiResponse.error(res, 'Duplicate entry - This record already exists', 409, {
      detail: err.detail,
      constraint: err.constraint
    });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return ApiResponse.error(res, 'Related record not found or cannot be deleted', 400, {
      detail: err.detail,
      constraint: err.constraint
    });
  }

  // PostgreSQL check constraint violation
  if (err.code === '23514') {
    return ApiResponse.error(res, 'Invalid data - Check constraint violation', 400, {
      detail: err.detail,
      constraint: err.constraint
    });
  }

  // PostgreSQL not-null constraint violation
  if (err.code === '23502') {
    return ApiResponse.error(res, 'Required field is missing', 400, {
      detail: err.detail,
      column: err.column
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.error(res, 'Invalid token', 401);
  }

  if (err.name === 'TokenExpiredError') {
    return ApiResponse.error(res, 'Token expired', 401);
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    return ApiResponse.error(res, `File upload error: ${err.message}`, 400);
  }

  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  return ApiResponse.error(res, message, statusCode);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  return ApiResponse.error(
    res, 
    `Route not found: ${req.method} ${req.path}`, 
    404
  );
};

module.exports = { errorHandler, notFoundHandler };
