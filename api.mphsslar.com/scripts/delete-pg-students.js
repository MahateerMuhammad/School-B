require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function deletePGStudents() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get PG class ID
    const classResult = await client.query(
      "SELECT id FROM classes WHERE name = 'PG'"
    );
    
    if (classResult.rows.length === 0) {
      console.log('❌ PG class not found');
      await client.query('ROLLBACK');
      return;
    }
    
    const pgClassId = classResult.rows[0].id;
    console.log(`📚 PG Class ID: ${pgClassId}`);
    
    // Get Section A and B IDs
    const sectionsResult = await client.query(
      "SELECT id, name FROM sections WHERE name IN ('A', 'B')"
    );
    
    const sectionIds = sectionsResult.rows.map(s => s.id);
    console.log(`📑 Section IDs (A & B): ${sectionIds.join(', ')}`);
    
    // Get students from PG sections A and B
    const studentsResult = await client.query(
      `SELECT DISTINCT s.id, s.name, s.roll_no, sec.name as section_name
       FROM students s
       JOIN student_class_history sch ON s.id = sch.student_id
       JOIN sections sec ON sch.section_id = sec.id
       WHERE sch.class_id = $1 
       AND sch.section_id = ANY($2)
       AND sch.end_date IS NULL`,
      [pgClassId, sectionIds]
    );
    
    console.log(`\n👥 Found ${studentsResult.rows.length} students in PG Sections A & B:`);
    studentsResult.rows.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.name} (${s.roll_no}) - Section ${s.section_name}`);
    });
    
    if (studentsResult.rows.length === 0) {
      console.log('\n✅ No students to delete');
      await client.query('ROLLBACK');
      return;
    }
    
    const studentIds = studentsResult.rows.map(s => s.id);
    
    // Delete in correct order (CASCADE)
    console.log('\n🗑️ Deleting related records...');
    
    // 1. Delete fee payments first (they reference vouchers)
    const paymentsResult = await client.query(
      `DELETE FROM fee_payments 
       WHERE voucher_id IN (
         SELECT id FROM fee_vouchers 
         WHERE student_class_history_id IN (
           SELECT id FROM student_class_history WHERE student_id = ANY($1)
         )
       )`,
      [studentIds]
    );
    console.log(`  ✓ Deleted ${paymentsResult.rowCount} fee payments`);
    
    // 2. Delete fee vouchers
    const vouchersResult = await client.query(
      `DELETE FROM fee_vouchers 
       WHERE student_class_history_id IN (
         SELECT id FROM student_class_history WHERE student_id = ANY($1)
       )`,
      [studentIds]
    );
    console.log(`  ✓ Deleted ${vouchersResult.rowCount} fee vouchers`);
    
    // 3. Delete student documents
    const docsResult = await client.query(
      'DELETE FROM student_documents WHERE student_id = ANY($1)',
      [studentIds]
    );
    console.log(`  ✓ Deleted ${docsResult.rowCount} student documents`);
    
    // 4. Delete student discounts
    const discountsResult = await client.query(
      'DELETE FROM student_discounts WHERE student_id = ANY($1)',
      [studentIds]
    );
    console.log(`  ✓ Deleted ${discountsResult.rowCount} student discounts`);
    
    // 5. Delete student guardians
    const guardiansResult = await client.query(
      'DELETE FROM student_guardians WHERE student_id = ANY($1)',
      [studentIds]
    );
    console.log(`  ✓ Deleted ${guardiansResult.rowCount} student-guardian links`);
    
    // 6. Delete class history
    const historyResult = await client.query(
      'DELETE FROM student_class_history WHERE student_id = ANY($1)',
      [studentIds]
    );
    console.log(`  ✓ Deleted ${historyResult.rowCount} class history records`);
    
    // 7. Finally delete students
    const studentsDeleteResult = await client.query(
      'DELETE FROM students WHERE id = ANY($1)',
      [studentIds]
    );
    console.log(`  ✓ Deleted ${studentsDeleteResult.rowCount} students`);
    
    await client.query('COMMIT');
    console.log(`\n✅ Successfully deleted ${studentsDeleteResult.rowCount} students from PG Sections A & B!`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

deletePGStudents()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });
