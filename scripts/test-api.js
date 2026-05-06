#!/usr/bin/env node
/**
 * API Test Script
 * Simple test for authentication endpoints
 */

const http = require('http');

const API_URL = 'https://school-b-zk0h.onrender.com';

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

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🧪 School Management System - API Testing        ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: Health Check
    console.log('Test 1: Health Check');
    console.log('-----------------------------------');
    const health = await makeRequest('GET', '/health');
    console.log(JSON.stringify(health.data, null, 2));
    console.log(health.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 2: Login
    console.log('Test 2: Admin Login');
    console.log('-----------------------------------');
    const login = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@school.com',
      password: 'admin123'
    });
    console.log(JSON.stringify(login.data, null, 2));
    const token = login.data?.data?.token;
    console.log(token ? '✅ PASSED\n' : '❌ FAILED\n');

    if (!token) {
      console.log('❌ Cannot continue without token');
      return;
    }

    // Test 3: Get Profile
    console.log('Test 3: Get User Profile');
    console.log('-----------------------------------');
    const profile = await makeRequest('GET', '/api/auth/profile', null, token);
    console.log(JSON.stringify(profile.data, null, 2));
    console.log(profile.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 4: List Users
    console.log('Test 4: List All Users');
    console.log('-----------------------------------');
    const users = await makeRequest('GET', '/api/auth/users', null, token);
    console.log(JSON.stringify(users.data, null, 2));
    console.log(users.status === 200 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 5: Unauthorized Access
    console.log('Test 5: Unauthorized Access Test');
    console.log('-----------------------------------');
    const unauth = await makeRequest('GET', '/api/auth/profile');
    console.log(JSON.stringify(unauth.data, null, 2));
    console.log(unauth.status === 401 ? '✅ PASSED\n' : '❌ FAILED\n');

    // Test 6: Invalid Login
    console.log('Test 6: Invalid Login Test');
    console.log('-----------------------------------');
    const invalid = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@school.com',
      password: 'wrongpassword'
    });
    console.log(JSON.stringify(invalid.data, null, 2));
    console.log(invalid.status === 401 ? '✅ PASSED\n' : '❌ FAILED\n');

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  ✅ All API Tests Completed!                      ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  Server is not running. Please start it with: npm run dev\n');
    }
  }
}

runTests();
