const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function deleteClass10thStudents() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Finding class 10th...\n');
    
    // Find class 10th
    const classQuery = `SELECT id, name FROM classes WHERE name ILIKE '%10th%' OR name = '10'`;
    const classResult = await client.query(classQuery);
    
    if (classResult.rows.length === 0) {
      console.log('❌ Class 10th not found');
      return;
    }
    
    const class10th = classResult.rows[0];
    console.log(`✅ Found class: ${class10th.name} (ID: ${class10th.id})\n`);
    
    // Find all students in class 10th
    const findStudentsQuery = `
      SELECT s.id, s.name, s.roll_no, s.phone, s.father_name, s.individual_monthly_fee
      FROM students s
      JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
      WHERE sch.class_id = $1
      ORDER BY s.name
    `;
    
    const studentsResult = await client.query(findStudentsQuery, [class10th.id]);
    
    console.log(`📊 Found ${studentsResult.rows.length} students in class 10th\n`);
    
    if (studentsResult.rows.length === 0) {
      console.log('No students to delete');
      return;
    }
    
    // Show first 5 students
    console.log('First 5 students:');
    studentsResult.rows.slice(0, 5).forEach((s, i) => {
      console.log(`${i + 1}. ${s.name} (Roll: ${s.roll_no}, Phone: ${s.phone || 'N/A'})`);
    });
    
    if (studentsResult.rows.length > 5) {
      console.log(`... and ${studentsResult.rows.length - 5} more students\n`);
    } else {
      console.log('');
    }
    
    console.log('⚠️  DELETING ALL STUDENTS IN CLASS 10TH...\n');
    
    await client.query('BEGIN');
    
    // Get student IDs and their class history IDs
    const studentIds = studentsResult.rows.map(s => s.id);
    
    // Get class history IDs for these students
    const historyResult = await client.query(
      'SELECT id FROM student_class_history WHERE student_id = ANY($1::int[])',
      [studentIds]
    );
    const historyIds = historyResult.rows.map(h => h.id);
    
   console.log('🗑️  Step 1: Deleting fee vouchers (by class history)...');
    let deleteVouchers = { rowCount: 0 };
    if (historyIds.length > 0) {
      deleteVouchers = await client.query(
        'DELETE FROM fee_vouchers WHERE student_class_history_id = ANY($1::int[])',
        [historyIds]
      );
    }
    console.log(`   Deleted ${deleteVouchers.rowCount} fee vouchers`);
    
    console.log('🗑️  Step 2: Deleting student_guardians...');
    const deleteGuardians = await client.query(
      'DELETE FROM student_guardians WHERE student_id = ANY($1::int[])',
      [studentIds]
    );
    console.log(`   Deleted ${deleteGuardians.rowCount} guardian relationships`);
    
    console.log('🗑️  Step 3: Deleting student_class_history...');
    const deleteHistory = await client.query(
      'DELETE FROM student_class_history WHERE student_id = ANY($1::int[])',
      [studentIds]
    );
    console.log(`   Deleted ${deleteHistory.rowCount} class history records`);
    
    console.log('🗑️  Step 4: Deleting student documents...');
    const deleteDocs = await client.query(
      'DELETE FROM student_documents WHERE student_id = ANY($1::int[])',
      [studentIds]
    );
    console.log(`   Deleted ${deleteDocs.rowCount} documents`);
    
    console.log('🗑️  Step 5: Deleting students...');
    const deleteStudents = await client.query(
      'DELETE FROM students WHERE id = ANY($1::int[])',
      [studentIds]
    );
    console.log(`   Deleted ${deleteStudents.rowCount} students`);
    
    await client.query('COMMIT');
    
    console.log('\n✅ SUCCESSFULLY DELETED ALL STUDENTS IN CLASS 10TH!');
    console.log(`\nTotal deleted: ${deleteStudents.rowCount} students\n`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    pool.end();
  }
}

deleteClass10thStudents();
