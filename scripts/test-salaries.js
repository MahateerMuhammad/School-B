/**
 * Faculty & Salary Module Test Script
 * Tests faculty CRUD, salary structure versioning, and salary payments
 */

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';
let testFacultyId = null;
let testVoucherId = null;

// ANSI color codes
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

// Test: Create faculty member
async function testCreateFaculty() {
  log('\n=== Testing Faculty Creation ===', 'info');
  
  const result = await request('/faculty', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Dr. Ahmed Khan',
      cnic: '12345-1234567-1',
      phone: '+92-300-1234567',
      email: 'ahmed.khan@school.com',
      address: 'Lahore, Pakistan',
      date_of_birth: '1985-05-15',
      qualification: 'PhD Computer Science',
      joining_date: '2024-01-01',
      designation: 'Senior Lecturer',
      subjects: 'Mathematics, Computer Science',
      salary_structure: {
        base_salary: 50000,
        allowances: {
          house_rent: 10000,
          transport: 5000,
          medical: 3000
        }
      }
    })
  });

  if (result.success && result.data.data?.id) {
    testFacultyId = result.data.data.id;
    log(`Faculty created successfully: ${testFacultyId}`, 'success');
    log(`Name: ${result.data.data.name}`, 'info');
    log(`Base Salary: ${result.data.data.current_salary_structure.base_salary}`, 'info');
    return true;
  } else {
    log(`Faculty creation failed: ${result.data?.message}`, 'error');
    return false;
  }
}

// Test: Duplicate CNIC prevention
async function testDuplicateCNIC() {
  log('\n=== Testing Duplicate CNIC Prevention ===', 'info');
  
  const result = await request('/faculty', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Another Person',
      cnic: '12345-1234567-1', // Same CNIC
      phone: '+92-300-9999999',
      joining_date: '2024-01-01',
      designation: 'Teacher',
      salary_structure: {
        base_salary: 30000
      }
    })
  });

  if (!result.success && result.data?.message?.includes('already exists')) {
    log('Duplicate CNIC correctly prevented', 'success');
    return true;
  } else {
    log('Duplicate CNIC prevention failed', 'error');
    return false;
  }
}

// Test: Get faculty by ID
async function testGetFaculty() {
  log('\n=== Testing Get Faculty Details ===', 'info');
  
  const result = await request(`/faculty/${testFacultyId}`);

  if (result.success) {
    log('Faculty details retrieved', 'success');
    log(`Name: ${result.data.data.name}`, 'info');
    log(`Designation: ${result.data.data.designation}`, 'info');
    log(`Active: ${result.data.data.is_active}`, 'info');
    return true;
  } else {
    log('Failed to retrieve faculty', 'error');
    return false;
  }
}

// Test: List faculty
async function testListFaculty() {
  log('\n=== Testing List Faculty ===', 'info');
  
  const result = await request('/faculty?limit=10');

  if (result.success) {
    log(`Retrieved ${result.data.data.items.length} faculty members`, 'success');
    log(`Total: ${result.data.data.pagination.total}`, 'info');
    return true;
  } else {
    log('Failed to list faculty', 'error');
    return false;
  }
}

// Test: Update faculty
async function testUpdateFaculty() {
  log('\n=== Testing Update Faculty ===', 'info');
  
  const result = await request(`/faculty/${testFacultyId}`, {
    method: 'PUT',
    body: JSON.stringify({
      phone: '+92-300-7654321',
      subjects: 'Advanced Mathematics, Computer Programming'
    })
  });

  if (result.success) {
    log('Faculty updated successfully', 'success');
    log(`New phone: ${result.data.data.phone}`, 'info');
    return true;
  } else {
    log('Faculty update failed', 'error');
    return false;
  }
}

// Test: Update salary structure
async function testUpdateSalary() {
  log('\n=== Testing Salary Structure Update ===', 'info');
  
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  const result = await request(`/faculty/${testFacultyId}/salary`, {
    method: 'PUT',
    body: JSON.stringify({
      base_salary: 55000,
      allowances: {
        house_rent: 12000,
        transport: 5000,
        medical: 3000,
        performance_bonus: 5000
      },
      effective_from: nextMonth.toISOString()
    })
  });

  if (result.success) {
    log('Salary structure updated', 'success');
    log(`New base salary: ${result.data.data.base_salary}`, 'info');
    log(`Effective from: ${result.data.data.effective_from}`, 'info');
    return true;
  } else {
    log(`Salary update failed: ${result.data?.message}`, 'error');
    return false;
  }
}

// Test: Get salary history
async function testGetSalaryHistory() {
  log('\n=== Testing Salary History ===', 'info');
  
  const result = await request(`/faculty/${testFacultyId}/salary-history`);

  if (result.success) {
    log('Salary history retrieved', 'success');
    log(`History entries: ${result.data.data.salary_history.length}`, 'info');
    return true;
  } else {
    log('Failed to get salary history', 'error');
    return false;
  }
}

// Test: Generate salary voucher
async function testGenerateSalaryVoucher() {
  log('\n=== Testing Salary Voucher Generation ===', 'info');
  
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
  
  const result = await request('/salaries/generate', {
    method: 'POST',
    body: JSON.stringify({
      faculty_id: testFacultyId,
      month: currentMonth,
      adjustments: [
        { adjustment_type: 'BONUS', amount: 3000, description: 'Performance bonus' },
        { adjustment_type: 'DEDUCTION', amount: 500, description: 'Late arrival fine' }
      ]
    })
  });

  if (result.success && result.data.data?.voucher_id) {
    testVoucherId = result.data.data.voucher_id;
    log(`Salary voucher generated: ${testVoucherId}`, 'success');
    log(`Gross Salary: ${result.data.data.gross_salary}`, 'info');
    log(`Net Salary: ${result.data.data.net_salary}`, 'info');
    log(`Adjustments: ${result.data.data.adjustments?.length || 0}`, 'info');
    return true;
  } else {
    log(`Voucher generation failed: ${result.data?.message}`, 'error');
    return false;
  }
}

// Test: Duplicate month prevention
async function testDuplicateVoucher() {
  log('\n=== Testing Duplicate Voucher Prevention ===', 'info');
  
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
  
  const result = await request('/salaries/generate', {
    method: 'POST',
    body: JSON.stringify({
      faculty_id: testFacultyId,
      month: currentMonth
    })
  });

  if (!result.success && result.data?.message?.includes('already exists')) {
    log('Duplicate voucher correctly prevented', 'success');
    return true;
  } else {
    log('Duplicate voucher prevention failed', 'error');
    return false;
  }
}

// Test: Bulk salary generation
async function testBulkGeneration() {
  log('\n=== Testing Bulk Salary Generation ===', 'info');
  
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthStr = nextMonth.toISOString().slice(0, 7) + '-01';
  
  const result = await request('/salaries/generate-bulk', {
    method: 'POST',
    body: JSON.stringify({
      month: monthStr
    })
  });

  if (result.success) {
    log('Bulk generation completed', 'success');
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
  
  const result = await request(`/salaries/voucher/${testVoucherId}`);

  if (result.success) {
    const voucher = result.data.data;
    log('Voucher retrieved successfully', 'success');
    log(`Faculty: ${voucher.faculty_name}`, 'info');
    log(`Status: ${voucher.status}`, 'info');
    log(`Net Salary: ${voucher.net_salary}`, 'info');
    return true;
  } else {
    log('Failed to retrieve voucher', 'error');
    return false;
  }
}

// Test: Add adjustment to voucher
async function testAddAdjustment() {
  log('\n=== Testing Add Adjustment ===', 'info');
  
  const result = await request(`/salaries/voucher/${testVoucherId}/adjustment`, {
    method: 'POST',
    body: JSON.stringify({
      adjustment_type: 'BONUS',
      amount: 2000,
      description: 'Extra hours bonus'
    })
  });

  if (result.success) {
    log('Adjustment added successfully', 'success');
    log(`New net salary: ${result.data.data.net_salary}`, 'info');
    return true;
  } else {
    log(`Add adjustment failed: ${result.data?.message}`, 'error');
    return false;
  }
}

// Test: Record salary payment
async function testRecordPayment() {
  log('\n=== Testing Salary Payment ===', 'info');
  
  // Get voucher details first
  const voucherResult = await request(`/salaries/voucher/${testVoucherId}`);
  if (!voucherResult.success) {
    log('Failed to get voucher details', 'error');
    return false;
  }

  const netSalary = parseFloat(voucherResult.data.data.net_salary);
  const partialPayment = Math.floor(netSalary / 2);

  const result = await request('/salaries/payment', {
    method: 'POST',
    body: JSON.stringify({
      voucher_id: testVoucherId,
      amount: partialPayment,
      payment_date: new Date().toISOString()
    })
  });

  if (result.success) {
    log('Salary payment recorded', 'success');
    log(`Amount: ${result.data.data.payment.amount}`, 'info');
    log(`New Status: ${result.data.data.voucher_status.status}`, 'info');
    return true;
  } else {
    log(`Payment failed: ${result.data?.message}`, 'error');
    return false;
  }
}

// Test: Payment validation (overpayment)
async function testPaymentValidation() {
  log('\n=== Testing Payment Validation ===', 'info');
  
  const result = await request('/salaries/payment', {
    method: 'POST',
    body: JSON.stringify({
      voucher_id: testVoucherId,
      amount: 999999 // Try to overpay
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

// Test: List vouchers
async function testListVouchers() {
  log('\n=== Testing List Vouchers ===', 'info');
  
  const result = await request('/salaries/vouchers?limit=10');

  if (result.success) {
    log(`Retrieved ${result.data.data.items.length} vouchers`, 'success');
    log(`Total: ${result.data.data.pagination.total}`, 'info');
    return true;
  } else {
    log('Failed to list vouchers', 'error');
    return false;
  }
}

// Test: Get unpaid vouchers
async function testGetUnpaid() {
  log('\n=== Testing Unpaid Vouchers ===', 'info');
  
  const result = await request('/salaries/unpaid');

  if (result.success) {
    log('Unpaid vouchers retrieved', 'success');
    log(`Total unpaid: ${result.data.data.summary.total_unpaid}`, 'warning');
    log(`Total due: ${result.data.data.summary.total_due_amount}`, 'warning');
    return true;
  } else {
    log('Failed to get unpaid vouchers', 'error');
    return false;
  }
}

// Test: Get salary statistics
async function testSalaryStats() {
  log('\n=== Testing Salary Statistics ===', 'info');
  
  const result = await request('/salaries/stats');

  if (result.success) {
    const stats = result.data.data;
    log('Salary statistics retrieved', 'success');
    log(`Total Vouchers: ${stats.total_vouchers}`, 'info');
    log(`Paid: ${stats.paid_vouchers}`, 'success');
    log(`Unpaid: ${stats.unpaid_vouchers}`, 'warning');
    log(`Total Generated: ${stats.total_salary_generated}`, 'info');
    log(`Total Paid: ${stats.total_paid}`, 'success');
    log(`Total Pending: ${stats.total_pending}`, 'warning');
    return true;
  } else {
    log('Failed to get stats', 'error');
    return false;
  }
}

// Test: Faculty statistics
async function testFacultyStats() {
  log('\n=== Testing Faculty Statistics ===', 'info');
  
  const result = await request('/faculty/stats');

  if (result.success) {
    const stats = result.data.data;
    log('Faculty statistics retrieved', 'success');
    log(`Total Faculty: ${stats.total_faculty}`, 'info');
    log(`Active: ${stats.active_faculty}`, 'success');
    log(`Inactive: ${stats.inactive_faculty}`, 'warning');
    log(`Average Salary: ${Math.round(stats.average_salary)}`, 'info');
    return true;
  } else {
    log('Failed to get faculty stats', 'error');
    return false;
  }
}

// Test: Deactivate faculty
async function testDeactivateFaculty() {
  log('\n=== Testing Deactivate Faculty ===', 'info');
  
  const result = await request(`/faculty/${testFacultyId}/deactivate`, {
    method: 'PUT'
  });

  if (result.success) {
    log('Faculty deactivated successfully', 'success');
    log(`Active status: ${result.data.data.is_active}`, 'info');
    return true;
  } else {
    log('Faculty deactivation failed', 'error');
    return false;
  }
}

// Test: Cannot generate salary for inactive faculty
async function testInactiveFacultyValidation() {
  log('\n=== Testing Inactive Faculty Validation ===', 'info');
  
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 2);
  
  const result = await request('/salaries/generate', {
    method: 'POST',
    body: JSON.stringify({
      faculty_id: testFacultyId,
      month: nextMonth.toISOString().slice(0, 7) + '-01'
    })
  });

  if (!result.success && result.data?.message?.includes('inactive')) {
    log('Inactive faculty validation works correctly', 'success');
    return true;
  } else {
    log('Inactive faculty validation failed', 'error');
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log(`\n${colors.bold}${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}║   Faculty & Salary Module Test Suite  ║${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}╚════════════════════════════════════════╝${colors.reset}\n`);

  const tests = [
    { name: 'Login', fn: testLogin },
    { name: 'Create Faculty', fn: testCreateFaculty },
    { name: 'Duplicate CNIC Prevention', fn: testDuplicateCNIC },
    { name: 'Get Faculty Details', fn: testGetFaculty },
    { name: 'List Faculty', fn: testListFaculty },
    { name: 'Update Faculty', fn: testUpdateFaculty },
    { name: 'Update Salary Structure', fn: testUpdateSalary },
    { name: 'Get Salary History', fn: testGetSalaryHistory },
    { name: 'Generate Salary Voucher', fn: testGenerateSalaryVoucher },
    { name: 'Duplicate Voucher Prevention', fn: testDuplicateVoucher },
    { name: 'Get Voucher Details', fn: testGetVoucher },
    { name: 'Add Adjustment', fn: testAddAdjustment },
    { name: 'Record Payment', fn: testRecordPayment },
    { name: 'Payment Validation', fn: testPaymentValidation },
    { name: 'List Vouchers', fn: testListVouchers },
    { name: 'Get Unpaid Vouchers', fn: testGetUnpaid },
    { name: 'Salary Statistics', fn: testSalaryStats },
    { name: 'Faculty Statistics', fn: testFacultyStats },
    { name: 'Deactivate Faculty', fn: testDeactivateFaculty },
    { name: 'Inactive Faculty Validation', fn: testInactiveFacultyValidation },
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
