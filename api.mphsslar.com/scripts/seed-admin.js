#!/usr/bin/env node
/**
 * Seed Script - Creates initial admin user
 * Usage: node scripts/seed-admin.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function seedAdmin() {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting seed process...\n');

    // Check if admin already exists
    const existingAdmin = await client.query(
      'SELECT id, email FROM users WHERE email = $1',
      ['admin@school.com']
    );

    if (existingAdmin.rows.length > 0) {
      console.log('✅ Admin user already exists:');
      console.log('   Email: admin@school.com');
      console.log('   ID:', existingAdmin.rows[0].id);
      return;
    }

    // Create admin user
    const password = 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await client.query(
      `INSERT INTO users (email, password_hash, role) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, role`,
      ['admin@school.com', passwordHash, 'ADMIN']
    );

    const admin = result.rows[0];

    console.log('✅ Admin user created successfully!\n');
    console.log('📧 Email: admin@school.com');
    console.log('🔑 Password: admin123');
    console.log('👤 Role: ADMIN');
    console.log('🆔 ID:', admin.id);
    console.log('\n⚠️  IMPORTANT: Change this password after first login!\n');

  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedAdmin()
  .then(() => {
    console.log('✅ Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
