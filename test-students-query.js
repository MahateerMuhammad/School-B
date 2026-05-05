const pool = require('./src/config/db');

(async () => {
  const client = await pool.connect();
  try {
    // Check total students
    const result = await client.query('SELECT COUNT(*) FROM students');
    console.log('Total students in DB:', result.rows[0].count);
    
    // Check active enrollments
    const result2 = await client.query('SELECT COUNT(*) FROM student_class_history WHERE end_date IS NULL');
    console.log('Active enrollments:', result2.rows[0].count);
    
    // Check students by class
    const result3 = await client.query(`
      SELECT c.name, COUNT(sch.id) as student_count 
      FROM classes c 
      LEFT JOIN student_class_history sch ON c.id = sch.class_id AND sch.end_date IS NULL 
      GROUP BY c.id, c.name 
      ORDER BY c.name
    `);
    console.log('\nStudents by class:');
    result3.rows.forEach(r => console.log(`  ${r.name}: ${r.student_count}`));
    
    // Find Nursery class_id
    const nurseryQuery = await client.query(`SELECT id, name FROM classes WHERE name = 'Nursery'`);
    const nurseryId = nurseryQuery.rows[0]?.id;
    console.log('\nNursery class_id:', nurseryId);
    
    // Test the actual query from students.controller.js for Nursery class
    if (nurseryId) {
      console.log(`\n--- Testing query for Nursery (class_id = ${nurseryId}) ---`);
      const testQuery = await client.query(`
        SELECT DISTINCT ON (s.id) 
               s.id, s.name, s.roll_no,
               c.id as class_id,
               c.name as current_class_name,
               sec.id as section_id,
               sec.name as current_section_name
        FROM students s
        LEFT JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
        LEFT JOIN classes c ON sch.class_id = c.id
        LEFT JOIN sections sec ON sch.section_id = sec.id
        WHERE 1=1 AND sch.class_id = $1
        ORDER BY s.id, s.created_at ASC
        LIMIT 10
      `, [nurseryId]);
      
      console.log(`Found ${testQuery.rows.length} students for Nursery`);
      if (testQuery.rows.length > 0) {
        console.log('Sample students:', testQuery.rows.map(r => ({
          name: r.name,
          roll_no: r.roll_no,
          class: r.current_class_name,
          section: r.current_section_name
        })));
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    process.exit();
  }
})();
