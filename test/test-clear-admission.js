const axios = require('axios');

async function clearAdmissionList() {
  try {
    console.log('🔄 Starting bulk deactivation...');
    
    const response = await axios.post('https://school-b-zk0h.onrender.com/api/students/bulk-deactivate', {}, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ Success:', response.data);
    console.log(`📊 Deactivated ${response.data.data?.deactivatedCount || 0} students`);
    
  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('❌ Network Error:', error.message);
      console.log('🔍 Make sure the backend server is running on https://school-b-zk0h.onrender.com');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

// Run the function
clearAdmissionList();