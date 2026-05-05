const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly } = require('../middleware/role.middleware');

// All analytics routes require authentication
router.use(authenticate);

/**
 * Dashboard overview
 * GET /api/analytics/dashboard
 */
router.get('/dashboard', staffOnly, analyticsController.dashboard);

/**
 * Revenue trends
 * GET /api/analytics/revenue-trends
 * Query: months (default 6)
 */
router.get('/revenue-trends', staffOnly, analyticsController.revenueTrends);

/**
 * Enrollment trends
 * GET /api/analytics/enrollment-trends
 */
router.get('/enrollment-trends', staffOnly, analyticsController.enrollmentTrends);

/**
 * Class-wise collection analysis
 * GET /api/analytics/class-collection
 */
router.get('/class-collection', staffOnly, analyticsController.classCollection);

/**
 * Faculty statistics
 * GET /api/analytics/faculty-stats
 */
router.get('/faculty-stats', staffOnly, analyticsController.facultyStats);

/**
 * Expense analysis
 * GET /api/analytics/expense-analysis
 */
router.get('/expense-analysis', staffOnly, analyticsController.expenseAnalysis);

/**
 * Performance metrics
 * GET /api/analytics/performance
 */
router.get('/performance', staffOnly, analyticsController.performanceMetrics);

/**
 * Financial summary for Accounts Overview
 * GET /api/analytics/financial-summary
 * Query: startDate, endDate
 */
router.get('/financial-summary', staffOnly, analyticsController.financialSummary);

module.exports = router;
