const CryptoUtil = require('../utils/crypto');
const ApiResponse = require('../utils/response');

/**
 * JWT Authentication Middleware
 */
const authenticate = (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.error(res, 'Access token required', 401);
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = CryptoUtil.verifyToken(token);
    
    if (!decoded) {
      return ApiResponse.error(res, 'Invalid or expired token', 401);
    }

    // Attach user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    return ApiResponse.error(res, 'Authentication failed', 401);
  }
};

/**
 * Optional authentication (doesn't fail if no token)
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = CryptoUtil.verifyToken(token);
      
      if (decoded) {
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role
        };
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = { authenticate, optionalAuth };
