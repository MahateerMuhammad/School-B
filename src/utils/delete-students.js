const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function deleteInactiveStudentsFromDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Connecting to database...');
    
    // Check current inactive students count
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM students WHERE is_active = false'
    );
    const inactiveCount = parseInt(countResult.rows[0].count);
    
    console.log(`📊 Found ${inactiveCount} inactive students to delete`);
    
    if (inactiveCount === 0) {
      console.log('✅ No inactive students found to delete.');
      return;
    }
    
    // Start transaction
    await client.query('BEGIN');
    
    console.log('🗑️  Starting deletion process...');
    
    // First, get the IDs of inactive students
    const inactiveStudents = await client.query(
      'SELECT id, name FROM students WHERE is_active = false ORDER BY id'
    );
    
    console.log(`📝 Students to be deleted (${inactiveStudents.rows.length}):`);
    inactiveStudents.rows.forEach((student, index) => {
      console.log(`   ${index + 1}. ${student.name} (ID: ${student.id})`);
    });
    
    console.log('');
    console.log('⚠️  WARNING: This will permanently delete students and may affect related data!');
    console.log('🔄 Proceeding with deletion in 3 seconds...');
    
    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Delete records that have RESTRICT constraints first
    console.log('🗑️  Step 1: Deleting fee voucher records...');
    try {
      const feeVoucherResult = await client.query(
        'DELETE FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history WHERE student_id IN (SELECT id FROM students WHERE is_active = false))'
      );
      console.log(`   ✅ Deleted ${feeVoucherResult.rowCount} fee voucher records`);
    } catch (e) {
      console.log('   ℹ️  No fee vouchers to delete or table not found');
    }

    console.log('🗑️  Step 2: Deleting fee payments...');
    try {
      const feePaymentResult = await client.query(
        'DELETE FROM fee_payments WHERE student_id IN (SELECT id FROM students WHERE is_active = false)'
      );
      console.log(`   ✅ Deleted ${feePaymentResult.rowCount} fee payment records`);
    } catch (e) {
      console.log('   ℹ️  No fee payments to delete or table not found');
    }

    console.log('🗑️  Step 3: Deleting student class history records...');
    const classHistoryResult = await client.query(
      'DELETE FROM student_class_history WHERE student_id IN (SELECT id FROM students WHERE is_active = false)'
    );
    console.log(`   ✅ Deleted ${classHistoryResult.rowCount} class history records`);

    console.log('🗑️  Step 4: Deleting discount records...');
    try {
      const discountResult = await client.query(
        'DELETE FROM student_discounts WHERE student_id IN (SELECT id FROM students WHERE is_active = false)'
      );
      console.log(`   ✅ Deleted ${discountResult.rowCount} discount records`);
    } catch (e) {
      console.log('   ℹ️  No discount records to delete or table not found');
    }
    
    // Now delete the students (CASCADE will handle other related tables)
    console.log('🗑️  Step 5: Deleting students (CASCADE will handle remaining relations)...');
    const deleteResult = await client.query(
      'DELETE FROM students WHERE is_active = false RETURNING id, name'
    );
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('✅ SUCCESS: Students deleted from database!');
    console.log(`🗑️  Permanently deleted ${deleteResult.rows.length} students from the database`);
    console.log('');
    console.log('ℹ️  Note: Students and all related data have been permanently removed.');
    console.log('ℹ️  This action cannot be undone!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error deleting students:', error.message);
    console.log('');
    console.log('💡 If you see a foreign key constraint error, there may be additional');
    console.log('   relationships that need to be handled before deletion.');
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the deletion
deleteInactiveStudentsFromDatabase();