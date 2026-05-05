#!/usr/bin/env node

/**
 * One-time fix for legacy bulk-import students where manual dues were saved as ARREARS.
 *
 * Problem:
 * - Historical manual dues were sometimes inserted as item_type='ARREARS'.
 * - Outstanding calculations intentionally exclude ARREARS to avoid double counting carry-forward dues.
 * - Result: amounts appeared in voucher UI but not in student outstanding.
 * - Older migrated rows may also carry a legacy description; both should print as plain "Dues".
 *
 * This script:
 * 1) Finds ARREARS rows for bulk-import students that are not system-generated carry-forward rows.
 * 2) Converts those rows to CUSTOM with a safe legacy description.
 * 3) Rebuilds ARREARS rows per affected student to keep future voucher carry-forward correct.
 *
 * Usage:
 *   node scripts/fix-legacy-bulk-import-manual-dues.js --dry-run
 *   node scripts/fix-legacy-bulk-import-manual-dues.js --apply --confirm
 */

const pool = require('../src/config/db');

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    confirm: argv.includes('--confirm'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--apply')
  };
}

function formatDuesMonthLabel(monthValue) {
  const parsed = new Date(monthValue);
  if (Number.isNaN(parsed.getTime())) return 'Dues';
  return `Dues (${parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
}

async function resyncStudentVoucherDues(client, studentId) {
  const vouchersResult = await client.query(
    `WITH student_vouchers AS (
       SELECT v.id as voucher_id, v.month
       FROM fee_vouchers v
       JOIN student_class_history sch ON v.student_class_history_id = sch.id
       WHERE sch.student_id = $1
     ),
     base_totals AS (
       SELECT voucher_id, COALESCE(SUM(amount), 0) as base_total
       FROM fee_voucher_items
       WHERE item_type <> 'ARREARS'
       GROUP BY voucher_id
     ),
     payment_totals AS (
       SELECT voucher_id, COALESCE(SUM(amount), 0) as paid_total
       FROM fee_payments
       GROUP BY voucher_id
     )
     SELECT sv.voucher_id,
            sv.month,
            GREATEST(COALESCE(bt.base_total, 0) - COALESCE(pt.paid_total, 0), 0) as outstanding
     FROM student_vouchers sv
     LEFT JOIN base_totals bt ON bt.voucher_id = sv.voucher_id
     LEFT JOIN payment_totals pt ON pt.voucher_id = sv.voucher_id
     ORDER BY sv.month ASC, sv.voucher_id ASC`,
    [studentId]
  );

  const vouchers = vouchersResult.rows;

  for (const current of vouchers) {
    await client.query(
      `DELETE FROM fee_voucher_items
       WHERE voucher_id = $1 AND item_type = 'ARREARS'`,
      [current.voucher_id]
    );

    const currentMonth = new Date(current.month);
    if (Number.isNaN(currentMonth.getTime())) continue;

    const duesFromPrevious = vouchers.filter(prev => {
      const prevMonth = new Date(prev.month);
      return (
        !Number.isNaN(prevMonth.getTime()) &&
        prevMonth < currentMonth &&
        (parseFloat(prev.outstanding) || 0) > 0
      );
    });

    for (const due of duesFromPrevious) {
      await client.query(
        `INSERT INTO fee_voucher_items (voucher_id, item_type, amount, description)
         VALUES ($1, 'ARREARS', $2, $3)`,
        [
          current.voucher_id,
          parseFloat(due.outstanding) || 0,
          formatDuesMonthLabel(due.month)
        ]
      );
    }
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (options.apply && !options.confirm) {
    console.error('Refusing to apply without --confirm');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const legacyResult = await client.query(
      `SELECT vi.id,
              vi.voucher_id,
              vi.item_type,
              vi.description,
              sch.student_id,
              s.name as student_name
       FROM fee_voucher_items vi
       JOIN fee_vouchers v ON vi.voucher_id = v.id
       JOIN student_class_history sch ON v.student_class_history_id = sch.id
       JOIN students s ON sch.student_id = s.id
       WHERE COALESCE(s.is_bulk_imported, false) = true
         AND (
           (
             vi.item_type = 'ARREARS'
             AND (
               vi.description IS NULL
               OR BTRIM(vi.description) = ''
               OR NOT (
                 BTRIM(vi.description) LIKE 'Dues (%'
                 AND RIGHT(BTRIM(vi.description), 1) = ')'
                 AND LENGTH(BTRIM(vi.description)) = 15
               )
             )
           )
           OR (
             vi.item_type = 'CUSTOM'
             AND BTRIM(COALESCE(vi.description, '')) = 'Manual Due (Legacy Bulk Import)'
           )
         )
       ORDER BY sch.student_id ASC, vi.voucher_id ASC, vi.id ASC`
    );

    const legacyRows = legacyResult.rows;
    const affectedStudentIds = [...new Set(legacyRows.map(row => Number(row.student_id)))];

    console.log('Legacy manual-due rows found:', legacyRows.length);
    console.log('Affected bulk-import students:', affectedStudentIds.length);

    if (legacyRows.length === 0) {
      await client.query('ROLLBACK');
      console.log('No legacy rows found. Nothing to fix.');
      return;
    }

    if (options.dryRun) {
      await client.query('ROLLBACK');
      console.log('Dry-run mode: no changes were written.');
      return;
    }

    const updateResult = await client.query(
      `UPDATE fee_voucher_items vi
       SET item_type = CASE WHEN vi.item_type = 'ARREARS' THEN 'CUSTOM' ELSE vi.item_type END,
           description = 'Dues'
       FROM fee_vouchers v
       JOIN student_class_history sch ON v.student_class_history_id = sch.id
       JOIN students s ON sch.student_id = s.id
       WHERE vi.voucher_id = v.id
         AND COALESCE(s.is_bulk_imported, false) = true
         AND (
           (
             vi.item_type = 'ARREARS'
             AND (
               vi.description IS NULL
               OR BTRIM(vi.description) = ''
               OR NOT (
                 BTRIM(vi.description) LIKE 'Dues (%'
                 AND RIGHT(BTRIM(vi.description), 1) = ')'
                 AND LENGTH(BTRIM(vi.description)) = 15
               )
             )
           )
           OR (
             vi.item_type = 'CUSTOM'
             AND BTRIM(COALESCE(vi.description, '')) = 'Manual Due (Legacy Bulk Import)'
           )
         )`
    );

    for (const studentId of affectedStudentIds) {
      await resyncStudentVoucherDues(client, studentId);
    }

    await client.query('COMMIT');

    console.log('Rows converted to CUSTOM:', updateResult.rowCount || 0);
    console.log('Students resynced:', affectedStudentIds.length);
    console.log('Fix applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Fix failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
