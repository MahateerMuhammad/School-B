const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const API_BASE = 'http://localhost:3000/api';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Test Data
let testData = {
    classId: null,
    sectionId: null,
    students: {
        newJoiner: null,
        oldStudent: null,
        discountedStudent: null
    }
};

// Utils
async function apiRequest(method, endpoint, data = null, authToken = null) {
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
            throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function dbQuery(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows;
}

// ==========================================
// TEST SCENARIOS
// ==========================================

async function setupTestEnvironment() {
    console.log('\n🔧 Setting up test environment...');

    // Login
    const login = await apiRequest('POST', '/auth/login', {
        email: process.env.ADMIN_EMAIL || 'admin@school.com',
        password: process.env.ADMIN_PASSWORD || 'admin123'
    });
    const token = login.data.token;
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // Create Class with verifyable fee structure
    const classRes = await apiRequest('POST', '/classes', {
        name: `Bulk Test Class ${Date.now()}`,
        class_type: 'SCHOOL',
        fee_structure: {
            admission_fee: 5000,
            monthly_fee: 2000,
            paper_fund: 500
        }
    });
    testData.classId = classRes.data.id;

    // Create Section
    const sectionRes = await apiRequest('POST', '/sections', {
        name: 'A',
        class_id: testData.classId
    });
    testData.sectionId = sectionRes.data.id;

    console.log(`✅ Class created: ${classRes.data.name} (ID: ${testData.classId})`);
}

async function createStudents(month1Date) {
    console.log('\n👥 Creating students...');

    // 1. New Joiner (Joins in Month 1)
    const newJoiner = await apiRequest('POST', '/students', {
        name: 'New Joiner',
        roll_no: `NEW${Date.now()}`,
        enrollment: {
            class_id: testData.classId,
            section_id: testData.sectionId,
            start_date: month1Date // Joined this month
        }
    });
    testData.students.newJoiner = newJoiner.data;

    // 2. Old Student (Joined Last Month)
    // Calculate last month date
    const d = new Date(month1Date);
    d.setMonth(d.getMonth() - 1);
    const lastMonthDate = d.toISOString().split('T')[0];

    const oldStudent = await apiRequest('POST', '/students', {
        name: 'Old Student',
        roll_no: `OLD${Date.now()}`,
        enrollment: {
            class_id: testData.classId,
            section_id: testData.sectionId,
            start_date: lastMonthDate // Joined last month
        }
    });
    console.log('Old Student Resp:', JSON.stringify(oldStudent.data, null, 2));
    testData.students.oldStudent = oldStudent.data;

    // The API might return { student: {...}, enrollment: {...} } or flat student object with enrollment details
    // But it seems it doesn't return enrollment ID. Fetch from DB.
    const schResult = await dbQuery(
        'SELECT id FROM student_class_history WHERE student_id = $1 AND class_id = $2',
        [oldStudent.data.id, testData.classId]
    );

    if (schResult.length === 0) {
        throw new Error('Could not find enrollment ID in DB for old student');
    }
    const schId = schResult[0].id;

    // Manually insert a "fake" voucher for last month for the old student 
    // to simulate history (needed for isFirstEnrollment check logic if strictly dependent on voucher count)
    // Ideally the logic checks existing vouchers count.
    await dbQuery(`INSERT INTO fee_vouchers (student_class_history_id, month, due_date) VALUES ($1, $2, $3)`,
        [schId, lastMonthDate, lastMonthDate]);

    // 3. Discounted Student (Joins Month 1 but has discount)
    const discountStudent = await apiRequest('POST', '/students', {
        name: 'Discount Student',
        roll_no: `DISC${Date.now()}`,
        enrollment: {
            class_id: testData.classId,
            section_id: testData.sectionId,
            start_date: month1Date
        }
    });
    testData.students.discountedStudent = discountStudent.data;

    // Add Discount (50% off monthly)
    await apiRequest('POST', '/discounts', {
        student_id: discountStudent.data.id,
        class_id: testData.classId,
        discount_type: 'PERCENTAGE',
        discount_value: 50,
        reason: 'Scholarship'
    });

    console.log('✅ Students created: New, Old, Discounted');
}

async function testMonth1Generation(month1Date) {
    console.log(`\n📅 Testing Month 1 Generation (${month1Date})...`);

    const res = await apiRequest('POST', '/vouchers/generate-bulk', {
        class_id: testData.classId,
        section_id: testData.sectionId,
        month: month1Date
    });

    console.log(`  Generated: ${res.data.summary.generated}`);

    // Verify New Joiner
    const vNew = await getVoucher(testData.students.newJoiner.id, month1Date);
    verifyFee(vNew, 7500, 'New Joiner (Adm+Mon+Paper)'); // 5000+2000+500

    // Verify Old Student
    const vOld = await getVoucher(testData.students.oldStudent.id, month1Date);
    verifyFee(vOld, 2500, 'Old Student (Mon+Paper)'); // 2000+500

    // Verify Discounted Student
    // Admission (5000) not discounted typically unless specified? 
    // Let's assume Discount applies to grand total or specific items? 
    // The current implementation applies discount as a negative line item.
    // If discount is 50% PERCENTAGE, it usually applies to Tuition/Monthly fee.
    // Let's check calculation: 
    // Total = 5000 + 2000 + 500 = 7500.
    // Discount = 50% of 7500? Or just monthly?
    // Implementation: Vouchers controller applies discount to total or specific?
    // Let's assume global % for now and verify actual.
    const vDisc = await getVoucher(testData.students.discountedStudent.id, month1Date);
    console.log(`  Discount Student Total: ${vDisc.total_fee}`);
    // We'll inspect the amount to assert.
}

async function testMonth2Generation(month2Date) {
    console.log(`\n📅 Testing Month 2 Generation (${month2Date})...`);

    const res = await apiRequest('POST', '/vouchers/generate-bulk', {
        class_id: testData.classId,
        section_id: testData.sectionId,
        month: month2Date
    });

    console.log(`  Generated: ${res.data.summary.generated}`);

    // Verify New Joiner (Now Old)
    const vNew = await getVoucher(testData.students.newJoiner.id, month2Date);
    // Should NOT have admission fee now
    verifyFee(vNew, 2500, 'New Joiner in Month 2 (No Admission)');

    // Verify Old Student
    const vOld = await getVoucher(testData.students.oldStudent.id, month2Date);
    verifyFee(vOld, 2500, 'Old Student in Month 2');
}

// Helpers
async function getVoucher(studentId, monthDate) {
    const res = await apiRequest('GET', `/vouchers?student_id=${studentId}&month=${monthDate}`);
    // Because GET /vouchers filters by month range date_trunc, we need to be precise or filtering
    // Actually the list endpoint filters by month param.
    // Let's verify we get 1.
    return res.data.data ? res.data.data[0] : res.data[0];
}

function verifyFee(voucher, expectedAmount, label) {
    if (!voucher) {
        console.error(`❌ ${label}: Voucher not found!`);
        process.exit(1);
    }
    const actual = parseFloat(voucher.total_fee);
    if (actual === expectedAmount) {
        console.log(`✅ ${label}: Correct Amount (${actual})`);
    } else {
        console.error(`❌ ${label}: Expected ${expectedAmount}, Got ${actual}`);
        console.log('Items:', JSON.stringify(voucher.items, null, 2));
        process.exit(1);
    }
}

async function cleanup() {
    console.log('\n🧹 Cleaning up...');
    if (testData.classId) {
        // Delete voucher items
        await dbQuery('DELETE FROM fee_voucher_items WHERE voucher_id IN (SELECT id FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history WHERE class_id = $1))', [testData.classId]);
        // Delete vouchers
        await dbQuery('DELETE FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history WHERE class_id = $1)', [testData.classId]);
        // Delete discounts
        await dbQuery('DELETE FROM student_discounts WHERE student_id IN (SELECT student_id FROM student_class_history WHERE class_id = $1)', [testData.classId]);
        // Delete enrollments
        await dbQuery('DELETE FROM student_class_history WHERE class_id = $1', [testData.classId]);
        // Delete students (optional, but good for clean)
        // ...
        // Delete section/class
        await dbQuery('DELETE FROM sections WHERE class_id = $1', [testData.classId]);
        await dbQuery('DELETE FROM class_fee_structure WHERE class_id = $1', [testData.classId]);
        await dbQuery('DELETE FROM classes WHERE id = $1', [testData.classId]);
    }
    console.log('✅ Cleanup complete');
}

// Runner
(async () => {
    try {
        await setupTestEnvironment();

        const month1 = '2026-03-01'; // Future dates
        const month2 = '2026-04-01';

        await createStudents(month1);
        await testMonth1Generation(month1);
        await testMonth2Generation(month2);

    } catch (err) {
        console.error('💥 Test Failed:', err.message);
        if (err.response) console.error(err.response.data);
    } finally {
        await cleanup();
        await pool.end();
    }
})();
