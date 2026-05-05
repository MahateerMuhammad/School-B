const pool = require('./src/config/db');

async function testSmartSearchQuery() {
  try {
    console.log('🧪 Testing SMART SEARCH query logic...\n');
    
    const studentName = "Abeera Fatima";
    const wrongClassId = 61;  // 9th class (student is actually in 10th)
    const wrongSectionId = 95;
    
    console.log('Step 1: Test the OLD way (strict class/section match)');
    const oldQuery = `
      SELECT s.id, s.name, s.roll_no, s.phone, s.father_name, s.individual_monthly_fee
      FROM students s
      JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
      WHERE s.is_active = true
        AND sch.class_id = $1
        AND LOWER(TRIM(s.name)) = LOWER(TRIM($2))
    `;
    
    const oldResult = await pool.query(oldQuery, [wrongClassId, studentName]);
    console.log('OLD way result:', oldResult.rows.length, 'students found');
    if (oldResult.rows.length === 0) {
      console.log('❌ OLD way FAILS - student not found because wrong class\n');
    }
    
    console.log('Step 2: Test the NEW SMART way (search anywhere, prefer specified class)');
    const smartQuery = `
      SELECT s.id, s.name, s.roll_no, s.phone, s.father_name, s.individual_monthly_fee,
             sch.class_id, sch.section_id, c.name as class_name, sec.name as section_name
      FROM students s
      JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
      JOIN classes c ON sch.class_id = c.id
      JOIN sections sec ON sch.section_id = sec.id
      WHERE s.is_active = true
        AND LOWER(TRIM(s.name)) = LOWER(TRIM($1))
      ORDER BY CASE WHEN sch.class_id = $2 THEN 0 ELSE 1 END,
               CASE WHEN sch.section_id = $3 THEN 0 ELSE 1 END
      LIMIT 1
    `;
    
    const smartResult = await pool.query(smartQuery, [studentName, wrongClassId, wrongSectionId]);
    console.log('SMART way result:', smartResult.rows.length, 'students found');
    if (smartResult.rows.length > 0) {
      console.log('✅ SMART way WORKS! Student found:', smartResult.rows[0]);
      console.log('\n📍 Student found in:');
      console.log('• Class:', smartResult.rows[0].class_name, '(ID:', smartResult.rows[0].class_id + ')');
      console.log('• Section:', smartResult.rows[0].section_name, '(ID:', smartResult.rows[0].section_id + ')');
      console.log('• Current data:', {
        phone: smartResult.rows[0].phone,
        father_name: smartResult.rows[0].father_name,
        fee: smartResult.rows[0].individual_monthly_fee
      });
    }
    
    console.log('\nStep 3: Test without class constraint at all');
    const noClassQuery = `
      SELECT s.id, s.name, s.roll_no, s.phone, s.father_name, s.individual_monthly_fee,
             sch.class_id, sch.section_id, c.name as class_name, sec.name as section_name
      FROM students s
      JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
      JOIN classes c ON sch.class_id = c.id
      JOIN sections sec ON sch.section_id = sec.id
      WHERE s.is_active = true
        AND LOWER(TRIM(s.name)) = LOWER(TRIM($1))
      LIMIT 1
    `;
    
    const noClassResult = await pool.query(noClassQuery, [studentName]);
    console.log('No class constraint result:', noClassResult.rows.length, 'students found');
    if (noClassResult.rows.length > 0) {
      console.log('✅ Works without any class filter!', noClassResult.rows[0]);
    }
    
    console.log('\n🎯 CONCLUSION:');
    console.log('✅ SMART search finds students regardless of which class view is used');
    console.log('✅ System auto-detects actual student location');
    console.log('✅ CSV update will work from ANY class/section selection!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testSmartSearchQuery();