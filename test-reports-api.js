require('dotenv').config();

async function testReportsFetch() {
  const BASE_URL = 'http://localhost:5000';
  
  console.log('Testing fetching test reports...\n');
  
  // Get auth token first
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@test.com',
      password: 'Admin123!'
    })
  });
  
  const loginData = await loginRes.json();
  const token = loginData.data.token;
  
  // Fetch test reports for PG (class_id should be found)
  console.log('Fetching reports for PG - Section A...\n');
  
  // First, get classes to find PG's ID
  const classesRes = await fetch(`${BASE_URL}/api/classes`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const classesData = await classesRes.json();
  const pgClass = classesData.data.find(c => c.name === 'PG');
  
  if (!pgClass) {
    console.log('❌ PG class not found');
    return;
  }
  
  console.log(`✅ Found PG class with ID: ${pgClass.id}`);
  
  // Get sections for PG
  const sectionsRes = await fetch(`${BASE_URL}/api/sections?class_id=${pgClass.id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const sectionsData = await sectionsRes.json();
  const sectionA = sectionsData.data.find(s => s.name === 'A');
  
  if (!sectionA) {
    console.log('❌ Section A not found');
    return;
  }
  
  console.log(`✅ Found Section A with ID: ${sectionA.id}\n`);
  
  // Fetch test reports
  const reportsRes = await fetch(`${BASE_URL}/api/test-reports?class_id=${pgClass.id}&section_id=${sectionA.id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const reportsData = await reportsRes.json();
  
  console.log('API Response:');
  console.log(JSON.stringify(reportsData, null, 2));
  
  if (reportsData.success && reportsData.data.length > 0) {
    console.log(`\n✅ Successfully fetched ${reportsData.data.length} reports!`);
    console.log('\nReports:');
    reportsData.data.forEach((r, i) => {
      console.log(`${i + 1}. ${r.file_name} (${r.file_type}) - ${new Date(r.report_date).toLocaleDateString()}`);
    });
  } else {
    console.log('\n❌ No reports returned from API');
  }
}

testReportsFetch().catch(console.error);
