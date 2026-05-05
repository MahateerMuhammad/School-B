#!/usr/bin/env node

/**
 * Test script for bulk delete students endpoint
 * Run: node test-bulk-delete-students.js
 */

const { 
  colors,
  testEndpoint,
  formatResponse,
  logSeparator
} = require('./src/utils/test-helpers');

async function testBulkDeleteStudents() {
  console.log(colors.blue('🧪 Testing Bulk Delete Students Endpoint\n'));

  const baseUrl = 'http://localhost:5000/api/students';
  
  // Test cases
  const testCases = [
    {
      name: 'Valid request with existing student IDs',
      endpoint: `${baseUrl}/bulk-delete`,
      method: 'DELETE',
      data: {
        student_ids: [999, 1000] // Using likely non-existent IDs for safety
      },
      expectedStatus: 200,
      description: 'Should handle valid request even if students not found'
    },
    {
      name: 'Invalid request - empty array',
      endpoint: `${baseUrl}/bulk-delete`,
      method: 'DELETE',
      data: {
        student_ids: []
      },
      expectedStatus: 400,
      description: 'Should reject empty student_ids array'
    },
    {
      name: 'Invalid request - missing student_ids',
      endpoint: `${baseUrl}/bulk-delete`,
      method: 'DELETE',
      data: {},
      expectedStatus: 400,
      description: 'Should reject missing student_ids field'
    },
    {
      name: 'Invalid request - invalid ID types',
      endpoint: `${baseUrl}/bulk-delete`,
      method: 'DELETE',
      data: {
        student_ids: ['abc', 'def']
      },
      expectedStatus: 400,
      description: 'Should reject non-integer IDs'
    }
  ];

  for (const testCase of testCases) {
    await testEndpoint(testCase);
    logSeparator();
  }

  console.log(colors.green('✅ Bulk Delete Students endpoint testing completed!\n'));
  console.log(colors.yellow('📝 Note: This test uses non-existent student IDs for safety.'));
  console.log(colors.yellow('   To test actual deletion, use existing student IDs from your database.'));
}

// Run tests if called directly
if (require.main === module) {
  testBulkDeleteStudents().catch(console.error);
}

module.exports = { testBulkDeleteStudents };