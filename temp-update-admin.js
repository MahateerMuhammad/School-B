require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function updateAdminCredentials() {
  const targetEmail = 'sajidrana1986@gmail.com';
  const newPassword = 'Mphss.admin1?';
  
  // Hash the new password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);
  
  try {
    // Update password for existing admin
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email, role',
      [passwordHash, targetEmail]
    );
    
    if (result.rowCount > 0) {
      console.log('Admin credentials updated successfully!');
      console.log('Email:', targetEmail);
      console.log('New password:', newPassword);
      console.log('User:', result.rows[0]);
    } else {
      console.log('No user found with email', targetEmail);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

updateAdminCredentials();
