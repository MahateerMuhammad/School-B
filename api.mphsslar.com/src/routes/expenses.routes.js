const express = require('express');
const router = express.Router();
const expensesController = require('../controllers/expenses.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly, staffOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);

// Summary and stats routes (before :id to avoid conflicts)
router.get('/summary', staffOnly, expensesController.getSummary);
router.get('/daily', staffOnly, expensesController.getDailyExpenses);
router.get('/top', staffOnly, expensesController.getTopExpenses);

// Bulk operations (admin only)
router.post('/bulk', adminOnly, expensesController.bulkCreate);

// CRUD operations
router.post('/', staffOnly, expensesController.create);
router.get('/', staffOnly, expensesController.list);
router.get('/:id', staffOnly, expensesController.getById);
router.put('/:id', staffOnly, expensesController.update);
router.delete('/:id', adminOnly, expensesController.delete);

module.exports = router;
