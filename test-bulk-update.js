const axios = require('axios');

async function testBulkUpdate() {
  try {
    console.log('🧪 Testing bulk update endpoint...');
    
    const testData = {
      students: [
        {
          name: "Aleeba Imran", // Existing student from 9th class, Pre 9th section
          fatherName: "Imran Hussain",
          fatherContactNo: "03001234567",
          monthlyFee: 1500
        }
      ],
      class_id: 61, // 9th class ID
      section_id: 95 // Correct section ID for "Pre 9th"
    };
    
    console.log('📤 Sending request to:', 'http://localhost:5001/api/students/bulk-update-noauth');
    console.log('📋 Request data:', JSON.stringify(testData, null, 2));
    
    const response = await axios.post('http://localhost:5001/api/students/bulk-update-noauth', testData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Response status:', response.status);
    console.log('📄 Response data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
  }
}

testBulkUpdate();