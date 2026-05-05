// Test frontend login flow
const API_BASE_URL = 'http://localhost:5000';
const API_LOGIN = '/api/auth/login';

async function testFrontendLogin() {
  console.log('Testing with frontend configuration...');
  console.log('API_BASE_URL:', API_BASE_URL);
  console.log('Endpoint:', API_LOGIN);
  console.log('Full URL:', API_BASE_URL + API_LOGIN);
  console.log('\nAttempting login with admin@test.com...\n');

  try {
    const response = await fetch(API_BASE_URL + API_LOGIN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@test.com',
        password: 'admin123'
      })
    });

    console.log('Response Status:', response.status);
    console.log('Response OK:', response.ok);
    
    const data = await response.json();
    console.log('\nResponse Data:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      const message = data?.message || data || `Request failed with status ${response.status}`;
      console.log('\n❌ Login failed with message:', message);
      throw new Error(message);
    }

    if (data.success) {
      console.log('\n✅ Login successful!');
      console.log('Token:', data.data.token.substring(0, 50) + '...');
      console.log('User:', data.data.user);
    } else {
      console.log('\n⚠️ Response not successful:', data.message ||'Unknown error');
      throw new Error(data.message || 'Login failed');
    }
  } catch (error) {
    console.log('\n❌ Error occurred:', error.message);
    console.log('Error type:', error.constructor.name);
  }
}

testFrontendLogin();
