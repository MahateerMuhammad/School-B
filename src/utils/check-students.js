require('dotenv').config();
const pool = require('./src/config/db');

async function checkStudents() {
    try {
        // Total count
        const result = await pool.query('SELECT COUNT(*) as count FROM students');
        console.log('Total students in database:', result.rows[0].count);
        
        // By class
        const classResult = await pool.query(`
            SELECT 
                c.name as class_name, 
                COUNT(DISTINCT s.id) as student_count 
            FROM students s 
            LEFT JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL 
            LEFT JOIN classes c ON sch.class_id = c.id 
            GROUP BY c.name 
            ORDER BY c.name
        `);
        
        console.log('\nStudents by class:');
        classResult.rows.forEach(row => {
            console.log(`  ${row.class_name || 'No class assigned'}: ${row.student_count}`);
        });
        
        // Sample students
        const sampleResult = await pool.query(`
            SELECT s.id, s.name, s.father_name, c.name as class_name, sec.name as section_name
            FROM students s
            LEFT JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
            LEFT JOIN classes c ON sch.class_id = c.id
            LEFT JOIN sections sec ON sch.section_id = sec.id
            LIMIT 5
        `);
        
        console.log('\nSample students:');
        sampleResult.rows.forEach(row => {
            console.log(`  ${row.id}: ${row.name} (Father: ${row.father_name || 'N/A'}) - ${row.class_name || 'No class'}/${row.section_name || 'No section'}`);
        });
        
        await pool.end();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkStudents();
