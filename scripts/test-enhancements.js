#!/usr/bin/env node

/**
 * Verification Script for Fee/Promotion Enhancements
 * Tests:
 * 1. Arrears auto-inclusion in vouchers
 * 2. Promotion check for arrears
 * 3. Promotion fee application
 */

const axios = require('axios');
const assert = require('assert');
const { Pool } = require('pg');
require('dotenv').config();

const API_BASE = 'http://localhost:3000/api';
let authToken = '';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function apiRequest(method, endpoint, data = null) {
    try {
        const config = {
            method,
            url: `${API_BASE}${endpoint}`,
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            data
        };
        const response = await axios(config);
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`  ❌ API Error [${method} ${endpoint}]:`, JSON.stringify(error.response.data));
            return { error: true, status: error.response.status, data: error.response.data };
        }
        throw error;
    }
}

async function dbQuery(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows;
}

const testData = {
    classId: null,
    newClassId: null,
    studentId: null,
    voucher1Id: null
};

async function setup() {
    console.log('🚀 Setting up test data...');

    // Login
    const login = await apiRequest('POST', '/auth/login', {
        email: 'admin@test.com',
        password: 'Admin123!'
    });
    authToken = login.data.token;

    // Create Classes
    const c1 = await apiRequest('POST', '/classes', {
        name: 'Promo Test Class 1',
        class_type: 'SCHOOL',
        fee_structure: { monthly_fee: 1000 }
    });
    testData.classId = c1.data.id;

    const c2 = await apiRequest('POST', '/classes', {
        name: 'Promo Test Class 2',
        class_type: 'SCHOOL',
        fee_structure: { monthly_fee: 2000, promotion_fee: 500 }
    });
    testData.newClassId = c2.data.id;

    // Create Sections
    const s1 = await apiRequest('POST', '/sections', { class_id: testData.classId, name: 'S1' });
    const s2 = await apiRequest('POST', '/sections', { class_id: testData.newClassId, name: 'S2' });
    testData.sectionId1 = s1.data.id;
    testData.sectionId2 = s2.data.id;

    // Create Student
    const student = await apiRequest('POST', '/students', {
        name: 'Enhancement Tester',
        enrollment: { class_id: testData.classId, section_id: testData.sectionId1 }
    });
    testData.studentId = student.data.id;
}

async function test_arrears_inclusion() {
    console.log('\n📝 Test: Arrears Auto-Inclusion');

    // 1. Generate month 1 voucher
    const v1 = await apiRequest('POST', '/vouchers/generate', {
        student_id: testData.studentId,
        month: '2026-01-01'
    });
    testData.voucher1Id = v1.data.voucher_id;
    console.log('  Voucher 1 generated (Unpaid)');

    // 2. Generate month 2 voucher
    const v2 = await apiRequest('POST', '/vouchers/generate', {
        student_id: testData.studentId,
        month: '2026-02-01'
    });

    const items = v2.data.items;
    const arrearsItem = items.find(i => i.item_type === 'ARREARS');

    assert(arrearsItem, 'Should have ARREARS item in next voucher');
    assert(parseFloat(arrearsItem.amount) > 0, 'Arrears amount should be positive');
    console.log(`  ✅ Arrears included: ${arrearsItem.amount}`);
}

async function test_promotion_block_by_arrears() {
    console.log('\n📝 Test: Promotion Block by Arrears');

    // Try to promote with arrears
    const promo = await apiRequest('POST', `/students/${testData.studentId}/promote`, {
        class_id: testData.newClassId,
        section_id: testData.sectionId2
    });

    assert(promo.error, 'Promotion should fail when arrears exist');
    assert.strictEqual(promo.status, 400);
    assert(promo.data.message.includes('outstanding dues'), 'Error message should mention dues');
    console.log('  ✅ Promotion blocked as expected');
}

async function test_promotion_forced_and_fee() {
    console.log('\n📝 Test: Forced Promotion and Promotion Fee');

    // Promote with force: true
    const promo = await apiRequest('POST', `/students/${testData.studentId}/promote`, {
        class_id: testData.newClassId,
        section_id: testData.sectionId2,
        force: true
    });

    assert(!promo.error, 'Forced promotion should succeed');
    console.log('  Promoted with force=true');

    // Generate voucher for new class
    const v3 = await apiRequest('POST', '/vouchers/generate', {
        student_id: testData.studentId,
        month: '2026-03-01'
    });

    const items = v3.data.items;
    const promoFeeItem = items.find(i => i.item_type === 'PROMOTION');
    const arrearsItem = items.find(i => i.item_type === 'ARREARS');

    assert(promoFeeItem, 'Should have PROMOTION fee in new class voucher');
    assert.strictEqual(parseFloat(promoFeeItem.amount), 500);
    assert(arrearsItem, 'Should still carry ARREARS after promotion');

    console.log(`  ✅ Promotion fee applied: ${promoFeeItem.amount}`);
    console.log(`  ✅ Arrears carried forward: ${arrearsItem.amount}`);
}

async function cleanup() {
    console.log('\n🧹 Cleaning up...');
    if (testData.studentId) {
        await dbQuery('DELETE FROM fee_voucher_items WHERE voucher_id IN (SELECT id FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history WHERE student_id = $1))', [testData.studentId]);
        await dbQuery('DELETE FROM fee_payments WHERE voucher_id IN (SELECT id FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history WHERE student_id = $1))', [testData.studentId]);
        await dbQuery('DELETE FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history WHERE student_id = $1)', [testData.studentId]);
        await dbQuery('DELETE FROM student_class_history WHERE student_id = $1', [testData.studentId]);
        await dbQuery('DELETE FROM students WHERE id = $1', [testData.studentId]);
    }
    if (testData.classId) {
        await dbQuery('DELETE FROM sections WHERE class_id = $1', [testData.classId]);
        await dbQuery('DELETE FROM class_fee_structure WHERE class_id = $1', [testData.classId]);
        await dbQuery('DELETE FROM classes WHERE id = $1', [testData.classId]);
    }
    if (testData.newClassId) {
        await dbQuery('DELETE FROM sections WHERE class_id = $1', [testData.newClassId]);
        await dbQuery('DELETE FROM class_fee_structure WHERE class_id = $1', [testData.newClassId]);
        await dbQuery('DELETE FROM classes WHERE id = $1', [testData.newClassId]);
    }
    await pool.end();
}

async function run() {
    try {
        await setup();
        await test_arrears_inclusion();
        await test_promotion_block_by_arrears();
        await test_promotion_forced_and_fee();
        console.log('\n🎉 ALL ENHANCEMENT TESTS PASSED!');
    } catch (e) {
        console.error('\n❌ TEST FAILED:', e.message);
        process.exit(1);
    } finally {
        await cleanup();
    }
}

run();
