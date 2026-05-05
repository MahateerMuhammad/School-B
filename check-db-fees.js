/**
 * Quick database check for fee structures
 */

const pool = require('./src/config/db');

async function checkFeeStructures() {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING DATABASE ===\n');

    // Get all classes
    const classesResult = await client.query('SELECT id, name FROM classes ORDER BY id');
    console.log('Total classes in database:', classesResult.rows.length);
    console.log('Classes:', classesResult.rows);

    console.log('\n=== FEE STRUCTURES ===\n');

    // Get all fee structures
    const feeStructuresResult = await client.query(`
      SELECT 
        cfs.*,
        c.name as class_name
      FROM class_fee_structure cfs
      JOIN classes c ON c.id = cfs.class_id
      ORDER BY c.id, cfs.effective_from DESC
    `);

    console.log('Total fee structures in database:', feeStructuresResult.rows.length);
    feeStructuresResult.rows.forEach(fee => {
      console.log(`\nClass: ${fee.class_name} (ID: ${fee.class_id})`);
      console.log(`  Admission Fee: ${fee.admission_fee}`);
      console.log(`  Monthly Fee: ${fee.monthly_fee}`);
      console.log(`  Paper Fund: ${fee.paper_fund}`);
      console.log(`  Effective From: ${fee.effective_from}`);
    });

    console.log('\n=== TESTING QUERY FROM CONTROLLER ===\n');

    // Test the exact query used in the controller
    for (const classRow of classesResult.rows) {
      const feeResult = await client.query(
        `SELECT * FROM class_fee_structure 
         WHERE class_id = $1 
         ORDER BY effective_from DESC 
         LIMIT 1`,
        [classRow.id]
      );
      
      console.log(`Class ${classRow.id} (${classRow.name}): ${feeResult.rows.length > 0 ? 'HAS fee structure' : 'NO fee structure'}`);
      if (feeResult.rows.length > 0) {
        console.log('  ->', feeResult.rows[0]);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

checkFeeStructures();
