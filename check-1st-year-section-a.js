const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check1stYearSectionA() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Finding class "1st year" and section "A"...\n');
    
    // Find class 1st year
    const classQuery = `SELECT id, name FROM classes WHERE LOWER(name) LIKE '%1st%year%' OR LOWER(name) LIKE '%1%year%' OR name = '1st Year'`;
    const classResult = await client.query(classQuery);
    
    if (classResult.rows.length === 0) {
      console.log('❌ Class "1st year" not found');
      return;
    }
    
    const class1stYear = classResult.rows[0];
    console.log(`✅ Found class: ${class1stYear.name} (ID: ${class1stYear.id})`);
    
    // Find section "A"
    const sectionQuery = `SELECT id, name FROM sections WHERE name = 'A' OR name = 'Section A'`;
    const sectionResult = await client.query(sectionQuery);
    
    if (sectionResult.rows.length === 0) {
      console.log('❌ Section "A" not found');
      return;
    }
    
    // Show all matching sections
    console.log(`\n📋 Found ${sectionResult.rows.length} section(s) named "A" or "Section A":`);
    sectionResult.rows.forEach(s => {
      console.log(`   - ${s.name} (ID: ${s.id})`);
    });
    
    // Check students for each section
    for (const section of sectionResult.rows) {
      const countQuery = `
        SELECT COUNT(*) as count
        FROM students s
        JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
        WHERE sch.class_id = $1 AND sch.section_id = $2
      `;
      
      const countResult = await client.query(countQuery, [class1stYear.id, section.id]);
      const studentCount = parseInt(countResult.rows[0].count);
      
      console.log(`\n📊 Class: ${class1stYear.name}, Section: ${section.name} (ID: ${section.id})`);
      console.log(`   Students: ${studentCount}`);
      
      if (studentCount > 0) {
        // Show first 10 students
        const studentsQuery = `
          SELECT s.name, s.roll_no, s.phone, s.father_name, s.individual_monthly_fee
          FROM students s
          JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
          WHERE sch.class_id = $1 AND sch.section_id = $2
          ORDER BY s.name
          LIMIT 10
        `;
        
        const studentsResult = await client.query(studentsQuery, [class1stYear.id, section.id]);
        
        console.log('\n   First 10 students:');
        studentsResult.rows.forEach((s, i) => {
          console.log(`   ${i + 1}. ${s.name} (Roll: ${s.roll_no}, Phone: ${s.phone || 'N/A'})`);
        });
        
        if (studentCount > 10) {
          console.log(`   ... and ${studentCount - 10} more students`);
        }
      }
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    pool.end();
  }
}

check1stYearSectionA();
