const BASE_URL = 'http://localhost:3000/api';

// Test data
let authToken = '';
let createdExpenseId = null;

/**
 * Test runner
 */
async function runTests() {
  console.log('🧪 Starting Expenses Module Tests\n');
  console.log('=' .repeat(60));

  try {
    // Authentication
    await test1_login();

    // Expense creation
    await test2_createExpense();
    await test3_createExpenseValidation();
    await test4_createExpenseNegativeAmount();

    // Expense listing
    await test5_listExpenses();
    await test6_listExpensesWithDateFilter();
    await test7_listExpensesWithSearch();
    await test8_listExpensesWithAmountFilter();

    // Expense retrieval
    await test9_getExpenseById();
    await test10_getExpenseNotFound();

    // Expense updates
    await test11_updateExpense();
    await test12_updateExpenseValidation();

    // Statistics
    await test13_getExpenseSummary();
    await test14_getDailyExpenses();
    await test15_getTopExpenses();

    // Bulk operations
    await test16_bulkCreateExpenses();

    // Expense deletion
    await test17_deleteExpense();
    await test18_deleteExpenseNotFound();

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

/**
 * Test 1: Login as admin
 */
async function test1_login() {
  console.log('\n📝 Test 1: Login as admin');

  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@school.com',
      password: 'admin123'
    })
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error('Login failed');
  }

  authToken = data.data.token;
  console.log('✅ Login successful');
}

/**
 * Test 2: Create expense
 */
async function test2_createExpense() {
  console.log('\n📝 Test 2: Create expense');

  const response = await fetch(`${BASE_URL}/expenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      title: 'Electricity Bill',
      amount: 15000,
      expense_date: '2024-01-15'
    })
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Failed to create expense: ${data.message}`);
  }

  createdExpenseId = data.data.id;
  console.log('✅ Expense created:', createdExpenseId);
}

/**
 * Test 3: Create expense with validation error
 */
async function test3_createExpenseValidation() {
  console.log('\n📝 Test 3: Create expense validation (missing fields)');

  const response = await fetch(`${BASE_URL}/expenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      title: 'Incomplete Expense'
      // Missing amount and expense_date
    })
  });

  const data = await response.json();

  if (data.success) {
    throw new Error('Expected validation error');
  }

  console.log('✅ Validation error caught:', data.message);
}

/**
 * Test 4: Create expense with negative amount
 */
async function test4_createExpenseNegativeAmount() {
  console.log('\n📝 Test 4: Create expense with negative amount');

  const response = await fetch(`${BASE_URL}/expenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      title: 'Invalid Expense',
      amount: -500,
      expense_date: '2024-01-15'
    })
  });

  const data = await response.json();

  if (data.success) {
    throw new Error('Expected validation error for negative amount');
  }

  console.log('✅ Negative amount validation error caught:', data.message);
}

/**
 * Test 5: List all expenses
 */
async function test5_listExpenses() {
  console.log('\n📝 Test 5: List all expenses');

  const response = await fetch(`${BASE_URL}/expenses?page=1&limit=10`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to list expenses');
  }

  console.log(`✅ Listed ${data.data.length} expenses`);
  console.log(`   Total: ${data.pagination.total}, Page: ${data.pagination.page}`);
}

/**
 * Test 6: List expenses with date filter
 */
async function test6_listExpensesWithDateFilter() {
  console.log('\n📝 Test 6: List expenses with date filter');

  const response = await fetch(
    `${BASE_URL}/expenses?from_date=2024-01-01&to_date=2024-01-31`,
    { headers: { 'Authorization': `Bearer ${authToken}` } }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to list expenses with date filter');
  }

  console.log(`✅ Found ${data.data.length} expenses in January 2024`);
}

/**
 * Test 7: List expenses with search
 */
async function test7_listExpensesWithSearch() {
  console.log('\n📝 Test 7: List expenses with search');

  const response = await fetch(
    `${BASE_URL}/expenses?search=Electricity`,
    { headers: { 'Authorization': `Bearer ${authToken}` } }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to search expenses');
  }

  console.log(`✅ Found ${data.data.length} expenses matching "Electricity"`);
}

/**
 * Test 8: List expenses with amount filter
 */
async function test8_listExpensesWithAmountFilter() {
  console.log('\n📝 Test 8: List expenses with amount filter');

  const response = await fetch(
    `${BASE_URL}/expenses?min_amount=10000&max_amount=20000`,
    { headers: { 'Authorization': `Bearer ${authToken}` } }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to list expenses with amount filter');
  }

  console.log(`✅ Found ${data.data.length} expenses between 10,000 and 20,000`);
}

/**
 * Test 9: Get expense by ID
 */
async function test9_getExpenseById() {
  console.log('\n📝 Test 9: Get expense by ID');

  const response = await fetch(`${BASE_URL}/expenses/${createdExpenseId}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to get expense');
  }

  console.log('✅ Expense retrieved:');
  console.log(`   Title: ${data.data.title}`);
  console.log(`   Amount: ${data.data.amount}`);
  console.log(`   Date: ${data.data.expense_date}`);
}

/**
 * Test 10: Get non-existent expense
 */
async function test10_getExpenseNotFound() {
  console.log('\n📝 Test 10: Get non-existent expense');

  const response = await fetch(`${BASE_URL}/expenses/999999`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  const data = await response.json();

  if (data.success) {
    throw new Error('Expected 404 error');
  }

  console.log('✅ Not found error caught:', data.message);
}

/**
 * Test 11: Update expense
 */
async function test11_updateExpense() {
  console.log('\n📝 Test 11: Update expense');

  const response = await fetch(`${BASE_URL}/expenses/${createdExpenseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      title: 'Electricity Bill - January',
      amount: 16000
    })
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to update expense');
  }

  console.log('✅ Expense updated:');
  console.log(`   New title: ${data.data.title}`);
  console.log(`   New amount: ${data.data.amount}`);
}

/**
 * Test 12: Update expense with validation error
 */
async function test12_updateExpenseValidation() {
  console.log('\n📝 Test 12: Update expense with invalid amount');

  const response = await fetch(`${BASE_URL}/expenses/${createdExpenseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      amount: -1000
    })
  });

  const data = await response.json();

  if (data.success) {
    throw new Error('Expected validation error');
  }

  console.log('✅ Validation error caught:', data.message);
}

/**
 * Test 13: Get expense summary
 */
async function test13_getExpenseSummary() {
  console.log('\n📝 Test 13: Get expense summary');

  const response = await fetch(`${BASE_URL}/expenses/summary`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to get summary');
  }

  console.log('✅ Expense summary:');
  console.log(`   Total expenses: ${data.data.summary.total_expenses}`);
  console.log(`   Total amount: ${data.data.summary.total_amount}`);
  console.log(`   Average: ${data.data.summary.average_amount}`);
  console.log(`   Monthly breakdown: ${data.data.monthly_breakdown.length} months`);
}

/**
 * Test 14: Get daily expenses
 */
async function test14_getDailyExpenses() {
  console.log('\n📝 Test 14: Get daily expenses');

  const response = await fetch(
    `${BASE_URL}/expenses/daily?from_date=2024-01-01&to_date=2024-01-31`,
    { headers: { 'Authorization': `Bearer ${authToken}` } }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to get daily expenses');
  }

  console.log(`✅ Daily expenses retrieved: ${data.data.length} days`);
}

/**
 * Test 15: Get top expenses
 */
async function test15_getTopExpenses() {
  console.log('\n📝 Test 15: Get top expenses');

  const response = await fetch(`${BASE_URL}/expenses/top?limit=5`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to get top expenses');
  }

  console.log(`✅ Top ${data.data.length} expenses retrieved`);
  if (data.data.length > 0) {
    console.log(`   Highest: ${data.data[0].title} - ${data.data[0].amount}`);
  }
}

/**
 * Test 16: Bulk create expenses
 */
async function test16_bulkCreateExpenses() {
  console.log('\n📝 Test 16: Bulk create expenses');

  const response = await fetch(`${BASE_URL}/expenses/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      expenses: [
        {
          title: 'Water Bill',
          amount: 3000,
          expense_date: '2024-01-15'
        },
        {
          title: 'Internet Bill',
          amount: 5000,
          expense_date: '2024-01-15'
        },
        {
          title: 'Office Supplies',
          amount: 8000,
          expense_date: '2024-01-16'
        }
      ]
    })
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to bulk create expenses');
  }

  console.log('✅ Bulk creation completed:');
  console.log(`   Created: ${data.data.summary.created}`);
  console.log(`   Failed: ${data.data.summary.failed}`);
}

/**
 * Test 17: Delete expense
 */
async function test17_deleteExpense() {
  console.log('\n📝 Test 17: Delete expense');

  const response = await fetch(`${BASE_URL}/expenses/${createdExpenseId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error('Failed to delete expense');
  }

  console.log('✅ Expense deleted successfully');
}

/**
 * Test 18: Delete non-existent expense
 */
async function test18_deleteExpenseNotFound() {
  console.log('\n📝 Test 18: Delete non-existent expense');

  const response = await fetch(`${BASE_URL}/expenses/999999`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  const data = await response.json();

  if (data.success) {
    throw new Error('Expected 404 error');
  }

  console.log('✅ Not found error caught:', data.message);
}

// Run the tests
runTests();
