const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/role.middleware');

// Public routes
router.post('/login', authController.login);

// Protected routes (require authentication)
router.get('/profile', authenticate, authController.getProfile);
router.put('/change-password', authenticate, authController.changePassword);

// Admin-only routes
router.post('/register', authenticate, adminOnly, authController.register);
router.get('/users', authenticate, adminOnly, authController.listUsers);
router.delete('/users/:id', authenticate, adminOnly, authController.deleteUser);
router.put('/users/:id/reset-password', authenticate, adminOnly, authController.adminResetPassword);

module.exports = router;
