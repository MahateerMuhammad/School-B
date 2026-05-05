require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function updatePassword() {
  const client = await pool.connect();
  
  try {
    const email = 'admin@test.com';
    const newPassword = 'Admin123!';
    
    console.log(`Updating password for: ${email}`);
    console.log(`New password: ${newPassword}\n`);
    
    // Check if user exists
    const checkUser = await client.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );
    
    if (checkUser.rows.length === 0) {
      console.log('❌ User not found!');
      return;
    }
    
    console.log('✅ User found:', checkUser.rows[0].email);
    
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    console.log('✅ Password hashed');
    
    // Update the password
    await client.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [passwordHash, email]
    );
    
    console.log('✅ Password updated successfully!\n');
    
    // Verify the new password
    const verifyUser = await client.query(
      'SELECT password_hash FROM users WHERE email = $1',
      [email]
    );
    
    const isValid = await bcrypt.compare(newPassword, verifyUser.rows[0].password_hash);
    console.log('✅ Password verification:', isValid ? 'SUCCESS' : 'FAILED');
    
    console.log('\n📧 Email: admin@test.com');
    console.log('🔑 Password: Admin123!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

updatePassword();
