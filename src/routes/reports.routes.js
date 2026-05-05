const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly } = require('../middleware/role.middleware');

// All reports routes require authentication and admin/staff role
router.use(authenticate);
router.use(staffOnly);

/**
 * Daily closing report
 * GET /api/reports/daily-closing
 * Query: date (YYYY-MM-DD, default: today)
 */
router.get('/daily-closing', reportsController.dailyClosing);

/**
 * Monthly profit/loss report
 * GET /api/reports/monthly-profit
 * Query: month (YYYY-MM, default: current month)
 */
router.get('/monthly-profit', reportsController.monthlyProfit);

/**
 * Fee collection report
 * GET /api/reports/fee-collection
 * Query: start_date, end_date (YYYY-MM-DD), class_id (optional)
 */
router.get('/fee-collection', reportsController.feeCollection);

/**
 * Defaulters aging report
 * GET /api/reports/defaulters-aging
 */
router.get('/defaulters-aging', reportsController.defaultersAging);

/**
 * Salary disbursement report
 * GET /api/reports/salary-disbursement
 * Query: start_date, end_date (YYYY-MM-DD)
 */
router.get('/salary-disbursement', reportsController.salaryDisbursement);

/**
 * Custom comprehensive report
 * GET /api/reports/custom
 * Query: start_date, end_date (YYYY-MM-DD)
 */
router.get('/custom', reportsController.customReport);

module.exports = router;
