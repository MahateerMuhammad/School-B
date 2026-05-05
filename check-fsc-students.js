require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkFscStudents() {
  try {
    console.log('🔍 Searching for FSC class and sections...\n');

    // Find FSC class (could be "F.S.C", "FSC", "1st Year", "2nd Year")
    const classQuery = `
      SELECT id, name 
      FROM classes 
      WHERE LOWER(REPLACE(name, '.', '')) LIKE '%fsc%' 
         OR name ILIKE '%F.S.C%'
         OR name ILIKE '%year%'
      ORDER BY name
    `;
    const classResult = await pool.query(classQuery);
    
    if (classResult.rows.length === 0) {
      console.log('❌ No FSC-related classes found\n');
      await pool.end();
      return;
    }

    console.log('📚 Found FSC-related classes:');
    classResult.rows.forEach(cls => {
      console.log(`   - ID: ${cls.id}, Name: "${cls.name}"`);
    });
    console.log('');

    // For each class, find sections and count students
    for (const cls of classResult.rows) {
      console.log(`\n📖 Class: "${cls.name}" (ID: ${cls.id})`);
      console.log('─'.repeat(60));

      // Get all sections for this class
      const sectionQuery = `
        SELECT id, name 
        FROM sections 
        WHERE class_id = $1
        ORDER BY name
      `;
      const sectionResult = await pool.query(sectionQuery, [cls.id]);

      if (sectionResult.rows.length === 0) {
        console.log('   ⚠️  No sections found for this class\n');
        continue;
      }

      console.log(`   Found ${sectionResult.rows.length} section(s):\n`);

      let totalClassStudents = 0;

      for (const section of sectionResult.rows) {
        // Count students in this section
        const studentCountQuery = `
          SELECT COUNT(DISTINCT s.id) as count
          FROM students s
          INNER JOIN student_class_history sch ON s.id = sch.student_id
          WHERE sch.class_id = $1 
            AND sch.section_id = $2
            AND sch.end_date IS NULL
        `;
        const countResult = await pool.query(studentCountQuery, [cls.id, section.id]);
        const studentCount = parseInt(countResult.rows[0].count);
        totalClassStudents += studentCount;

        console.log(`   📋 Section: "${section.name}" (ID: ${section.id})`);
        console.log(`      👥 Active Students: ${studentCount}`);

        // If there are students, show first 5 names
        if (studentCount > 0) {
          const studentsQuery = `
            SELECT s.id, s.name, s.roll_no, s.phone, s.individual_monthly_fee
            FROM students s
            INNER JOIN student_class_history sch ON s.id = sch.student_id
            WHERE sch.class_id = $1 
              AND sch.section_id = $2
              AND sch.end_date IS NULL
            ORDER BY s.roll_no
            LIMIT 5
          `;
          const studentsResult = await pool.query(studentsQuery, [cls.id, section.id]);
          
          console.log(`      Sample students (first 5):`);
          studentsResult.rows.forEach(student => {
            console.log(`         - ${student.name} (Roll: ${student.roll_no || 'N/A'}, Phone: ${student.phone || 'N/A'}, Fee: ${student.individual_monthly_fee || 'N/A'})`);
          });
          
          if (studentCount > 5) {
            console.log(`         ... and ${studentCount - 5} more students`);
          }
        }
        console.log('');
      }

      console.log(`   ✅ Total students in "${cls.name}": ${totalClassStudents}`);
    }

    console.log('\n✅ Check complete!\n');
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkFscStudents();
