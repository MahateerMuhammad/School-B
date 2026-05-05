require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkTestReports() {
  const client = await pool.connect();
  
  try {
    console.log('📊 Checking test_reports table...\n');
    
    const result = await client.query(`
      SELECT 
        tr.id,
        tr.class_id,
        tr.section_id,
        c.name as class_name,
        s.name as section_name,
        tr.report_date,
        tr.file_name,
        tr.file_type,
        tr.created_at
      FROM test_reports tr
      LEFT JOIN classes c ON tr.class_id = c.id
      LEFT JOIN sections s ON tr.section_id = s.id
      ORDER BY tr.created_at DESC
      LIMIT 10
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No test reports found in database');
    } else {
      console.log(`✅ Found ${result.rows.length} test reports:\n`);
      console.table(result.rows.map(r => ({
        ID: r.id,
        Class: r.class_name,
        Section: r.section_name,
        Date: new Date(r.report_date).toLocaleDateString(),
        File: r.file_name,
        Type: r.file_type,
        Uploaded: new Date(r.created_at).toLocaleString()
      })));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTestReports();
