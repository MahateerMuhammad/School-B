const express = require('express');
const router = express.Router();
const studentFeeOverridesController = require('../controllers/student-fee-overrides.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/role.middleware');

// All routes require authentication and admin role
router.use(authenticate);
router.use(adminOnly);

/**
 * Student Fee Overrides Routes
 */

// Set or update fee override for a student
router.post('/', studentFeeOverridesController.setOverride);

// List all fee overrides with optional filters
router.get('/', studentFeeOverridesController.listOverrides);

// Get fee override for a student in a specific class
router.get('/:student_id/class/:class_id', studentFeeOverridesController.getOverride);

// Remove fee override for a student
router.delete('/:student_id/class/:class_id', studentFeeOverridesController.removeOverride);

module.exports = router;
