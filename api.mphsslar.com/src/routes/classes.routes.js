const express = require('express');
const router = express.Router();
const classesController = require('../controllers/classes.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly, adminOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);
router.use(staffOnly);

// CRUD operations
router.post('/', adminOnly, classesController.create);
router.get('/', classesController.list);
router.get('/:id', classesController.getById);
router.put('/:id', adminOnly, classesController.update);
router.delete('/:id', adminOnly, classesController.delete);

// Fee structure management
router.put('/:id/fee-structure', adminOnly, classesController.updateFeeStructure);
router.get('/:id/fee-history', classesController.getFeeHistory);
router.put('/:id/fee-structure/:feeId', adminOnly, classesController.updateSingleFeeStructure);
router.delete('/:id/fee-structure/:feeId', adminOnly, classesController.deleteFeeStructure);

module.exports = router;
