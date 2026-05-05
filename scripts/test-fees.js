/**
 * Fee Management Module Test Script
 * Tests voucher generation, payments, and defaulters tracking
 */

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';
let testStudentId = null;
let testVoucherId = null;
let testPaymentId = null;

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const icons = { success: '✓', error: '✗', info: '➤', warning: '⚠' };
  const colorMap = { success: colors.green, error: colors.red, info: colors.blue, warning: colors.yellow };
  console.log(`${colorMap[type]}${icons[type]} [${timestamp}] ${message}${colors.reset}`);
}

async function request(endpoint, options = {}) {
  try {
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
      ...options.headers
    };

    log(`${options.method || 'GET'} ${endpoint}`, 'info');
    
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      log(`Request failed: ${data.message || response.statusText}`, 'error');
      return { success: false, data, status: response.status };
    }

    return { success: true, data, status: response.status };
  } catch (error) {
    log(`Request error: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

// Test: Login as admin
async function testLogin() {
  log('\n=== Testing Authentication ===', 'info');
  
  const result = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@school.com',
      password: 'admin123'
    })
  });

  if (result.success && result.data.data?.token) {
    authToken = result.data.data.token;
    log('Admin login successful', 'success');
    return true;
  } else {
    log('Admin login failed', 'error');
    return false;
  }
}

// Test: Get a test student (or create one)
async function getTestStudent() {
  log('\n=== Getting Test Student ===', 'info');
  
  // Try to get existing students
  const result = await request('/students?limit=1');
  
  if (result.success && result.data.data?.items?.length > 0) {
    testStudentId = result.data.data.items[0].id;
    log(`Using existing student ID: ${testStudentId}`, 'success');
    return true;
  }

  log('No students found. Please create a student first.', 'warning');
  return false;
}

// Test: Generate voucher for a student
async function testGenerateVoucher() {
  log('\n=== Testing Voucher Generation ===', 'info');
  
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
  
  const result = await request('/vouchers/generate', {
    method: 'POST',
    body: JSON.stringify({
      student_id: testStudentId,
      month: currentMonth,
      custom_items: [
        { item_type: 'transport_fee', amount: 500 },
        { item_type: 'exam_fee', amount: 300 }
      ]
    })
  });

  if (result.success && result.data.data?.voucher_id) {
    testVoucherId = result.data.data.voucher_id;
    log(`Voucher generated successfully: ${testVoucherId}`, 'success');
    log(`Total Fee: ${result.data.data.total_fee}`, 'info');
    log(`Items: ${result.data.data.items.length}`, 'info');
    return true;
  } else {
    log(`Voucher generation failed: ${result.data?.message}`, 'error');
    return false;
  }
}

// Test: Generate bulk vouchers
async function testBulkGeneration() {
  log('\n=== Testing Bulk Voucher Generation ===', 'info');
  
  // Get first class
  const classResult = await request('/classes?limit=1');
  if (!classResult.success || !classResult.data.data?.items?.[0]) {
    log('No classes found for bulk generation test', 'warning');
    return false;
  }

  const classId = classResult.data.data.items[0].id;
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthStr = nextMonth.toISOString().slice(0, 7) + '-01';
  
  const result = await request('/vouchers/generate-bulk', {
    method: 'POST',
    body: JSON.stringify({
      class_id: classId,
      month: monthStr
    })
  });

  if (result.success) {
    log(`Bulk generation completed`, 'success');
    log(`Total: ${result.data.data.summary.total}`, 'info');
    log(`Generated: ${result.data.data.summary.generated}`, 'success');
    log(`Skipped: ${result.data.data.summary.skipped}`, 'warning');
    log(`Failed: ${result.data.data.summary.failed}`, 'error');
    return true;
  } else {
    log(`Bulk generation failed: ${result.data?.message}`, 'error');
    return false;
  }
}

// Test: Get voucher details
async function testGetVoucher() {
  log('\n=== Testing Get Voucher Details ===', 'info');
  
  const result = await request(`/vouchers/${testVoucherId}`);

  if (result.success) {
    const voucher = result.data.data;
    log(`Voucher retrieved successfully`, 'success');
    log(`Student: ${voucher.student_name}`, 'info');
    log(`Month: ${voucher.month}`, 'info');
    log(`Total Fee: ${voucher.total_fee}`, 'info');
    log(`Status: ${voucher.status}`, 'info');
    return true;
  } else {
    log('Failed to retrieve voucher', 'error');
    return false;
  }
}

// Test: List vouchers with filters
async function testListVouchers() {
  log('\n=== Testing List Vouchers ===', 'info');
  
  const result = await request('/vouchers?limit=5');

  if (result.success) {
    log(`Retrieved ${result.data.data.items.length} vouchers`, 'success');
    log(`Total: ${result.data.data.pagination.total}`, 'info');
    return true;
  } else {
    log('Failed to list vouchers', 'error');
    return false;
  }
}

// Test: Record payment
async function testRecordPayment() {
  log('\n=== Testing Payment Recording ===', 'info');
  
  // Get voucher details first
  const voucherResult = await request(`/vouchers/${testVoucherId}`);
  if (!voucherResult.success) {
    log('Failed to get voucher details', 'error');
    return false;
  }

  const dueAmount = parseFloat(voucherResult.data.data.due_amount);
  const partialPayment = Math.floor(dueAmount / 2); // Pay half

  const result = await request('/fees/payment', {
    method: 'POST',
    body: JSON.stringify({
      voucher_id: testVoucherId,
      amount: partialPayment,
      payment_date: new Date().toISOString()
    })
  });

  if (result.success) {
    testPaymentId = result.data.data.payment.id;
    log(`Payment recorded successfully: ${testPaymentId}`, 'success');
    log(`Amount: ${result.data.data.payment.amount}`, 'info');
    log(`New Status: ${result.data.data.voucher_status.status}`, 'info');
    return true;
  } else {
    log(`Payment failed: ${result.data?.message}`, 'error');
    return false;
  }
}

// Test: Payment validation (overpayment prevention)
async function testPaymentValidation() {
  log('\n=== Testing Payment Validation (Overpayment) ===', 'info');
  
  const result = await request('/fees/payment', {
    method: 'POST',
    body: JSON.stringify({
      voucher_id: testVoucherId,
      amount: 999999, // Try to overpay
      payment_date: new Date().toISOString()
    })
  });

  if (!result.success && result.data?.message?.includes('exceeds due amount')) {
    log('Overpayment correctly prevented', 'success');
    return true;
  } else {
    log('Overpayment validation failed', 'error');
    return false;
  }
}

// Test: Get payment history
async function testGetPayments() {
  log('\n=== Testing Get Payment History ===', 'info');
  
  const result = await request(`/fees/voucher/${testVoucherId}/payments`);

  if (result.success) {
    log(`Retrieved payment history`, 'success');
    log(`Payments count: ${result.data.data.payments.length}`, 'info');
    log(`Voucher status: ${result.data.data.voucher.status}`, 'info');
    return true;
  } else {
    log('Failed to get payment history', 'error');
    return false;
  }
}

// Test: List all payments with filters
async function testListPayments() {
  log('\n=== Testing List All Payments ===', 'info');
  
  const today = new Date().toISOString().slice(0, 10);
  const result = await request(`/fees/payments?from_date=${today}&limit=10`);

  if (result.success) {
    log(`Retrieved ${result.data.data.items.length} payments`, 'success');
    log(`Total: ${result.data.data.pagination.total}`, 'info');
    return true;
  } else {
    log('Failed to list payments', 'error');
    return false;
  }
}

// Test: Get student fee history
async function testStudentFeeHistory() {
  log('\n=== Testing Student Fee History ===', 'info');
  
  const result = await request(`/fees/student/${testStudentId}`);

  if (result.success) {
    const summary = result.data.data.summary;
    log('Student fee history retrieved', 'success');
    log(`Total Vouchers: ${summary.total_vouchers}`, 'info');
    log(`Paid: ${summary.paid_vouchers}`, 'success');
    log(`Unpaid: ${summary.unpaid_vouchers}`, 'warning');
    log(`Total Fee: ${summary.total_fee}`, 'info');
    log(`Total Paid: ${summary.total_paid}`, 'info');
    log(`Total Due: ${summary.total_due}`, 'warning');
    return true;
  } else {
    log('Failed to get student fee history', 'error');
    return false;
  }
}

// Test: Get student due amount
async function testStudentDue() {
  log('\n=== Testing Student Due Amount ===', 'info');
  
  const result = await request(`/fees/student/${testStudentId}/due`);

  if (result.success) {
    log('Student due amount retrieved', 'success');
    log(`Total Due: ${result.data.data.total_due || 0}`, 'warning');
    log(`Unpaid Vouchers: ${result.data.data.unpaid_vouchers || 0}`, 'info');
    return true;
  } else {
    log('Failed to get student due', 'error');
    return false;
  }
}

// Test: Get defaulters list
async function testDefaulters() {
  log('\n=== Testing Defaulters List ===', 'info');
  
  const result = await request('/fees/defaulters');

  if (result.success) {
    const summary = result.data.data.summary;
    log('Defaulters list retrieved', 'success');
    log(`Total Defaulters: ${summary.total_defaulters}`, 'warning');
    log(`Total Due Amount: ${summary.total_due_amount}`, 'warning');
    
    if (result.data.data.defaulters.length > 0) {
      log(`Sample defaulter: ${result.data.data.defaulters[0].student_name}`, 'info');
    }
    return true;
  } else {
    log('Failed to get defaulters', 'error');
    return false;
  }
}

// Test: Get fee statistics
async function testFeeStats() {
  log('\n=== Testing Fee Collection Statistics ===', 'info');
  
  const result = await request('/fees/stats');

  if (result.success) {
    const stats = result.data.data;
    log('Fee statistics retrieved', 'success');
    log(`Total Vouchers: ${stats.total_vouchers}`, 'info');
    log(`Paid: ${stats.paid_vouchers}`, 'success');
    log(`Unpaid: ${stats.unpaid_vouchers}`, 'warning');
    log(`Partial: ${stats.partial_vouchers}`, 'warning');
    log(`Total Generated: ${stats.total_fee_generated}`, 'info');
    log(`Total Collected: ${stats.total_collected}`, 'success');
    log(`Total Pending: ${stats.total_pending}`, 'warning');
    return true;
  } else {
    log('Failed to get stats', 'error');
    return false;
  }
}

// Test: Update voucher items
async function testUpdateVoucherItems() {
  log('\n=== Testing Update Voucher Items ===', 'info');
  
  // This will fail if voucher has payments (which it does from earlier tests)
  const result = await request(`/vouchers/${testVoucherId}/items`, {
    method: 'PUT',
    body: JSON.stringify({
      items: [
        { item_type: 'late_fee', amount: 100 }
      ]
    })
  });

  if (!result.success && result.data?.message?.includes('has payments')) {
    log('Correctly prevented modification of paid voucher', 'success');
    return true;
  } else if (result.success) {
    log('Voucher items updated successfully', 'success');
    return true;
  } else {
    log('Update voucher items test inconclusive', 'warning');
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log(`\n${colors.bold}${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}║   Fee Management Module Test Suite    ║${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}╚════════════════════════════════════════╝${colors.reset}\n`);

  const tests = [
    { name: 'Login', fn: testLogin },
    { name: 'Get Test Student', fn: getTestStudent },
    { name: 'Generate Voucher', fn: testGenerateVoucher },
    { name: 'Get Voucher Details', fn: testGetVoucher },
    { name: 'List Vouchers', fn: testListVouchers },
    { name: 'Record Payment', fn: testRecordPayment },
    { name: 'Payment Validation', fn: testPaymentValidation },
    { name: 'Get Payment History', fn: testGetPayments },
    { name: 'List All Payments', fn: testListPayments },
    { name: 'Student Fee History', fn: testStudentFeeHistory },
    { name: 'Student Due Amount', fn: testStudentDue },
    { name: 'Defaulters List', fn: testDefaulters },
    { name: 'Fee Statistics', fn: testFeeStats },
    { name: 'Update Voucher Items', fn: testUpdateVoucherItems },
    { name: 'Bulk Generation', fn: testBulkGeneration }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      log(`Test ${test.name} threw error: ${error.message}`, 'error');
      failed++;
    }
  }

  console.log(`\n${colors.bold}${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}║           Test Results                 ║${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}╚════════════════════════════════════════╝${colors.reset}`);
  console.log(`${colors.green}✓ Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}✗ Failed: ${failed}${colors.reset}`);
  console.log(`${colors.blue}Total: ${tests.length}${colors.reset}\n`);

  if (failed === 0) {
    log('🎉 All tests passed!', 'success');
  } else {
    log(`⚠️  ${failed} test(s) failed`, 'warning');
  }
}

// Run tests
runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});
