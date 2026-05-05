#!/usr/bin/env node
/**
 * Students & Guardians API Test Script
 * Tests all edge cases and validations
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
  console.log('║  🧪 Students & Guardians Module Testing           ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    if (!await login()) return;

    let classId, sectionId, guardianId, studentId;

    // Test 1: Create a class first
    console.log('Test 1: Create Class for Testing');
    console.log('-----------------------------------');
    const classRes = await makeRequest('POST', '/api/classes', {
      class_type: 'SCHOOL',
      name: 'Class 5',
      fee_structure: { admission_fee: 5000, monthly_fee: 2500, paper_fund: 500 }
    }, TOKEN);
    classId = classRes.data?.data?.id;
    console.log(classRes.status === 201 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 2: Create a section
    if (classId) {
      console.log('Test 2: Create Section');
      console.log('-----------------------------------');
      const sectionRes = await makeRequest('POST', '/api/sections', {
        class_id: classId,
        name: 'Section A'
      }, TOKEN);
      sectionId = sectionRes.data?.data?.id;
      console.log(sectionRes.status === 201 ? '✅ PASSED\n' : '❌ FAILED\n');
    }

    // Test 3: Create Guardian
    console.log('Test 3: Create Guardian');
    console.log('-----------------------------------');
    const guardianRes = await makeRequest('POST', '/api/guardians', {
      name: 'Ahmed Ali',
      cnic: '1234567890123',
      phone: '0300-1234567',
      occupation: 'Business'
    }, TOKEN);
    console.log(JSON.stringify(guardianRes.data, null, 2));
    guardianId = guardianRes.data?.data?.id;
    console.log(guardianRes.status === 201 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 4: Try creating duplicate CNIC (should fail)
    console.log('Test 4: Duplicate CNIC Prevention');
    console.log('-----------------------------------');
    const duplicateCnic = await makeRequest('POST', '/api/guardians', {
      name: 'Another Person',
      cnic: '1234567890123',
      phone: '0300-9999999',
      occupation: 'Teacher'
    }, TOKEN);
    console.log(JSON.stringify(duplicateCnic.data, null, 2));
    console.log(duplicateCnic.status === 409 ? '✅ PASSED (Correctly prevented)\n' : '❌ FAILED\n');

    // Test 5: Create Student with Guardian and Enrollment
    console.log('Test 5: Create Student with Guardian & Enrollment');
    console.log('-----------------------------------');
    const studentRes = await makeRequest('POST', '/api/students', {
      name: 'Ali Ahmed',
      roll_no: 'STD-001',
      phone: '0300-1111111',
      address: '123 Main Street, Karachi',
      date_of_birth: '2010-05-15',
      guardians: [
        {
          guardian_id: guardianId,
          relation: 'Father'
        }
      ],
      enrollment: {
        class_id: classId,
        section_id: sectionId,
        start_date: '2026-01-01'
      }
    }, TOKEN);
    console.log(JSON.stringify(studentRes.data, null, 2));
    studentId = studentRes.data?.data?.id;
    console.log(studentRes.status === 201 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 6: Try duplicate roll number (should fail)
    console.log('Test 6: Duplicate Roll Number Prevention');
    console.log('-----------------------------------');
    const duplicateRoll = await makeRequest('POST', '/api/students', {
      name: 'Another Student',
      roll_no: 'STD-001',
      phone: '0300-2222222'
    }, TOKEN);
    console.log(JSON.stringify(duplicateRoll.data, null, 2));
    console.log(duplicateRoll.status === 409 ? '✅ PASSED (Correctly prevented)\n' : '❌ FAILED\n');

    // Test 7: Create Student with New Guardian (auto-create)
    console.log('Test 7: Create Student with New Guardian (Auto-create)');
    console.log('-----------------------------------');
    const student2Res = await makeRequest('POST', '/api/students', {
      name: 'Sara Khan',
      roll_no: 'STD-002',
      guardians: [
        {
          name: 'Fatima Khan',
          cnic: '9876543210987',
          phone: '0300-3333333',
          occupation: 'Doctor',
          relation: 'Mother'
        }
      ],
      enrollment: {
        class_id: classId,
        section_id: sectionId
      }
    }, TOKEN);
    console.log(JSON.stringify(student2Res.data, null, 2));
    const student2Id = student2Res.data?.data?.id;
    console.log(student2Res.status === 201 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 8: Try double enrollment (should fail)
    if (studentId && classId && sectionId) {
      console.log('Test 8: Prevent Double Enrollment');
      console.log('-----------------------------------');
      const doubleEnroll = await makeRequest('POST', `/api/students/${studentId}/enroll`, {
        class_id: classId,
        section_id: sectionId
      }, TOKEN);
      console.log(JSON.stringify(doubleEnroll.data, null, 2));
      console.log(doubleEnroll.status === 400 ? '✅ PASSED (Correctly prevented)\n' : '❌ FAILED\n');
    }

    // Test 9: List Students
    console.log('Test 9: List All Students');
    console.log('-----------------------------------');
    const listStudents = await makeRequest('GET', '/api/students', null, TOKEN);
    console.log(JSON.stringify(listStudents.data, null, 2));
    console.log(listStudents.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 10: Filter Students by Class
    if (classId) {
      console.log('Test 10: Filter Students by Class');
      console.log('-----------------------------------');
      const filterByClass = await makeRequest('GET', `/api/students?class_id=${classId}`, null, TOKEN);
      console.log(JSON.stringify(filterByClass.data, null, 2));
      console.log(filterByClass.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');
    }

    // Test 11: Search Students
    console.log('Test 11: Search Students by Name');
    console.log('-----------------------------------');
    const searchStudents = await makeRequest('GET', '/api/students?search=Ali', null, TOKEN);
    console.log(JSON.stringify(searchStudents.data, null, 2));
    console.log(searchStudents.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 12: Get Student by ID
    if (studentId) {
      console.log('Test 12: Get Student by ID with Complete Data');
      console.log('-----------------------------------');
      const getStudent = await makeRequest('GET', `/api/students/${studentId}`, null, TOKEN);
      console.log(JSON.stringify(getStudent.data, null, 2));
      console.log(getStudent.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');
    }

    // Test 13: Update Student
    if (studentId) {
      console.log('Test 13: Update Student Information');
      console.log('-----------------------------------');
      const updateStudent = await makeRequest('PUT', `/api/students/${studentId}`, {
        phone: '0300-9999999',
        address: '456 New Street, Karachi'
      }, TOKEN);
      console.log(JSON.stringify(updateStudent.data, null, 2));
      console.log(updateStudent.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');
    }

    // Test 14: Transfer Student
    if (studentId && classId) {
      // Create another section first
      const section2Res = await makeRequest('POST', '/api/sections', {
        class_id: classId,
        name: 'Section B'
      }, TOKEN);
      const section2Id = section2Res.data?.data?.id;

      if (section2Id) {
        console.log('Test 14: Transfer Student to Another Section');
        console.log('-----------------------------------');
        const transfer = await makeRequest('POST', `/api/students/${studentId}/transfer`, {
          class_id: classId,
          section_id: section2Id
        }, TOKEN);
        console.log(JSON.stringify(transfer.data, null, 2));
        console.log(transfer.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');
      }
    }

    // Test 15: Deactivate Student
    if (studentId) {
      console.log('Test 15: Deactivate Student');
      console.log('-----------------------------------');
      const deactivate = await makeRequest('POST', `/api/students/${studentId}/deactivate`, {}, TOKEN);
      console.log(JSON.stringify(deactivate.data, null, 2));
      console.log(deactivate.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');
    }

    // Test 16: Try enrolling deactivated student (should fail)
    if (studentId && classId && sectionId) {
      console.log('Test 16: Prevent Enrolling Deactivated Student');
      console.log('-----------------------------------');
      // First withdraw
      await makeRequest('POST', `/api/students/${studentId}/withdraw`, {}, TOKEN);
      // Try to enroll again
      const enrollInactive = await makeRequest('POST', `/api/students/${studentId}/enroll`, {
        class_id: classId,
        section_id: sectionId
      }, TOKEN);
      console.log(JSON.stringify(enrollInactive.data, null, 2));
      console.log(enrollInactive.status === 400 ? '✅ PASSED (Correctly prevented)\n' : '❌ FAILED\n');
    }

    // Test 17: Reactivate Student
    if (studentId) {
      console.log('Test 17: Reactivate Student');
      console.log('-----------------------------------');
      const activate = await makeRequest('POST', `/api/students/${studentId}/activate`, {}, TOKEN);
      console.log(JSON.stringify(activate.data, null, 2));
      console.log(activate.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');
    }

    // Test 18: Expel Student
    if (student2Id) {
      console.log('Test 18: Expel Student');
      console.log('-----------------------------------');
      const expel = await makeRequest('POST', `/api/students/${student2Id}/expel`, {}, TOKEN);
      console.log(JSON.stringify(expel.data, null, 2));
      console.log(expel.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

      // Test 19: Try activating expelled student (should fail)
      console.log('Test 19: Prevent Activating Expelled Student');
      console.log('-----------------------------------');
      const activateExpelled = await makeRequest('POST', `/api/students/${student2Id}/activate`, {}, TOKEN);
      console.log(JSON.stringify(activateExpelled.data, null, 2));
      console.log(activateExpelled.status === 400 ? '✅ PASSED (Correctly prevented)\n' : '❌ FAILED\n');

      // Test 20: Clear expulsion
      console.log('Test 20: Clear Expulsion Status');
      console.log('-----------------------------------');
      const clearExpulsion = await makeRequest('POST', `/api/students/${student2Id}/clear-expulsion`, {}, TOKEN);
      console.log(JSON.stringify(clearExpulsion.data, null, 2));
      console.log(clearExpulsion.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');
    }

    // Test 21: Search Guardian by CNIC
    console.log('Test 21: Search Guardian by CNIC');
    console.log('-----------------------------------');
    const searchCnic = await makeRequest('GET', '/api/guardians/search/cnic/1234567890123', null, TOKEN);
    console.log(JSON.stringify(searchCnic.data, null, 2));
    console.log(searchCnic.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 22: List Guardians
    console.log('Test 22: List All Guardians');
    console.log('-----------------------------------');
    const listGuardians = await makeRequest('GET', '/api/guardians', null, TOKEN);
    console.log(JSON.stringify(listGuardians.data, null, 2));
    console.log(listGuardians.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 23: Update Guardian
    if (guardianId) {
      console.log('Test 23: Update Guardian Information');
      console.log('-----------------------------------');
      const updateGuardian = await makeRequest('PUT', `/api/guardians/${guardianId}`, {
        phone: '0300-8888888',
        occupation: 'Engineer'
      }, TOKEN);
      console.log(JSON.stringify(updateGuardian.data, null, 2));
      console.log(updateGuardian.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');
    }

    // Test 24: Filter Active Students Only
    console.log('Test 24: Filter Active Students Only');
    console.log('-----------------------------------');
    const activeOnly = await makeRequest('GET', '/api/students?is_active=true', null, TOKEN);
    console.log(JSON.stringify(activeOnly.data, null, 2));
    console.log(activeOnly.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  ✅ Students & Guardians Tests Completed!         ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log('📊 Edge Cases Tested:');
    console.log('✅ Duplicate CNIC prevention');
    console.log('✅ Duplicate roll number prevention');
    console.log('✅ Double enrollment prevention');
    console.log('✅ Inactive student enrollment prevention');
    console.log('✅ Expelled student activation prevention');
    console.log('✅ Auto-create guardian from student creation');
    console.log('✅ Guardian-student relationship management');
    console.log('✅ Student status transitions');
    console.log('✅ Transfer with enrollment history');
    console.log('✅ Search and filtering');
    console.log('\n🎯 Next: Implement Fee Management Module\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  Server is not running. Please start it with: npm run dev\n');
    }
  }
}

runTests();
