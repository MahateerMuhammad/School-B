require('dotenv').config();

async function testLogin() {
  const BASE_URL = 'http://localhost:5000';
  
  console.log('Testing login with admin@test.com...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@test.com',
        password: 'admin123'
      })
    });

    const data = await response.json();
    
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('\n✅ Login successful!');
      console.log('Token:', data.data.token.substring(0, 30) + '...');
      console.log('User:', data.data.user);
    } else {
      console.log('\n❌ Login failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testLogin();
