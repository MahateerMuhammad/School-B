const pool = require('./src/config/db');

(async () => {
  const client = await pool.connect();
  try {
    console.log('📊 Checking student data in database...\n');
    
    // Check sample students
    const result = await client.query(`
      SELECT id, name, phone, father_name, individual_monthly_fee 
      FROM students 
      WHERE name LIKE 'Muhammad Ahmad%' OR name LIKE 'Muhammad Arslan%' OR name LIKE 'Ali Haider%'
      LIMIT 5
    `);
    
    console.log('Sample students from database:');
    result.rows.forEach(student => {
      console.log(`\nStudent ID: ${student.id}`);
      console.log(`  Name: ${student.name}`);
      console.log(`  Phone: ${student.phone || 'NULL'}`);
      console.log(`  Father Name: ${student.father_name || 'NULL'}`);
      console.log(`  Individual Fee: ${student.individual_monthly_fee || 'NULL'}`);
    });
    
    console.log('\n\n📈 Statistics:');
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total_students,
        COUNT(phone) as students_with_phone,
        COUNT(individual_monthly_fee) as students_with_individual_fee
      FROM students
      WHERE is_active = true
    `);
    console.log(`Total active students: ${stats.rows[0].total_students}`);
    console.log(`Students with phone: ${stats.rows[0].students_with_phone}`);
    console.log(`Students with individual fee: ${stats.rows[0].students_with_individual_fee}`);
    
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
})();
