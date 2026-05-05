const pool = require('../src/config/db');

async function run() {
  await pool.query('BEGIN');
  try {
    // 1) Unarchive sections that currently have active students.
    // Restore original name when it follows ARCHIVED_<id>_<name> pattern.
    const unarchiveResult = await pool.query(`
      WITH candidate_sections AS (
        SELECT
          s.id,
          s.class_id,
          s.name,
          CASE
            WHEN s.name ~ ('^ARCHIVED_' || s.id::text || '_')
              THEN regexp_replace(s.name, ('^ARCHIVED_' || s.id::text || '_'), '')
            ELSE s.name
          END AS restored_name
        FROM sections s
        WHERE s.is_archived = true
          AND EXISTS (
            SELECT 1
            FROM student_class_history sch
            WHERE sch.section_id = s.id
              AND sch.end_date IS NULL
          )
      )
      UPDATE sections s
      SET is_archived = false,
          name = c.restored_name
      FROM candidate_sections c
      WHERE s.id = c.id
      RETURNING s.id, s.class_id, s.name
    `);

    // 2) For this reported case, hide One -> D when it is empty.
    const archiveEmptyD = await pool.query(`
      UPDATE sections s
      SET is_archived = true,
          name = CASE
            WHEN s.name ~ ('^ARCHIVED_' || s.id::text || '_') THEN s.name
            ELSE ('ARCHIVED_' || s.id::text || '_' || s.name)
          END
      WHERE s.is_archived = false
        AND lower(s.name) = 'd'
        AND EXISTS (
          SELECT 1 FROM classes c
          WHERE c.id = s.class_id AND lower(c.name) = 'one'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM student_class_history sch
          WHERE sch.section_id = s.id
            AND sch.end_date IS NULL
        )
      RETURNING s.id, s.class_id, s.name
    `);

    await pool.query('COMMIT');

    console.log(JSON.stringify({
      restored_sections: unarchiveResult.rows,
      archived_empty_one_d_sections: archiveEmptyD.rows,
    }, null, 2));
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Repair failed:', error.message);
  process.exit(1);
});
