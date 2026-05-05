require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testPassword() {
  try {
    // Test admin@test.com
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      ['admin@test.com']
    );

    if (result.rows.length === 0) {
      console.log('❌ User admin@test.com not found');
    } else {
      const user = result.rows[0];
      console.log('✅ User found:', user.email);
      console.log('Hash preview:', user.password_hash.substring(0, 30) + '...');
      
      const testPassword = 'admin123';
      const isValid = await bcrypt.compare(testPassword, user.password_hash);
      console.log(`Password "${testPassword}" is valid:`, isValid);
    }

    // Test admin@school.com
    const result2 = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      ['admin@school.com']
    );

    if (result2.rows.length === 0) {
      console.log('❌ User admin@school.com not found');
    } else {
      const user = result2.rows[0];
      console.log('\n✅ User found:', user.email);
      console.log('Hash preview:', user.password_hash.substring(0, 30) + '...');
      
      const testPassword = 'admin123';
      const isValid = await bcrypt.compare(testPassword, user.password_hash);
      console.log(`Password "${testPassword}" is valid:`, isValid);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

testPassword();
