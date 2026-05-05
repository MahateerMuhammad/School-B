require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkFSCContacts() {
  try {
    // First check what classes exist
    const classes = await pool.query(`SELECT id, name FROM classes ORDER BY name`);
    console.log('Available classes:', classes.rows.map(c => c.name).join(', '));
    
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.father_name,
        s.phone as father_contact,
        c.name as class_name,
        sec.name as section_name
      FROM students s
      JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
      JOIN classes c ON sch.class_id = c.id
      JOIN sections sec ON sch.section_id = sec.id
      WHERE c.name IN ('1st Year', '2nd Year') OR LOWER(c.name) LIKE '%fsc%' OR LOWER(sec.name) LIKE '%fsc%'
      ORDER BY sec.name, s.name
    `);

    console.log(`\nFSC Students (Total: ${result.rows.length})\n`);
    console.log('=' .repeat(100));
    
    let withContact = 0;
    let withoutContact = 0;
    
    result.rows.forEach((s, i) => {
      const hasContact = s.father_contact && s.father_contact.trim() !== '';
      if (hasContact) withContact++;
      else withoutContact++;
      
      console.log(`${i+1}. ${s.name.padEnd(25)} | Father: ${(s.father_name || '-').padEnd(20)} | Contact: ${s.father_contact || 'MISSING'} | Section: ${s.section_name}`);
    });
    
    console.log('\n' + '='.repeat(100));
    console.log(`SUMMARY:`);
    console.log(`  With Contact: ${withContact}`);
    console.log(`  Without Contact: ${withoutContact}`);
    console.log(`  Total: ${result.rows.length}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkFSCContacts();
