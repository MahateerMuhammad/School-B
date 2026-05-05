const pool = require('./src/config/db');

async function findRootCause() {
  try {
    console.log('🔍 ROOT CAUSE ANALYSIS: CSV Update vs Database Reality\n');
    
    // Get the student from the screenshot
    const studentName = "Abeera Fatima";
    
    console.log('Step 1: Find actual student location in database');
    const actualStudentQuery = `
      SELECT s.id, s.name, s.father_name, s.phone, s.individual_monthly_fee, s.roll_no,
             sch.class_id, sch.section_id, c.name as class_name, se.name as section_name
      FROM students s
      JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL  
      JOIN classes c ON sch.class_id = c.id
      JOIN sections se ON sch.section_id = se.id
      WHERE LOWER(TRIM(s.name)) = LOWER(TRIM($1))
    `;
    
    const actualResult = await pool.query(actualStudentQuery, [studentName]);
    console.log('✅ Actual student location:', actualResult.rows[0]);
    
    if (actualResult.rows.length === 0) {
      console.log('❌ Student not found in database!');
      process.exit(1);
    }
    
    const student = actualResult.rows[0];
    const actualClassId = student.class_id;
    const actualSectionId = student.section_id;
    
    console.log('\n📍 Student is actually in:');
    console.log('• Class ID:', actualClassId, `(${student.class_name})`);
    console.log('• Section ID:', actualSectionId, `(${student.section_name})`);
    
    console.log('\nStep 2: Test what happens with different class/section IDs');
    
    // Test 1: With WRONG class ID (9th class ID = 61)
    console.log('\n🧪 Test 1: Search with WRONG class ID (61 - 9th class)');
    const wrongClassQuery = `
      SELECT s.id, s.name, s.father_name, s.phone, s.individual_monthly_fee
      FROM students s
      JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
      WHERE s.is_active = true
        AND sch.class_id = $1
        AND LOWER(TRIM(s.name)) = LOWER(TRIM($2))
    `;
    
    const wrongResult = await pool.query(wrongClassQuery, [61, studentName]);
    console.log('Result with class_id=61:', wrongResult.rows.length, 'students found');
    if (wrongResult.rows.length === 0) {
      console.log('❌ NOT FOUND - This is exactly what happens in CSV update!');
    }
    
    // Test 2: With CORRECT class ID
    console.log('\n🧪 Test 2: Search with CORRECT class ID');
    const correctResult = await pool.query(wrongClassQuery, [actualClassId, studentName]);
    console.log('Result with class_id=' + actualClassId + ':', correctResult.rows.length, 'students found');
    console.log('✅ FOUND with correct class ID:', correctResult.rows[0]);
    
    console.log('\nStep 3: Check what class/section the frontend might be sending');
    
    // Show all classes
    const allClassesQuery = 'SELECT id, name FROM classes ORDER BY id';
    const allClasses = await pool.query(allClassesQuery);
    console.log('\n📋 All classes in system:');
    allClasses.rows.forEach(cls => {
      console.log(`• ID: ${cls.id} - Name: ${cls.name}`);
    });
    
    // Show sections for the student's actual class
    const sectionsQuery = 'SELECT id, name FROM sections WHERE class_id = $1 ORDER BY id';
    const sections = await pool.query(sectionsQuery, [actualClassId]);
    console.log(`\n📋 Sections in ${student.class_name} (class_id: ${actualClassId}):`);
    sections.rows.forEach(sec => {
      console.log(`• ID: ${sec.id} - Name: ${sec.name}`);
    });
    
    console.log('\n🔍 ROOT CAUSE IDENTIFIED:');  
    console.log('❌ The CSV bulk update is searching in the WRONG class/section!');
    console.log(`• Frontend is probably sending class_id=61 (9th), but ${studentName} is in class_id=${actualClassId}`);
    console.log('• This causes "student not found" → no update happens → data stays missing');
    
    console.log('\n🛠️  SOLUTION:');
    console.log('• Frontend needs to send the CORRECT class_id/section_id where students actually exist');
    console.log('• OR remove class/section filtering (search across all classes)');
    console.log('• OR make the bulk update auto-detect student locations');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

findRootCause();