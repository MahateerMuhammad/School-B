const express = require('express');
const router = express.Router();
const salariesController = require('../controllers/salaries.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly, staffOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);

/**
 * Salary Voucher Generation Routes
 */
// Generate single salary voucher (admin only)
router.post('/generate', adminOnly, salariesController.generate);

// Generate bulk salary vouchers (admin only)
router.post('/generate-bulk', adminOnly, salariesController.generateBulk);

/**
 * Salary Voucher Management Routes
 */
// List salary vouchers (staff can view)
router.get('/vouchers', staffOnly, salariesController.listVouchers);

// Get unpaid salary vouchers (staff can view)
router.get('/unpaid', staffOnly, salariesController.getUnpaid);

// Get salary statistics (staff can view)
router.get('/stats', staffOnly, salariesController.getStats);

// Get voucher by ID (staff can view)
router.get('/voucher/:id', staffOnly, salariesController.getVoucherById);

// Download salary slip as PDF (staff can download)
router.get('/voucher/:id/pdf', staffOnly, salariesController.downloadPDF);

// Add adjustment to voucher (admin only)
router.post('/voucher/:id/adjustment', adminOnly, salariesController.addAdjustment);

// Delete voucher (admin only)
router.delete('/voucher/:id', adminOnly, salariesController.deleteVoucher);

/**
 * Salary Payment Routes
 */
// Record salary payment (admin only)
router.post('/payment', adminOnly, salariesController.recordPayment);

module.exports = router;
