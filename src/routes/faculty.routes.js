const express = require('express');
const router = express.Router();
const facultyController = require('../controllers/faculty.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly, staffOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);

/**
 * Faculty CRUD Routes
 */
// Create faculty (admin only)
router.post('/', adminOnly, facultyController.create);

// List faculty (staff can view)
router.get('/', staffOnly, facultyController.list);

// Get faculty statistics (staff can view)
router.get('/stats', staffOnly, facultyController.getStats);

// Get faculty by ID (staff can view)
router.get('/:id', staffOnly, facultyController.getById);

// Update faculty (admin only)
router.put('/:id', adminOnly, facultyController.update);

// Delete faculty (admin only)
router.delete('/:id', adminOnly, facultyController.delete);

/**
 * Faculty Status Routes
 */
// Activate faculty (admin only)
router.put('/:id/activate', adminOnly, facultyController.activate);

// Deactivate faculty (admin only)
router.put('/:id/deactivate', adminOnly, facultyController.deactivate);

/**
 * Salary Structure Routes
 */
// Update salary structure (admin only)
router.put('/:id/salary', adminOnly, facultyController.updateSalary);

// Get salary history (staff can view)
router.get('/:id/salary-history', staffOnly, facultyController.getSalaryHistory);

module.exports = router;
