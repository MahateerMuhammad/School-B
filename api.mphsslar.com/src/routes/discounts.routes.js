const express = require('express');
const router = express.Router();
const discountsController = require('../controllers/discounts.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticate);

// Create or update discount
router.post('/', discountsController.create);

// List all discounts
router.get('/', discountsController.list);

// Get discounts for a student
router.get('/student/:id', discountsController.getByStudent);

// Update discount
router.put('/:id', discountsController.update);

// Delete discount
router.delete('/:id', discountsController.delete);

module.exports = router;
