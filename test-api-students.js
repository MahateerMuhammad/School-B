const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Test the students API endpoint
(async () => {
  try {
    console.log('Waiting for server to start...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Testing Students API Endpoint...\n');
    
    // Get a valid auth token first
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@test.com',
        password: 'admin123'
      })
    });
    
    const loginData = await loginResponse.json();
    
    if (!loginData.success) {
      console.error('❌ Login failed:', loginData.message);
      process.exit(1);
    }
    
    const token = loginData.data.token;
    console.log('✅ Login successful, token obtained\n');
    
    // Test 1: Get all students (no filter)
    console.log('--- Test 1: Get all students ---');
    const allStudentsResponse = await fetch('http://localhost:5000/api/students', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const allStudentsData = await allStudentsResponse.json();
    console.log('Status:', allStudentsResponse.status);
    console.log('Success:', allStudentsData.success);
    console.log('Total students returned:', allStudentsData.data?.length || 0);
    if (allStudentsData.data?.length > 0) {
      console.log('First student sample:', {
        id: allStudentsData.data[0].id,
        name: allStudentsData.data[0].name,
        class_id: allStudentsData.data[0].class_id,
        current_class_name: allStudentsData.data[0].current_class_name
      });
    }
    console.log('');
    
    // Test 2: Get students for Nursery (class_id=51)
    console.log('--- Test 2: Get students for Nursery (class_id=51) ---');
    const nurseryResponse = await fetch('http://localhost:5000/api/students?class_id=51', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const nurseryData = await nurseryResponse.json();
    console.log('Status:', nurseryResponse.status);
    console.log('Success:', nurseryData.success);
    console.log('Nursery students returned:', nurseryData.data?.length || 0);
    if (nurseryData.data?.length > 0) {
      console.log('First 3 students:', nurseryData.data.slice(0, 3).map(s => ({
        name: s.name,
        roll_no: s.roll_no,
        section: s.current_section_name
      })));
    }
    if (!nurseryData.success) {
      console.log('Error:', nurseryData.message);
    }
    console.log('');
    
    // Test 3: Get students with section filter
    console.log('--- Test 3: Get students for Nursery Section A ---');
    const sectionResponse = await fetch('http://localhost:5000/api/students?class_id=51&section_id=53', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const sectionData = await sectionResponse.json();
    console.log('Status:', sectionResponse.status);
    console.log('Success:', sectionData.success);
    console.log('Section A students returned:', sectionData.data?.length || 0);
    if (!sectionData.success) {
      console.log('Error:', sectionData.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
})();
