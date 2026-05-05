const pool = require('../config/db');
const { getConnectionWithTimeout } = require('../utils/db');
const CryptoUtil = require('../utils/crypto');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

// In-memory store for login attempts (use Redis in production)
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 999999; // Unlimited for testing (was 5)
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Authentication Controller
 * Handles user registration, login, and profile management
 */
class AuthController {
  /**
   * Register new user (Admin only)
   * POST /api/auth/register
   */
  async register(req, res, next) {
    let client;
    try {
      // Timeout database connection attempt
      client = await Promise.race([
        pool.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database connection timeout')), 5000)
        )
      ]);
      
      const { email, password, role } = req.body;

      // Validate input
      const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string()
          .min(8)
          .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .required()
          .messages({
            'string.min': 'Password must be at least 8 characters long',
            'string.pattern.base': 'Password must contain uppercase, lowercase, and number'
          }),
        role: Joi.string().valid('ADMIN', 'ACCOUNTANT').required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        return ApiResponse.error(res, 'User with this email already exists', 409);
      }

      // Hash password
      const passwordHash = await CryptoUtil.hashPassword(password);

      // Create user
      const result = await client.query(
        `INSERT INTO users (email, password_hash, role) 
         VALUES ($1, $2, $3) 
         RETURNING id, email, role, created_at`,
        [email.toLowerCase(), passwordHash, role]
      );

      const user = result.rows[0];

      return ApiResponse.created(res, user, 'User registered successfully');
    } catch (error) {
      next(error);
    } catch (dbError) {
      if (dbError.message === 'Database connection timeout') {
        return ApiResponse.error(res, 'Database connection failed. Please try again later.', 503);
      }
      next(dbError);
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Login
   * POST /api/auth/login
   */
  async login(req, res, next) {
    let client;
    try {
      // Timeout database connection attempt
      client = await Promise.race([
        pool.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database connection timeout')), 5000)
        )
      ]);
      
      const { email, password } = req.body;

      // Check brute force attempts
      const attemptKey = `${email}:${req.ip}`;
      const attempts = loginAttempts.get(attemptKey);
      
      if (attempts && attempts.count >= MAX_LOGIN_ATTEMPTS) {
        const elapsed = Date.now() - attempts.timestamp;
        if (elapsed < LOCKOUT_DURATION) {
          const remainingMinutes = Math.ceil((LOCKOUT_DURATION - elapsed) / 60000);
          return ApiResponse.error(res, 
            `Account temporarily locked due to multiple failed login attempts. Try again in ${remainingMinutes} minutes.`, 
            429
          );
        }
        // Lockout expired, reset
        loginAttempts.delete(attemptKey);
      }

      // Validate input
      const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Find user
      const result = await client.query(
        'SELECT id, email, password_hash, role FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        // Track failed attempt even for non-existent users (prevent user enumeration timing)
        const attemptKey = `${email}:${req.ip}`;
        const currentAttempts = loginAttempts.get(attemptKey) || { count: 0, timestamp: Date.now() };
        currentAttempts.count++;
        currentAttempts.timestamp = Date.now();
        loginAttempts.set(attemptKey, currentAttempts);
        
        return ApiResponse.error(res, 'Invalid email or password', 401);
      }

      const user = result.rows[0];

      // Verify password
      const isValidPassword = await CryptoUtil.comparePassword(password, user.password_hash);

      if (!isValidPassword) {
        // Track failed attempt
        const attemptKey = `${email}:${req.ip}`;
        const currentAttempts = loginAttempts.get(attemptKey) || { count: 0, timestamp: Date.now() };
        currentAttempts.count++;
        currentAttempts.timestamp = Date.now();
        loginAttempts.set(attemptKey, currentAttempts);
        
        return ApiResponse.error(res, 'Invalid email or password', 401);
      }

      // Reset attempts on successful login
      loginAttempts.delete(`${email}:${req.ip}`);

      // Generate JWT token
      const token = CryptoUtil.generateToken({
        id: user.id,
        email: user.email,
        role: user.role
      });

      return ApiResponse.success(res, {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      }, 'Login successful');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/profile
   */
  async getProfile(req, res, next) {
    let client;
    try {
      // Timeout database connection attempt
      client = await Promise.race([
        pool.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database connection timeout')), 5000)
        )
      ]);
      const result = await client.query(
        'SELECT id, email, role, created_at FROM users WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      return ApiResponse.success(res, result.rows[0]);
    } catch (error) {
      next(error);
    } catch (dbError) {
      if (dbError.message === 'Database connection timeout') {
        return ApiResponse.error(res, 'Database connection failed. Please try again later.', 503);
      }
      next(dbError);
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Change password
   * PUT /api/auth/change-password
   */
  async changePassword(req, res, next) {
    let client;
    try {
      // Timeout database connection attempt
      client = await Promise.race([
        pool.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database connection timeout')), 5000)
        )
      ]);
    try {
      const { currentPassword, newPassword } = req.body;

      // Validate input
      const schema = Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().min(6).required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Get user's current password hash
      const result = await client.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      // Verify current password
      const isValid = await CryptoUtil.comparePassword(
        currentPassword, 
        result.rows[0].password_hash
      );

      if (!isValid) {
        return ApiResponse.error(res, 'Current password is incorrect', 401);
      }

      // Hash new password
      const newPasswordHash = await CryptoUtil.hashPassword(newPassword);

      // Update password
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [newPasswordHash, req.user.id]
      );

      return ApiResponse.success(res, null, 'Password changed successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List all users (Admin only)
   * GET /api/auth/users
   */
  async listUsers(req, res, next) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, email, role, created_at FROM users ORDER BY created_at DESC'
      );

      return ApiResponse.success(res, result.rows);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete user (Admin only)
   * DELETE /api/auth/users/:id
   */
  async deleteUser(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Prevent self-deletion
      if (parseInt(id) === req.user.id) {
        return ApiResponse.error(res, 'Cannot delete your own account', 400);
      }

      const result = await client.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, email',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'User deleted successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new AuthController();
