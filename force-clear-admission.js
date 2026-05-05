const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function forceClearAdmissionList() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Connecting to database...');
    
    // Check current active students count
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM students WHERE is_active = true'
    );
    const activeCount = parseInt(countResult.rows[0].count);
    
    console.log(`📊 Found ${activeCount} active students in admission list`);
    
    if (activeCount === 0) {
      console.log('✅ No active students found. Admission list is already clear.');
      return;
    }
    
    // Start transaction
    await client.query('BEGIN');
    
    // Deactivate all active students
    const result = await client.query(
      `UPDATE students 
       SET is_active = false
       WHERE is_active = true 
       RETURNING id, name`
    );
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('✅ SUCCESS: Admission list cleared by force!');
    console.log(`📋 Deactivated ${result.rows.length} students:`);
    
    result.rows.forEach((student, index) => {
      console.log(`   ${index + 1}. ${student.name} (ID: ${student.id})`);
    });
    
    console.log('');
    console.log('ℹ️  Note: Students are deactivated (is_active = false) but not deleted.');
    console.log('ℹ️  They can be reactivated later if needed.');
    console.log('ℹ️  All related data (fees, documents, etc.) are preserved.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error clearing admission list:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the force clear
forceClearAdmissionList();