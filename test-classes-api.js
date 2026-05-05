/**
 * Test script to check classes API response
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testClassesAPI() {
  try {
    console.log('Testing Classes API...\n');
    
    const response = await axios.get(`${BASE_URL}/api/classes`);
    const data = response.data;
    
    console.log('Response status:', response.status);
    console.log('\nFull response:', JSON.stringify(data, null, 2));
    
    if (data.data && data.data.data) {
      console.log('\n=== Classes with Fee Structures ===');
      data.data.data.forEach(classItem => {
        console.log(`\nClass: ${classItem.name} (ID: ${classItem.id})`);
        console.log('Fee Structure:', classItem.current_fee_structure);
      });
    } else if (data.data) {
      console.log('\n=== Classes with Fee Structures ===');
      data.data.forEach(classItem => {
        console.log(`\nClass: ${classItem.name} (ID: ${classItem.id})`);
        console.log('Fee Structure:', classItem.current_fee_structure);
      });
    }
  } catch (error) {
    console.error('Error testing API:', error.message);
  }
}

testClassesAPI();
