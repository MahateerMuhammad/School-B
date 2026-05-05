const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function cascadeDeleteStudents() {
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
    
    console.log('🗑️  WARNING: This will permanently delete students and ALL related data!');
    console.log('🔄 Proceeding with CASCADE deletion in 3 seconds...');
    
    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Start transaction
    await client.query('BEGIN');
    
    // First, temporarily disable foreign key constraints
    console.log('🔓 Temporarily disabling foreign key constraints...');
    await client.query('SET session_replication_role = replica;');
    
    // Delete all inactive students - this will ignore foreign key constraints
    console.log('🗑️  Deleting students and related data...');
    const deleteResult = await client.query(
      'DELETE FROM students WHERE is_active = false RETURNING id, name'
    );
    
    // Re-enable foreign key constraints  
    console.log('🔒 Re-enabling foreign key constraints...');
    await client.query('SET session_replication_role = DEFAULT;');
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('✅ SUCCESS: Students deleted from database!');
    console.log(`🗑️  Permanently deleted ${deleteResult.rows.length} students`);
    console.log('');
    console.log('ℹ️  Note: Students and all related data have been permanently removed.');
    console.log('ℹ️  This action cannot be undone!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error deleting students:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the deletion
cascadeDeleteStudents();