const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

// Import routes
const authRoutes = require('./routes/auth.routes');
const studentsRoutes = require('./routes/students.routes');
const guardiansRoutes = require('./routes/guardians.routes');
const classesRoutes = require('./routes/classes.routes');
const sectionsRoutes = require('./routes/sections.routes');
const feesRoutes = require('./routes/fees.routes');
const vouchersRoutes = require('./routes/vouchers.routes');
const facultyRoutes = require('./routes/faculty.routes');
const salariesRoutes = require('./routes/salaries.routes');
const expensesRoutes = require('./routes/expenses.routes');
const reportsRoutes = require('./routes/reports.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const documentsRoutes = require('./routes/documents.routes');
const discountsRoutes = require('./routes/discounts.routes');
const studentFeeOverridesRoutes = require('./routes/student-fee-overrides.routes');
const testReportsRoutes = require('./routes/testReports.routes');
const promotionsRoutes = require('./routes/promotions.routes');

const app = express();

function resolveFrontendDistDir() {
  const configured = process.env.FRONTEND_DIST_DIR;
  const candidates = [
    configured ? path.resolve(configured) : null,
    path.resolve(__dirname, '..', '..', 'frontend', 'dist'),
    path.resolve(__dirname, '..', 'frontend', 'dist'),
    path.resolve(process.cwd(), 'frontend', 'dist'),
    path.resolve(process.cwd(), '..', 'frontend', 'dist')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) || null;
}

const frontendDistDir = resolveFrontendDistDir();

if (frontendDistDir) {
  app.use(express.static(frontendDistDir, { index: false }));
  console.log(`[SPA] Serving frontend from: ${frontendDistDir}`);
} else {
  console.warn('[SPA] Frontend dist not found. Set FRONTEND_DIST_DIR if your frontend moved.');
}

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 10000 requests per windowMs (high for testing)
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check
app.get('/health', (req, res) => {
  console.log("Health endpoint hit");
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root check for Fly and browser visits
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'School Backend API is running successfully'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/guardians', guardiansRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/sections', sectionsRoutes);
app.use('/api/fees', feesRoutes);
app.use('/api/vouchers', vouchersRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/salaries', salariesRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', documentsRoutes);
app.use('/api/discounts', discountsRoutes);
app.use('/api/student-fee-overrides', studentFeeOverridesRoutes);
app.use('/api/test-reports', testReportsRoutes);
app.use('/api/promotions', promotionsRoutes);

// SPA deep-link fallback: return index.html for non-API browser routes
app.get(/.*/, (req, res, next) => {
  if (!frontendDistDir) return next();
  if (req.path === '/health') return next();
  if (req.path.startsWith('/api/')) return next();
  if (req.path === '/api') return next();
  if (req.path.startsWith('/uploads/')) return next();
  if (req.path === '/uploads') return next();
  if (!req.accepts('html')) return next();

  return res.sendFile(path.join(frontendDistDir, 'index.html'));
});

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
