const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';

// Color codes for better readability
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m'
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'blue');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log('✓ ' + message, 'green');
}

function logError(message) {
  log('✗ ' + message, 'red');
}

async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@school.com',
      password: 'admin123'
    });
    authToken = response.data.data.token;
    logSuccess('Logged in successfully');
    return true;
  } catch (error) {
    logError('Login failed: ' + error.message);
    return false;
  }
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    get Authorization() {
      return `Bearer ${authToken}`;
    }
  }
});

// Test 1: Dashboard Overview
async function testDashboard() {
  logSection('Test 1: Dashboard Overview');
  try {
    const response = await api.get('/analytics/dashboard');
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Dashboard retrieved successfully');
    
    const data = response.data.data;
    log(`Students: ${data.students.total_students} total, ${data.students.active_students} active`, 'yellow');
    log(`Faculty: ${data.faculty.total_faculty} total, ${data.faculty.active_faculty} active`, 'yellow');
    log(`Current Month Fees: ${data.fees.current_month.collection_rate}% collection rate`, 'yellow');
    log(`Today's Net: ${data.today.net}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Dashboard failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 2: Revenue Trends
async function testRevenueTrends() {
  logSection('Test 2: Revenue Trends (Last 6 Months)');
  try {
    const response = await api.get('/analytics/revenue-trends?months=6');
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Revenue trends retrieved successfully');
    
    const trends = response.data.data;
    log(`Retrieved ${trends.length} months of data`, 'yellow');
    trends.slice(0, 3).forEach(month => {
      log(`${month.month}: Revenue ${month.fee_collections}, Profit ${month.net_profit}`, 'yellow');
    });
    
    return true;
  } catch (error) {
    logError('Revenue trends failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 3: Enrollment Trends
async function testEnrollmentTrends() {
  logSection('Test 3: Enrollment Trends');
  try {
    const response = await api.get('/analytics/enrollment-trends');
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Enrollment trends retrieved successfully');
    
    const data = response.data.data;
    log(`Monthly trends: ${data.trends.length} months`, 'yellow');
    log(`Class distribution: ${data.class_distribution.length} classes`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Enrollment trends failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 4: Class-wise Collection Analysis
async function testClassCollection() {
  logSection('Test 4: Class-wise Collection Analysis');
  try {
    const response = await api.get('/analytics/class-collection');
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Class collection analysis retrieved successfully');
    
    const classes = response.data.data;
    log(`Analyzed ${classes.length} classes`, 'yellow');
    classes.slice(0, 3).forEach(cls => {
      log(`${cls.class_name}: ${cls.collection_rate}% collection rate, ${cls.total_students} students`, 'yellow');
    });
    
    return true;
  } catch (error) {
    logError('Class collection failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 5: Faculty Statistics
async function testFacultyStats() {
  logSection('Test 5: Faculty & Salary Statistics');
  try {
    const response = await api.get('/analytics/faculty-stats');
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Faculty statistics retrieved successfully');
    
    const data = response.data.data;
    log(`Designations: ${data.designation_stats.length}`, 'yellow');
    log(`Salary ranges: ${data.salary_distribution.length}`, 'yellow');
    log(`Salary trend months: ${data.salary_trend.length}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Faculty stats failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 6: Expense Analysis
async function testExpenseAnalysis() {
  logSection('Test 6: Expense Analysis');
  try {
    const response = await api.get('/analytics/expense-analysis');
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Expense analysis retrieved successfully');
    
    const data = response.data.data;
    log(`Monthly trend: ${data.monthly_trend.length} months`, 'yellow');
    log(`Expense comparison: ${data.expense_comparison.length} months`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Expense analysis failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 7: Performance Metrics
async function testPerformanceMetrics() {
  logSection('Test 7: Performance Metrics');
  try {
    const response = await api.get('/analytics/performance');
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Performance metrics retrieved successfully');
    
    const data = response.data.data;
    log(`Current month profit: ${data.current_month.profit}`, 'yellow');
    log(`Revenue growth: ${data.growth.fee_collections}%`, 'yellow');
    log(`Expense growth: ${data.growth.expenses}%`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Performance metrics failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 8: Revenue Trends with Different Months
async function testRevenueTrendsDifferentMonths() {
  logSection('Test 8: Revenue Trends (Last 3 Months)');
  try {
    const response = await api.get('/analytics/revenue-trends?months=3');
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Revenue trends (3 months) retrieved successfully');
    
    const trends = response.data.data;
    log(`Retrieved ${trends.length} months of data`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Revenue trends (3 months) failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 9: Combined Dashboard Analysis
async function testCombinedAnalysis() {
  logSection('Test 9: Combined Dashboard Analysis');
  try {
    // Get all key metrics in parallel
    const [dashboard, revenue, performance] = await Promise.all([
      api.get('/analytics/dashboard'),
      api.get('/analytics/revenue-trends?months=3'),
      api.get('/analytics/performance')
    ]);
    
    logSuccess('Combined analysis retrieved successfully');
    
    const dash = dashboard.data.data;
    const rev = revenue.data.data;
    const perf = performance.data.data;
    
    log('\n📊 Key Insights:', 'blue');
    log(`• Active Students: ${dash.students.active_students}`, 'yellow');
    log(`• Active Faculty: ${dash.faculty.active_faculty}`, 'yellow');
    log(`• Current Month Collection Rate: ${dash.fees.current_month.collection_rate}%`, 'yellow');
    log(`• Today's Net Income: ${dash.today.net}`, 'yellow');
    log(`• Current Month Profit: ${perf.current_month.profit}`, 'yellow');
    log(`• Revenue Growth: ${perf.growth.fee_collections}%`, 'yellow');
    log(`• Recent Months Trend: ${rev.length} data points`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Combined analysis failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 10: Data Completeness Check
async function testDataCompleteness() {
  logSection('Test 10: Data Completeness Check');
  try {
    const [enrollment, classCollection, faculty, expenses] = await Promise.all([
      api.get('/analytics/enrollment-trends'),
      api.get('/analytics/class-collection'),
      api.get('/analytics/faculty-stats'),
      api.get('/analytics/expense-analysis')
    ]);
    
    logSuccess('All analytics endpoints accessible');
    
    const enrollData = enrollment.data.data;
    const classData = classCollection.data.data;
    const facultyData = faculty.data.data;
    const expenseData = expenses.data.data;
    
    log('\n📈 Data Coverage:', 'blue');
    log(`• Enrollment Trends: ${enrollData.trends.length} months`, 'yellow');
    log(`• Classes Analyzed: ${classData.length}`, 'yellow');
    log(`• Faculty Designations: ${facultyData.designation_stats.length}`, 'yellow');
    log(`• Expense Records: ${expenseData.monthly_trend.length} months`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Data completeness check failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  log('\n🚀 Starting Analytics Module Tests', 'blue');
  log('='.repeat(60));
  
  // Login first
  const loginSuccess = await login();
  if (!loginSuccess) {
    logError('Cannot proceed without authentication');
    process.exit(1);
  }
  
  // Run all tests
  const tests = [
    testDashboard,
    testRevenueTrends,
    testEnrollmentTrends,
    testClassCollection,
    testFacultyStats,
    testExpenseAnalysis,
    testPerformanceMetrics,
    testRevenueTrendsDifferentMonths,
    testCombinedAnalysis,
    testDataCompleteness
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = await test();
    if (result) {
      passed++;
    } else {
      failed++;
    }
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  logSection('Test Summary');
  log(`Total Tests: ${tests.length}`, 'blue');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${((passed / tests.length) * 100).toFixed(2)}%`, 'yellow');
  
  if (failed === 0) {
    log('\n🎉 All analytics tests passed!', 'green');
  } else {
    log('\n⚠️  Some analytics tests failed. Please review the errors above.', 'red');
  }
}

// Run tests
runAllTests().catch(error => {
  logError('Test execution failed: ' + error.message);
  process.exit(1);
});
