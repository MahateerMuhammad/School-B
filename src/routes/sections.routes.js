const express = require('express');
const router = express.Router();
const sectionsController = require('../controllers/sections.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly, adminOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);
router.use(staffOnly);

// CRUD operations
router.post('/', adminOnly, sectionsController.create);
router.get('/', sectionsController.list);
router.get('/class/:classId', sectionsController.getByClass);
router.get('/:id', sectionsController.getById);
router.put('/:id', adminOnly, sectionsController.update);
router.delete('/:id', adminOnly, sectionsController.delete);

// Get students in section
router.get('/:id/students', sectionsController.getStudents);

module.exports = router;
