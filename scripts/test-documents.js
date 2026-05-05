#!/usr/bin/env node

/**
 * Document Management Module Test Script
 * Tests file upload, download, and deletion functionality
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';
let studentId = '';
let documentId = '';
let testFilePath = '';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName, passed, error = null) {
  const status = passed ? '✓ PASS' : '✗ FAIL';
  const color = passed ? 'green' : 'red';
  
  results.tests.push({ testName, passed, error });
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
  
  log(`${status}: ${testName}`, color);
  if (error) {
    log(`  Error: ${error}`, 'red');
  }
}

function printSummary() {
  log('\n' + '='.repeat(50), 'blue');
  log('TEST SUMMARY', 'blue');
  log('='.repeat(50), 'blue');
  log(`Total Tests: ${results.tests.length}`);
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`);
  log('='.repeat(50) + '\n', 'blue');
}

// Helper function to create a test file
function createTestFile() {
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
  
  testFilePath = path.join(tempDir, 'test-document.txt');
  fs.writeFileSync(testFilePath, 'This is a test document for upload testing.');
  return testFilePath;
}

// Helper function to clean up test files
function cleanupTestFiles() {
  try {
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  } catch (error) {
    log(`Cleanup error: ${error.message}`, 'yellow');
  }
}

// Test 1: Login as admin
async function testLogin() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@school.com',
      password: 'admin123'
    });

    if (response.data.success && response.data.data.token) {
      authToken = response.data.data.token;
      logTest('Admin Login', true);
      return true;
    }
    
    logTest('Admin Login', false, 'No token received');
    return false;
  } catch (error) {
    logTest('Admin Login', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 2: Create a test student
async function testCreateStudent() {
  try {
    const response = await axios.post(
      `${BASE_URL}/students`,
      {
        name: 'Test Student for Documents',
        father_name: 'Test Father',
        date_of_birth: '2010-01-15',
        gender: 'MALE',
        religion: 'ISLAM',
        phone: '03001234567',
        address: 'Test Address',
        admission_date: new Date().toISOString().split('T')[0]
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    if (response.data.success && response.data.data.id) {
      studentId = response.data.data.id;
      logTest('Create Test Student', true);
      return true;
    }
    
    logTest('Create Test Student', false, 'No student ID received');
    return false;
  } catch (error) {
    logTest('Create Test Student', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 3: Upload single document
async function testUploadDocument() {
  try {
    const filePath = createTestFile();
    const form = new FormData();
    form.append('document', fs.createReadStream(filePath));
    form.append('document_type', 'BIRTH_CERTIFICATE');
    form.append('description', 'Test birth certificate upload');

    const response = await axios.post(
      `${BASE_URL}/students/${studentId}/documents`,
      form,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          ...form.getHeaders()
        }
      }
    );

    if (response.data.success && response.data.data.document) {
      documentId = response.data.data.document.id;
      logTest('Upload Single Document', true);
      return true;
    }
    
    logTest('Upload Single Document', false, 'No document returned');
    return false;
  } catch (error) {
    logTest('Upload Single Document', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 4: Get student documents
async function testGetStudentDocuments() {
  try {
    const response = await axios.get(
      `${BASE_URL}/students/${studentId}/documents`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const passed = response.data.success && 
                   response.data.data.documents.length > 0;
    
    logTest('Get Student Documents', passed);
    return passed;
  } catch (error) {
    logTest('Get Student Documents', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 5: Get document by ID
async function testGetDocumentById() {
  try {
    const response = await axios.get(
      `${BASE_URL}/documents/${documentId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const passed = response.data.success && 
                   response.data.data.id === documentId;
    
    logTest('Get Document By ID', passed);
    return passed;
  } catch (error) {
    logTest('Get Document By ID', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 6: Get signed URL for document
async function testGetSignedUrl() {
  try {
    const response = await axios.get(
      `${BASE_URL}/documents/${documentId}/url`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const passed = response.data.success && 
                   response.data.data.signed_url;
    
    logTest('Get Signed URL', passed);
    return passed;
  } catch (error) {
    logTest('Get Signed URL', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 7: Update document details
async function testUpdateDocument() {
  try {
    const response = await axios.put(
      `${BASE_URL}/documents/${documentId}`,
      {
        document_type: 'SCHOOL_LEAVING_CERTIFICATE',
        description: 'Updated description'
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const passed = response.data.success && 
                   response.data.data.document_type === 'SCHOOL_LEAVING_CERTIFICATE';
    
    logTest('Update Document Details', passed);
    return passed;
  } catch (error) {
    logTest('Update Document Details', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 8: Filter documents by type
async function testFilterDocumentsByType() {
  try {
    const response = await axios.get(
      `${BASE_URL}/students/${studentId}/documents?document_type=SCHOOL_LEAVING_CERTIFICATE`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const passed = response.data.success && 
                   response.data.data.documents.length > 0 &&
                   response.data.data.documents.every(doc => 
                     doc.document_type === 'SCHOOL_LEAVING_CERTIFICATE'
                   );
    
    logTest('Filter Documents By Type', passed);
    return passed;
  } catch (error) {
    logTest('Filter Documents By Type', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 9: Upload multiple documents
async function testUploadMultipleDocuments() {
  try {
    const form = new FormData();
    
    // Create multiple test files
    const file1Path = path.join(__dirname, 'temp', 'doc1.txt');
    const file2Path = path.join(__dirname, 'temp', 'doc2.txt');
    
    fs.writeFileSync(file1Path, 'Test document 1');
    fs.writeFileSync(file2Path, 'Test document 2');
    
    form.append('documents', fs.createReadStream(file1Path));
    form.append('documents', fs.createReadStream(file2Path));
    form.append('document_type', 'MEDICAL_REPORT');
    form.append('description', 'Bulk upload test');

    const response = await axios.post(
      `${BASE_URL}/students/${studentId}/documents/bulk`,
      form,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          ...form.getHeaders()
        }
      }
    );

    const passed = response.data.success && 
                   response.data.data.count === 2;
    
    logTest('Upload Multiple Documents', passed);
    
    // Cleanup
    fs.unlinkSync(file1Path);
    fs.unlinkSync(file2Path);
    
    return passed;
  } catch (error) {
    logTest('Upload Multiple Documents', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 10: Get document statistics
async function testGetDocumentStats() {
  try {
    const response = await axios.get(
      `${BASE_URL}/stats`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const passed = response.data.success && 
                   response.data.data.overall &&
                   response.data.data.by_type;
    
    logTest('Get Document Statistics', passed);
    return passed;
  } catch (error) {
    logTest('Get Document Statistics', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 11: Try to upload without authentication
async function testUploadWithoutAuth() {
  try {
    const filePath = createTestFile();
    const form = new FormData();
    form.append('document', fs.createReadStream(filePath));
    form.append('document_type', 'OTHER');

    await axios.post(
      `${BASE_URL}/students/${studentId}/documents`,
      form,
      {
        headers: form.getHeaders()
      }
    );

    logTest('Upload Without Authentication (Should Fail)', false, 'Request succeeded when it should have failed');
    return false;
  } catch (error) {
    const passed = error.response?.status === 401;
    logTest('Upload Without Authentication (Should Fail)', passed);
    return passed;
  }
}

// Test 12: Try to upload for non-existent student
async function testUploadForNonExistentStudent() {
  try {
    const filePath = createTestFile();
    const form = new FormData();
    form.append('document', fs.createReadStream(filePath));
    form.append('document_type', 'OTHER');

    await axios.post(
      `${BASE_URL}/students/999999/documents`,
      form,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          ...form.getHeaders()
        }
      }
    );

    logTest('Upload For Non-Existent Student (Should Fail)', false, 'Request succeeded when it should have failed');
    return false;
  } catch (error) {
    const passed = error.response?.status === 404;
    logTest('Upload For Non-Existent Student (Should Fail)', passed);
    return passed;
  }
}

// Test 13: Delete document
async function testDeleteDocument() {
  try {
    const response = await axios.delete(
      `${BASE_URL}/documents/${documentId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const passed = response.data.success;
    logTest('Delete Document', passed);
    return passed;
  } catch (error) {
    logTest('Delete Document', false, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 14: Verify document is deleted
async function testVerifyDocumentDeleted() {
  try {
    await axios.get(
      `${BASE_URL}/documents/${documentId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    logTest('Verify Document Deleted (Should Fail)', false, 'Document still exists');
    return false;
  } catch (error) {
    const passed = error.response?.status === 404;
    logTest('Verify Document Deleted (Should Fail)', passed);
    return passed;
  }
}

// Cleanup: Delete test student
async function cleanupTestStudent() {
  try {
    await axios.delete(
      `${BASE_URL}/students/${studentId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    log('✓ Test student cleaned up', 'green');
  } catch (error) {
    log('✗ Failed to clean up test student', 'yellow');
  }
}

// Main test runner
async function runTests() {
  log('\n' + '='.repeat(50), 'blue');
  log('DOCUMENT MANAGEMENT MODULE TESTS', 'blue');
  log('='.repeat(50) + '\n', 'blue');

  // Setup tests
  log('SETUP', 'yellow');
  const loginSuccess = await testLogin();
  if (!loginSuccess) {
    log('\nCannot proceed without authentication', 'red');
    return;
  }

  const studentCreated = await testCreateStudent();
  if (!studentCreated) {
    log('\nCannot proceed without test student', 'red');
    return;
  }

  log('\n' + '-'.repeat(50) + '\n', 'yellow');

  // Main tests
  log('MAIN TESTS', 'yellow');
  await testUploadDocument();
  await testGetStudentDocuments();
  await testGetDocumentById();
  await testGetSignedUrl();
  await testUpdateDocument();
  await testFilterDocumentsByType();
  await testUploadMultipleDocuments();
  await testGetDocumentStats();

  log('\n' + '-'.repeat(50) + '\n', 'yellow');

  // Error handling tests
  log('ERROR HANDLING TESTS', 'yellow');
  await testUploadWithoutAuth();
  await testUploadForNonExistentStudent();

  log('\n' + '-'.repeat(50) + '\n', 'yellow');

  // Cleanup tests
  log('CLEANUP TESTS', 'yellow');
  await testDeleteDocument();
  await testVerifyDocumentDeleted();

  // Cleanup
  log('\n' + '-'.repeat(50) + '\n', 'yellow');
  log('CLEANUP', 'yellow');
  await cleanupTestStudent();
  cleanupTestFiles();

  // Print summary
  printSummary();

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  log('\nUnhandled error occurred:', 'red');
  console.error(error);
  cleanupTestFiles();
  process.exit(1);
});

// Run tests
runTests();
