/**
 * Script to delete all students from the database
 * This will clear:
 * 1. All student records
 * 2. All student class history (enrollment records)
 * 3. All document records
 * 4. All fee overrides
 * 
 * WARNING: This operation cannot be undone!
 */

require('dotenv').config();
const pool = require('./src/config/db');

async function deleteAllStudents() {
    const client = await pool.connect();
    
    try {
        console.log('Starting deletion of all students...\n');
        
        await client.query('BEGIN');
        
        // Get counts before deletion
        const countResult = await client.query(`
            SELECT 
                (SELECT COUNT(*) FROM students) as student_count,
                (SELECT COUNT(*) FROM student_class_history) as history_count,
                (SELECT COUNT(*) FROM student_documents) as document_count,
                (SELECT COUNT(*) FROM student_fee_overrides) as override_count,
                (SELECT COUNT(*) FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history)) as voucher_count,
                (SELECT COUNT(*) FROM fee_payments WHERE voucher_id IN (SELECT id FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history))) as payment_count
        `);
        
        const counts = countResult.rows[0];
        console.log('Current database state:');
        console.log(`  - Students: ${counts.student_count}`);
        console.log(`  - Class History Records: ${counts.history_count}`);
        console.log(`  - Document Records: ${counts.document_count}`);
        console.log(`  - Fee Override Records: ${counts.override_count}`);
        console.log(`  - Fee Vouchers: ${counts.voucher_count}`);
        console.log(`  - Fee Payments: ${counts.payment_count}`);
        console.log('');
        
        if (parseInt(counts.student_count) === 0) {
            console.log('No students found in database. Nothing to delete.');
            await client.query('ROLLBACK');
            return;
        }
        
        // Delete all related records (cascading in correct order)
        console.log('Deleting fee payments...');
        const paymentResult = await client.query('DELETE FROM fee_payments WHERE voucher_id IN (SELECT id FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history))');
        console.log(`  Deleted ${paymentResult.rowCount} fee payment records`);
        
        console.log('Deleting fee vouchers...');
        const voucherResult = await client.query('DELETE FROM fee_vouchers WHERE student_class_history_id IN (SELECT id FROM student_class_history)');
        console.log(`  Deleted ${voucherResult.rowCount} fee voucher records`);
        
        console.log('Deleting student documents...');
        const docResult = await client.query('DELETE FROM student_documents');
        console.log(`  Deleted ${docResult.rowCount} document records`);
        
        console.log('Deleting student fee overrides...');
        const overrideResult = await client.query('DELETE FROM student_fee_overrides');
        console.log(`  Deleted ${overrideResult.rowCount} fee override records`);
        
        console.log('Deleting student class history...');
        const historyResult = await client.query('DELETE FROM student_class_history');
        console.log(`  Deleted ${historyResult.rowCount} class history records`);
        
        console.log('Deleting students...');
        const studentResult = await client.query('DELETE FROM students');
        console.log(`  Deleted ${studentResult.rowCount} student records`);
        
        await client.query('COMMIT');
        
        console.log('\n✅ Successfully deleted all students and related records!');
        console.log('The database is now clean and ready for fresh imports.\n');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error deleting students:', error.message);
        console.error('Full error:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the deletion
deleteAllStudents()
    .then(() => {
        console.log('Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });
