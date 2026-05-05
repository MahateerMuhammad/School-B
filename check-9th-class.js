const pool = require('./src/config/db');

async function checkData() {
  try {
    console.log('🔍 Checking 9th class student data...');
    
    // Get class info first
    const classQuery = "SELECT * FROM classes WHERE name ILIKE '%9%' OR name ILIKE '%ninth%'";
    console.log('Query:', classQuery);
    const classResult = await pool.query(classQuery);
    console.log('Classes found:', classResult.rows);
    
    if (classResult.rows.length > 0) {
      const classId = classResult.rows[0].id;
      console.log('Using class ID:', classId);
      
      // Get students in 9th class (using end_date IS NULL for current enrollment)
      const studentQuery = `
        SELECT s.name, s.father_name, s.phone, s.individual_monthly_fee, s.created_at,
               sch.start_date, sch.end_date, se.name as section_name
        FROM students s 
        JOIN student_class_history sch ON s.id = sch.student_id
        JOIN sections se ON sch.section_id = se.id
        WHERE sch.class_id = $1 AND sch.end_date IS NULL
        ORDER BY s.name
        LIMIT 10
      `;
      
      const studentResult = await pool.query(studentQuery, [classId]);
      console.log('Students found:', studentResult.rows.length);
      console.log('Sample data:', JSON.stringify(studentResult.rows, null, 2));
      
      // Also check the API endpoint configuration
      console.log('\\n🔧 Checking API app.js configuration...');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkData();