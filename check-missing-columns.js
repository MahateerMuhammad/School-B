#!/usr/bin/env node

/**
 * Check for missing database columns
 */

const { Pool } = require('pg');
require('dotenv').config();

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔍 Checking database schema...\n');

    // Check students table
    const studentsColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'students' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Students table columns:');
    studentsColumns.rows.forEach(row => console.log('  -', row.column_name));
    
    const hasAdmissionDate = studentsColumns.rows.some(r => r.column_name === 'admission_date');
    if (hasAdmissionDate) {
      console.log('\n✅ students.admission_date EXISTS');
    } else {
      console.log('\n❌ students.admission_date MISSING - Need to run migration');
    }

    // Check student_class_history table
    const historyColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'student_class_history' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Student_class_history table columns:');
    historyColumns.rows.forEach(row => console.log('  -', row.column_name));
    
    const hasSerialNumber = historyColumns.rows.some(r => r.column_name === 'serial_number');
    if (hasSerialNumber) {
      console.log('\n✅ student_class_history.serial_number EXISTS');
    } else {
      console.log('\n❌ student_class_history.serial_number MISSING - Need to run migration 019');
    }

    console.log('\n' + '='.repeat(60));
    if (!hasAdmissionDate || !hasSerialNumber) {
      console.log('\n⚠️  MIGRATIONS NEEDED:');
      if (!hasAdmissionDate) {
        console.log('   Run: ALTER TABLE students ADD COLUMN admission_date DATE DEFAULT CURRENT_DATE;');
      }
      if (!hasSerialNumber) {
        console.log('   Run: node scripts/run-migration.js 019_add_serial_number_to_enrollment.sql');
      }
    } else {
      console.log('\n✅ All required columns exist!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
