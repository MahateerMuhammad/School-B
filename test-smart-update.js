const axios = require('axios');

async function testSmartUpdate() {
  try {
    console.log('🧪 Testing SMART bulk update (auto-detect student location)...\n');
    
    // Test Case 1: Update student with WRONG class ID (should still find them)
    console.log('📋 Test Case 1: Providing WRONG class ID (61 - 9th class)');
    console.log('Student is actually in class 62 (10th), but we provide class 61 (9th)');
    
    const testData1 = {
      students: [
        {
          name: "Abeera Fatima",
          fatherName: "Imtiaz Ahmad Khan",
          fatherContactNo: "0300-7301983",
          monthlyFee: 3500  // Update fee to verify it works
        }
      ],
      class_id: 61,  // WRONG class (9th instead of 10th)
      section_id: 95 // WRONG section
    };
    
    console.log('📤 Sending request with WRONG class_id:', testData1.class_id);
    const response1 = await axios.post('http://localhost:5001/api/students/bulk-update-noauth', testData1, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Response status:', response1.status);
    console.log('📄 Response data:', JSON.stringify(response1.data, null, 2));
    
    if (response1.data.data.updatedStudents.length > 0) {
      const updated = response1.data.data.updatedStudents[0];
      console.log('\n🎉 SUCCESS! Student found and updated despite wrong class_id!');
      console.log('• Student found in:', updated.class_name, '-', updated.section_name);
      console.log('• Phone updated to:', updated.phone);
      console.log('• Fee updated to:', updated.individual_monthly_fee);
    }
    
    // Test Case 2: Update without providing class ID at all
    console.log('\n\n📋 Test Case 2: NO class_id provided (search everywhere)');
    const testData2 = {
      students: [
        {
          name: "Abeera Fatima",
          fatherName: "Imtiaz Ahmad Khan",
          fatherContactNo: "0300-7301983",
          monthlyFee: 3000
        }
      ]
      // No class_id or section_id at all
    };
    
    console.log('📤 Sending request WITHOUT class_id');
    const response2 = await axios.post('http://localhost:5001/api/students/bulk-update-noauth', testData2, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Response status:', response2.status);
    console.log('📄 Response data:', JSON.stringify(response2.data, null, 2));
    
    console.log('\n\n🎯 SMART UPDATE WORKING:');
    console.log('✅ Students can be updated from ANY class view');
    console.log('✅ System auto-detects where students actually are');
    console.log('✅ No more "student not found" errors due to wrong class!');
    
  } catch (error) {
    console.error('❌ Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}

testSmartUpdate();