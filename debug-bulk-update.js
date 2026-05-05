const pool = require('./src/config/db');

async function debugBulkUpdate() {
  try {
    console.log('🔍 Debugging CSV bulk update process...\n');
    
    // Check one of the students from the screenshot
    const studentName = "Abeera Fatima"; // From the section list
    
    console.log('📋 Step 1: Check current student data in database');
    const currentDataQuery = `
      SELECT s.id, s.name, s.father_name, s.phone, s.individual_monthly_fee, s.roll_no,
             sch.class_id, sch.section_id, se.name as section_name
      FROM students s
      JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
      JOIN sections se ON sch.section_id = se.id
      WHERE LOWER(TRIM(s.name)) = LOWER(TRIM($1))
    `;
    
    const currentResult = await pool.query(currentDataQuery, [studentName]);
    console.log('Current database data for', studentName, ':', currentResult.rows);
    
    if (currentResult.rows.length > 0) {
      const student = currentResult.rows[0];
      console.log('\n📊 Current field values:');
      console.log('• father_name:', student.father_name || 'NULL');
      console.log('• phone:', student.phone || 'NULL');
      console.log('• individual_monthly_fee:', student.individual_monthly_fee || 'NULL');
      console.log('• roll_no:', student.roll_no || 'NULL');
      console.log('• class_id:', student.class_id);
      console.log('• section_id:', student.section_id, '(' + student.section_name + ')');
      
      // Test the bulk update logic with sample data
      console.log('\n🧪 Step 2: Test bulk update with sample CSV data');
      const sampleCsvData = {
        name: studentName,
        fatherName: "Imtiaz Ahmad Khan", // From the CSV screenshot
        fatherContactNo: "0300-7301983", // From the CSV screenshot  
        monthlyFee: 3000 // From the CSV screenshot
      };
      console.log('Sample CSV data to update:', sampleCsvData);
      
      // Simulate the bulk update query building
      const updates = [];
      const updateParams = [];
      let paramIndex = 1;
      
      if (sampleCsvData.fatherName && sampleCsvData.fatherName !== student.father_name) {
        updates.push(`father_name = $${paramIndex++}`);
        updateParams.push(sampleCsvData.fatherName);
        console.log('• Will update father_name:', student.father_name, '→', sampleCsvData.fatherName);
      }
      
      if (sampleCsvData.fatherContactNo && sampleCsvData.fatherContactNo !== student.phone) {
        updates.push(`phone = $${paramIndex++}`);
        updateParams.push(sampleCsvData.fatherContactNo);
        console.log('• Will update phone:', student.phone, '→', sampleCsvData.fatherContactNo);
      }
      
      if (sampleCsvData.monthlyFee !== null && sampleCsvData.monthlyFee !== parseFloat(student.individual_monthly_fee || 0)) {
        updates.push(`individual_monthly_fee = $${paramIndex++}`);
        updateParams.push(sampleCsvData.monthlyFee);
        console.log('• Will update individual_monthly_fee:', student.individual_monthly_fee, '→', sampleCsvData.monthlyFee);
      }
      
      if (updates.length > 0) {
        const updateQuery = `UPDATE students SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
        updateParams.push(student.id);
        console.log('\n📝 Generated update query:', updateQuery);
        console.log('📝 Update parameters:', updateParams);
        
        // Actually run the update
        console.log('\n⚡ Executing update...');
        const updateResult = await pool.query(updateQuery, updateParams);
        console.log('Update result rows affected:', updateResult.rowCount);
        
        // Verify the update
        const verifyResult = await pool.query(currentDataQuery, [studentName]);
        console.log('\n✅ After update verification:', verifyResult.rows[0]);
      } else {
        console.log('\n⚠️  No updates needed - data already matches');
      }
    } else {
      console.log('❌ Student not found in database!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

debugBulkUpdate();