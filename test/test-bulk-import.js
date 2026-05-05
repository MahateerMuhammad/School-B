const axios = require('axios');

async function testBulkImport() {
  try {
    console.log('🧪 Testing bulk import API endpoint...');

    const testData = {
      students: [
        {
          name: 'Test Student 1',
          email: 'test1@example.com',
          classId: 1,
          sectionId: 1,
          rollNumber: 'TEST001'
        },
        {
          name: 'Test Student 2', 
          email: 'test2@example.com',
          classId: 1,
          sectionId: 1,
          rollNumber: 'TEST002'
        }
      ]
    };

    const response = await axios.post('http://localhost:5000/api/students/bulk', testData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ Success! Response:', response.data);
    
  } catch (error) {
    console.error('❌ Error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
  }
}

testBulkImport();