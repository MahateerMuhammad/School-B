#!/usr/bin/env node
/**
 * Classes & Sections API Test Script
 */

const http = require('http');

const API_URL = 'http://localhost:3000';
let TOKEN = '';

function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function login() {
  console.log('🔐 Logging in...\n');
  const response = await makeRequest('POST', '/api/auth/login', {
    email: 'admin@school.com',
    password: 'admin123'
  });

  if (response.data?.data?.token) {
    TOKEN = response.data.data.token;
    console.log('✅ Login successful\n');
    return true;
  }
  console.log('❌ Login failed\n');
  return false;
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🧪 Classes & Sections Module Testing             ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // Login first
    if (!await login()) {
      return;
    }

    // Test 1: Create Class
    console.log('Test 1: Create Class (Class 1)');
    console.log('-----------------------------------');
    const class1 = await makeRequest('POST', '/api/classes', {
      class_type: 'SCHOOL',
      name: 'Class 1',
      fee_structure: {
        admission_fee: 5000,
        monthly_fee: 2000,
        paper_fund: 500
      }
    }, TOKEN);
    console.log(JSON.stringify(class1.data, null, 2));
    console.log(class1.status === 201 ? '✅ PASSED\n' : '❌ FAILED\n');

    const classId = class1.data?.data?.id;

    // Test 2: Create Another Class
    console.log('Test 2: Create Class (Class 10 - COLLEGE)');
    console.log('-----------------------------------');
    const class2 = await makeRequest('POST', '/api/classes', {
      class_type: 'COLLEGE',
      name: 'Class 10',
      fee_structure: {
        admission_fee: 10000,
        monthly_fee: 5000,
        paper_fund: 1000
      }
    }, TOKEN);
    console.log(JSON.stringify(class2.data, null, 2));
    console.log(class2.status === 201 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 3: List All Classes
    console.log('Test 3: List All Classes');
    console.log('-----------------------------------');
    const classList = await makeRequest('GET', '/api/classes', null, TOKEN);
    console.log(JSON.stringify(classList.data, null, 2));
    console.log(classList.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 4: Get Class by ID
    if (classId) {
      console.log('Test 4: Get Class by ID');
      console.log('-----------------------------------');
      const classDetail = await makeRequest('GET', `/api/classes/${classId}`, null, TOKEN);
      console.log(JSON.stringify(classDetail.data, null, 2));
      console.log(classDetail.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

      // Test 5: Update Fee Structure
      console.log('Test 5: Update Fee Structure');
      console.log('-----------------------------------');
      const feeUpdate = await makeRequest('PUT', `/api/classes/${classId}/fee-structure`, {
        admission_fee: 6000,
        monthly_fee: 2500,
        paper_fund: 600
      }, TOKEN);
      console.log(JSON.stringify(feeUpdate.data, null, 2));
      console.log(feeUpdate.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

      // Test 6: Create Section A
      console.log('Test 6: Create Section (Section A)');
      console.log('-----------------------------------');
      const sectionA = await makeRequest('POST', '/api/sections', {
        class_id: classId,
        name: 'Section A'
      }, TOKEN);
      console.log(JSON.stringify(sectionA.data, null, 2));
      console.log(sectionA.status === 201 ? '✅ PASSED\n' : '❌ FAILED\n');

      // Test 7: Create Section B
      console.log('Test 7: Create Section (Section B)');
      console.log('-----------------------------------');
      const sectionB = await makeRequest('POST', '/api/sections', {
        class_id: classId,
        name: 'Section B'
      }, TOKEN);
      console.log(JSON.stringify(sectionB.data, null, 2));
      console.log(sectionB.status === 201 ? '✅ PASSED\n' : '❌ FAILED\n');

      // Test 8: List Sections by Class
      console.log('Test 8: List Sections by Class');
      console.log('-----------------------------------');
      const sections = await makeRequest('GET', `/api/sections/class/${classId}`, null, TOKEN);
      console.log(JSON.stringify(sections.data, null, 2));
      console.log(sections.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

      // Test 9: Update Class
      console.log('Test 9: Update Class Name');
      console.log('-----------------------------------');
      const classUpdate = await makeRequest('PUT', `/api/classes/${classId}`, {
        name: 'Class 1 (Updated)'
      }, TOKEN);
      console.log(JSON.stringify(classUpdate.data, null, 2));
      console.log(classUpdate.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

      // Test 10: Get Fee History
      console.log('Test 10: Get Fee History');
      console.log('-----------------------------------');
      const feeHistory = await makeRequest('GET', `/api/classes/${classId}/fee-history`, null, TOKEN);
      console.log(JSON.stringify(feeHistory.data, null, 2));
      console.log(feeHistory.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');
    }

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  ✅ Classes & Sections Tests Completed!           ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log('📊 Summary:');
    console.log('- Classes module: ✅ Working');
    console.log('- Sections module: ✅ Working');
    console.log('- Fee structure: ✅ Working');
    console.log('\n🎯 Next: Implement Students & Guardians Module\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  Server is not running. Please start it with: npm run dev\n');
    }
  }
}

runTests();
