const pool = require('../src/config/db');

async function seedBasicData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🌱 Seeding basic classes and sections...');

    // Insert basic classes if they don't exist
    await client.query(`
      INSERT INTO classes (id, name, class_type, is_active) 
      VALUES 
        (1, 'Class 1', 'SCHOOL', true),
        (2, 'Class 2', 'SCHOOL', true),
        (3, 'Class 3', 'SCHOOL', true)
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert basic sections if they don't exist
    await client.query(`
      INSERT INTO sections (id, class_id, name)
      VALUES 
        (1, 1, 'Section A'),
        (2, 1, 'Section B'),
        (3, 2, 'Section A'),
        (4, 2, 'Section B'),
        (5, 3, 'Section A'),
        (6, 3, 'Section B')
      ON CONFLICT (id) DO NOTHING
    `);

    // Check what was created
    const classResult = await client.query('SELECT * FROM classes ORDER BY id');
    const sectionResult = await client.query('SELECT * FROM sections ORDER BY id');

    console.log('📊 Classes:', classResult.rows);
    console.log('📊 Sections:', sectionResult.rows);

    await client.query('COMMIT');
    console.log('✅ Basic data seeded successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding data:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedBasicData();