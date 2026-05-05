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

// Helper function to format date
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Test 1: Daily Closing Report (Today)
async function testDailyClosingToday() {
  logSection('Test 1: Daily Closing Report - Today');
  try {
    const today = formatDate(new Date());
    const response = await api.get(`/reports/daily-closing?date=${today}`);
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Daily closing report (today) retrieved successfully');
    
    const data = response.data.data;
    log(`Date: ${data.date}`, 'yellow');
    log(`Fee Collections: ${data.fee_collections.count} transactions, ${data.fee_collections.total} amount`, 'yellow');
    log(`Salary Payments: ${data.salary_payments.count} transactions, ${data.salary_payments.total} amount`, 'yellow');
    log(`Expenses: ${data.expenses.count} transactions, ${data.expenses.total} amount`, 'yellow');
    log(`Net Amount: ${data.summary.net_amount}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Daily closing (today) failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 2: Daily Closing Report (Specific Date)
async function testDailyClosingSpecificDate() {
  logSection('Test 2: Daily Closing Report - Specific Date');
  try {
    const date = '2025-01-15';
    const response = await api.get(`/reports/daily-closing?date=${date}`);
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Daily closing report (specific date) retrieved successfully');
    
    const data = response.data.data;
    log(`Date: ${data.date}`, 'yellow');
    log(`Total Collections: ${data.fee_collections.total}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Daily closing (specific date) failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 3: Monthly Profit Report (Current Month)
async function testMonthlyProfitCurrent() {
  logSection('Test 3: Monthly Profit Report - Current Month');
  try {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const response = await api.get(`/reports/monthly-profit?month=${month}`);
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Monthly profit report (current) retrieved successfully');
    
    const data = response.data.data;
    log(`Month: ${data.month}`, 'yellow');
    log(`Total Revenue: ${data.revenue.total}`, 'yellow');
    log(`Total Expenses: ${data.expenses.total}`, 'yellow');
    log(`Net Profit: ${data.profit.net_profit}`, 'yellow');
    log(`Profit Margin: ${data.profit.profit_margin}%`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Monthly profit (current) failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 4: Monthly Profit Report (Previous Month)
async function testMonthlyProfitPrevious() {
  logSection('Test 4: Monthly Profit Report - Previous Month');
  try {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const response = await api.get(`/reports/monthly-profit?month=${month}`);
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Monthly profit report (previous) retrieved successfully');
    
    const data = response.data.data;
    log(`Month: ${data.month}`, 'yellow');
    log(`Net Profit: ${data.profit.net_profit}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Monthly profit (previous) failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 5: Fee Collection Report (Last 30 Days)
async function testFeeCollectionReport() {
  logSection('Test 5: Fee Collection Report - Last 30 Days');
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const response = await api.get(`/reports/fee-collection?start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}`);
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Fee collection report retrieved successfully');
    
    const data = response.data.data;
    log(`Period: ${data.period.start} to ${data.period.end}`, 'yellow');
    log(`Total Generated: ${data.summary.total_fee_generated}`, 'yellow');
    log(`Total Collected: ${data.summary.total_collected}`, 'yellow');
    log(`Collection Rate: ${data.summary.collection_rate}%`, 'yellow');
    log(`Classes Analyzed: ${data.by_class.length}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Fee collection report failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 6: Fee Collection Report with Class Filter
async function testFeeCollectionByClass() {
  logSection('Test 6: Fee Collection Report - Specific Class');
  try {
    // First get a class ID
    const classesResponse = await api.get('/classes');
    if (classesResponse.data.data.length === 0) {
      log('No classes found, skipping test', 'yellow');
      return true;
    }
    
    const classId = classesResponse.data.data[0].id;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const response = await api.get(`/reports/fee-collection?start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}&class_id=${classId}`);
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Fee collection report (by class) retrieved successfully');
    
    const data = response.data.data;
    log(`Filtered by Class ID: ${classId}`, 'yellow');
    log(`Classes in Report: ${data.by_class.length}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Fee collection (by class) failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 7: Defaulters Aging Report
async function testDefaultersAging() {
  logSection('Test 7: Defaulters Aging Report');
  try {
    const response = await api.get('/reports/defaulters-aging');
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Defaulters aging report retrieved successfully');
    
    const data = response.data.data;
    log(`Total Defaulters: ${data.summary.total_defaulters}`, 'yellow');
    log(`Total Outstanding: ${data.summary.total_outstanding}`, 'yellow');
    log(`0-1 Month: ${data.summary.aging_0_1_month} students`, 'yellow');
    log(`1-3 Months: ${data.summary.aging_1_3_months} students`, 'yellow');
    log(`3-6 Months: ${data.summary.aging_3_6_months} students`, 'yellow');
    log(`6+ Months: ${data.summary.aging_6_plus_months} students`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Defaulters aging failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 8: Salary Disbursement Report
async function testSalaryDisbursement() {
  logSection('Test 8: Salary Disbursement Report - Last 60 Days');
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 60);
    
    const response = await api.get(`/reports/salary-disbursement?start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}`);
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Salary disbursement report retrieved successfully');
    
    const data = response.data.data;
    log(`Period: ${data.period.start} to ${data.period.end}`, 'yellow');
    log(`Total Faculty: ${data.summary.total_faculty}`, 'yellow');
    log(`Total Paid: ${data.summary.total_paid}`, 'yellow');
    log(`Designations: ${data.by_designation.length}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Salary disbursement failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 9: Custom Comprehensive Report
async function testCustomReport() {
  logSection('Test 9: Custom Comprehensive Report - Last 90 Days');
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    
    const response = await api.get(`/reports/custom?start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}`);
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Custom report retrieved successfully');
    
    const data = response.data.data;
    log(`Period: ${data.period.start} to ${data.period.end} (${data.period.days} days)`, 'yellow');
    log(`Total Revenue: ${data.revenue.total}`, 'yellow');
    log(`Total Expenses: ${data.expenses.total}`, 'yellow');
    log(`Net Profit: ${data.summary.net_profit}`, 'yellow');
    log(`Average Daily Revenue: ${data.summary.average_daily_revenue}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Custom report failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 10: Custom Report - Short Period
async function testCustomReportShort() {
  logSection('Test 10: Custom Report - Last 7 Days');
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const response = await api.get(`/reports/custom?start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}`);
    console.log(JSON.stringify(response.data.data, null, 2));
    logSuccess('Custom report (7 days) retrieved successfully');
    
    const data = response.data.data;
    log(`Period: ${data.period.days} days`, 'yellow');
    log(`Daily Average Revenue: ${data.summary.average_daily_revenue}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Custom report (short) failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Test 11: Validation - Invalid Date Format
async function testInvalidDateFormat() {
  logSection('Test 11: Validation - Invalid Date Format');
  try {
    const response = await api.get('/reports/daily-closing?date=invalid-date');
    logError('Should have failed with invalid date');
    return false;
  } catch (error) {
    if (error.response?.status === 400) {
      logSuccess('Correctly rejected invalid date format');
      return true;
    }
    logError('Unexpected error: ' + error.message);
    return false;
  }
}

// Test 12: Validation - Missing Required Parameters
async function testMissingParameters() {
  logSection('Test 12: Validation - Missing Required Parameters');
  try {
    const response = await api.get('/reports/fee-collection');
    logError('Should have failed with missing parameters');
    return false;
  } catch (error) {
    if (error.response?.status === 400) {
      logSuccess('Correctly rejected missing parameters');
      return true;
    }
    logError('Unexpected error: ' + error.message);
    return false;
  }
}

// Test 13: Combined Reports Analysis
async function testCombinedReports() {
  logSection('Test 13: Combined Reports Analysis');
  try {
    const today = formatDate(new Date());
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const [daily, monthly, defaulters] = await Promise.all([
      api.get(`/reports/daily-closing?date=${today}`),
      api.get(`/reports/monthly-profit?month=${month}`),
      api.get('/reports/defaulters-aging')
    ]);
    
    logSuccess('Combined reports retrieved successfully');
    
    const dailyData = daily.data.data;
    const monthlyData = monthly.data.data;
    const defaultersData = defaulters.data.data;
    
    log('\n📊 Financial Snapshot:', 'blue');
    log(`• Today's Net: ${dailyData.summary.net_amount}`, 'yellow');
    log(`• Monthly Net Profit: ${monthlyData.profit.net_profit}`, 'yellow');
    log(`• Profit Margin: ${monthlyData.profit.profit_margin}%`, 'yellow');
    log(`• Total Defaulters: ${defaultersData.summary.total_defaulters}`, 'yellow');
    log(`• Outstanding Amount: ${defaultersData.summary.total_outstanding}`, 'yellow');
    
    return true;
  } catch (error) {
    logError('Combined reports failed: ' + error.response?.data?.message || error.message);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  log('\n🚀 Starting Reports Module Tests', 'blue');
  log('='.repeat(60));
  
  // Login first
  const loginSuccess = await login();
  if (!loginSuccess) {
    logError('Cannot proceed without authentication');
    process.exit(1);
  }
  
  // Run all tests
  const tests = [
    testDailyClosingToday,
    testDailyClosingSpecificDate,
    testMonthlyProfitCurrent,
    testMonthlyProfitPrevious,
    testFeeCollectionReport,
    testFeeCollectionByClass,
    testDefaultersAging,
    testSalaryDisbursement,
    testCustomReport,
    testCustomReportShort,
    testInvalidDateFormat,
    testMissingParameters,
    testCombinedReports
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
    log('\n🎉 All reports tests passed!', 'green');
  } else {
    log('\n⚠️  Some reports tests failed. Please review the errors above.', 'red');
  }
}

// Run tests
runAllTests().catch(error => {
  logError('Test execution failed: ' + error.message);
  process.exit(1);
});
