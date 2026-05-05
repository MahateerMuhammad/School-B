const pool = require('./src/config/db');

async function checkSections() {
  try {
    console.log('🔍 Checking sections for 9th class...');
    
    // Get all sections for 9th class
    const sectionsQuery = `
      SELECT s.id, s.name, c.name as class_name 
      FROM sections s 
      JOIN classes c ON s.class_id = c.id 
      WHERE c.name = '9th'
      ORDER BY s.name
    `;
    
    const sectionsResult = await pool.query(sectionsQuery);
    console.log('Sections found:', sectionsResult.rows);
    
    // Check specific student with exact name matching
    const studentQuery = `
      SELECT s.id, s.name, s.father_name, sch.class_id, sch.section_id, se.name as section_name
      FROM students s
      JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
      JOIN sections se ON sch.section_id = se.id
      WHERE sch.class_id = 61 
        AND LOWER(TRIM(s.name)) = LOWER(TRIM('Aleeba Imran'))
    `;
    
    const studentResult = await pool.query(studentQuery);
    console.log('Student match results:', studentResult.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSections();