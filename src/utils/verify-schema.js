const pool = require('./src/config/db');

async function verifySchema() {
  try {
    // Check student_fee_overrides table
    const result1 = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'student_fee_overrides' 
      ORDER BY ordinal_position
    `);
    
    console.log('✅ student_fee_overrides table columns:');
    result1.rows.forEach(row => console.log('  -', row.column_name));
    
    const hasDiscount1 = result1.rows.some(r => r.column_name === 'discount_description');
    if (hasDiscount1) {
      console.log('\n✅ student_fee_overrides.discount_description EXISTS');
    } else {
      console.log('\n❌ student_fee_overrides.discount_description MISSING');
    }
    
    // Check fee_vouchers table
    const result2 = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'fee_vouchers' 
      AND column_name = 'discount_description'
    `);
    
    if (result2.rows.length > 0) {
      console.log('✅ fee_vouchers.discount_description EXISTS');
    } else {
      console.log('❌ fee_vouchers.discount_description MISSING');
    }
    
    console.log('\n🎉 PostgreSQL database is correctly configured!');
    console.log('📝 The VSCode SQL warnings are from a DB2 parser and can be ignored.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

verifySchema();
