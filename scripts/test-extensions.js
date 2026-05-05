
// ... (existing code)

async function test_11_concurrent_voucher_generation() {
    console.log('\n📝 TEST 11: Concurrent Voucher Generation');

    // Create new student
    const student = await apiRequest('POST', '/students', {
        name: 'Concurrent Test Student',
        roll_no: 'CONC001',
        enrollment: {
            class_id: testData.classId,
            section_id: testData.sectionId,
            start_date: '2026-07-01'
        }
    });

    // Fire 5 generation requests simultaneously
    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(
            apiRequest('POST', '/vouchers/generate', {
                student_id: student.data.id,
                month: '2026-07-01'
            }).then(res => ({ status: 'fulfilled', value: res }))
                .catch(err => ({ status: 'rejected', reason: err }))
        );
    }

    const results = await Promise.all(promises);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    console.log(`  Success: ${fulfilled.length}, Rejected: ${rejected.length}`);

    // Should have exactly 1 success and 4 rejections (duplicates)
    assert.strictEqual(fulfilled.length, 1, 'Only one request should succeed');
    assert.strictEqual(rejected.length, 4, 'Duplicates should be rejected');

    // Cleanup
    await dbQuery('DELETE FROM fee_payments WHERE voucher_id IN (SELECT id FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history WHERE student_id = $1))', [student.data.id]);
    await dbQuery('DELETE FROM fee_voucher_items WHERE voucher_id IN (SELECT id FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history WHERE student_id = $1))', [student.data.id]);
    await dbQuery('DELETE FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history WHERE student_id = $1)', [student.data.id]);
    await dbQuery('DELETE FROM student_class_history WHERE student_id = $1', [student.data.id]);
    await dbQuery('DELETE FROM students WHERE id = $1', [student.data.id]);

    console.log('✅ Concurrent generation handled correctly');
}

async function test_12_mid_month_enrollment() {
    console.log('\n📝 TEST 12: Mid-Month Enrollment');

    const student = await apiRequest('POST', '/students', {
        name: 'Mid Month Student',
        roll_no: 'MID001',
        enrollment: {
            class_id: testData.classId,
            section_id: testData.sectionId,
            start_date: '2026-08-15' // Joined mid-month
        }
    });

    // Generate voucher for that month
    const voucher = await apiRequest('POST', '/vouchers/generate', {
        student_id: student.data.id,
        month: '2026-08-01'
    });

    // Should behave normally (full fees) unless pro-rata logic exists
    // Assuming design is full fee for joining month
    assert(voucher.data.items.length > 0);

    // Verify separate voucher items
    const monthlyFee = voucher.data.items.find(i => i.item_type === 'MONTHLY');
    assert(monthlyFee, 'Should have monthly fee');

    // Cleanup
    await dbQuery('DELETE FROM fee_voucher_items WHERE voucher_id = $1', [voucher.data.voucher_id]);
    await dbQuery('DELETE FROM fee_vouchers WHERE id = $1', [voucher.data.voucher_id]);
    await dbQuery('DELETE FROM student_class_history WHERE student_id = $1', [student.data.id]);
    await dbQuery('DELETE FROM students WHERE id = $1', [student.data.id]);

    console.log('✅ Mid-month enrollment handled');
}

async function test_13_class_fee_structure_change() {
    console.log('\n📝 TEST 13: Fee Structure Change');

    // Update class fee structure
    await apiRequest('PUT', `/classes/${testData.classId}`, {
        fee_structure: {
            admission_fee: 5500, // Changed
            monthly_fee: 2200,   // Changed
            paper_fund: 550      // Changed
        }
    });

    // Create new student
    const student = await apiRequest('POST', '/students', {
        name: 'New Fee Student',
        roll_no: 'FEE001',
        enrollment: {
            class_id: testData.classId,
            section_id: testData.sectionId,
            start_date: '2026-09-01'
        }
    });

    // Generate voucher
    const voucher = await apiRequest('POST', '/vouchers/generate', {
        student_id: student.data.id,
        month: '2026-09-01'
    });

    const monthlyItem = voucher.data.items.find(i => i.item_type === 'MONTHLY');
    assert.strictEqual(monthlyItem.amount, '2200.00', 'Should use new fee structure');

    // Cleanup
    await dbQuery('DELETE FROM fee_voucher_items WHERE voucher_id = $1', [voucher.data.voucher_id]);
    await dbQuery('DELETE FROM fee_vouchers WHERE id = $1', [voucher.data.voucher_id]);
    await dbQuery('DELETE FROM student_class_history WHERE student_id = $1', [student.data.id]);
    await dbQuery('DELETE FROM students WHERE id = $1', [student.data.id]);

    console.log('✅ Fee structure changes apply to new vouchers');
}
