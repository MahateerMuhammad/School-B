const express = require('express');
const router = express.Router();
const feesController = require('../controllers/fees.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly, staffOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);

/**
 * Payment Routes
 */
// Record payment (admin and accountant)
router.post('/payment', staffOnly, feesController.recordPayment);

// List all payments (staff can view)
router.get('/payments', staffOnly, feesController.listPayments);

// Get payments for specific voucher (staff can view)
router.get('/voucher/:id/payments', staffOnly, feesController.getVoucherPayments);

// Delete payment (admin only - for corrections)
router.delete('/payment/:id', adminOnly, feesController.deletePayment);

// Download payment receipt as PDF (staff can download)
router.get('/payment/:id/receipt', staffOnly, feesController.downloadReceipt);

/**
 * Defaulters Routes
 */
// Get defaulters list (staff can view)
router.get('/defaulters', staffOnly, feesController.getDefaulters);

/**
 * Student Fee Routes
 */
// Get student fee history (staff can view)
router.get('/student/:id', staffOnly, feesController.getStudentFeeHistory);

// Get student current due (staff can view)
router.get('/student/:id/due', staffOnly, feesController.getStudentDue);

/**
 * Statistics Routes
 */
// Get fee collection stats (staff can view)
router.get('/stats', staffOnly, feesController.getStats);

module.exports = router;
