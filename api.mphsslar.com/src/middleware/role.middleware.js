const ApiResponse = require('../utils/response');

/**
 * Role-based authorization middleware
 * Usage: authorize('ADMIN') or authorize('ADMIN', 'ACCOUNTANT')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthorized - Please login first', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return ApiResponse.error(
        res, 
        'Insufficient permissions - You do not have access to this resource', 
        403
      );
    }

    next();
  };
};

/**
 * Admin-only middleware
 */
const adminOnly = authorize('ADMIN');

/**
 * Admin or Accountant middleware
 */
const staffOnly = authorize('ADMIN', 'ACCOUNTANT');

module.exports = { authorize, adminOnly, staffOnly };
