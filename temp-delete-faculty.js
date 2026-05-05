const pool = require('./src/config/db');
const bcrypt = require('bcrypt');

(async () => {
  try {
    const newEmail = 'sajidrana1986@gmail.com';
    const newPassword = 'Mphss.admin1?';
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update admin credentials
    const result = await pool.query(
      'UPDATE users SET email = $1, password = $2 WHERE email = $3 OR role = $4 RETURNING id, email, role',
      [newEmail, hashedPassword, 'admin@test.com', 'admin']
    );
    
    if (result.rows.length > 0) {
      console.log('Admin credentials updated successfully!');
      console.log('Updated user:', result.rows[0]);
      console.log('New email:', newEmail);
      console.log('New password:', newPassword);
    } else {
      console.log('No admin user found. Checking users table...');
      const users = await pool.query('SELECT id, email, role FROM users');
      console.log('Users:', JSON.stringify(users.rows, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
