#!/usr/bin/env node

/**
 * Fix historical duplicate MONTHLY vouchers created for the same
 * student and calendar month across different enrollments.
 *
 * Safety:
 * - Default mode is dry-run (no writes).
 * - Apply mode requires both --apply and --confirm.
 * - Vouchers with payments are never auto-deleted by this script.
 *
 * Usage:
 *   node scripts/fix-duplicate-monthly-vouchers.js
 *   node scripts/fix-duplicate-monthly-vouchers.js --dry-run
 *   node scripts/fix-duplicate-monthly-vouchers.js --apply --confirm
 */

require('dotenv').config();
const { Pool } = require('pg');

function parseArgs(argv) {
  const args = {
    dryRun: true,
    apply: false,
    confirm: false,
    verbose: false
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.dryRun = true;
      args.apply = false;
      continue;
    }

    if (arg === '--apply') {
      args.apply = true;
      args.dryRun = false;
      continue;
    }

    if (arg === '--confirm') {
      args.confirm = true;
      continue;
    }

    if (arg === '--verbose') {
      args.verbose = true;
    }
  }

  return args;
}

function monthLabel(monthValue) {
  const parsed = new Date(monthValue);
  if (Number.isNaN(parsed.getTime())) return 'Dues';
  return `Dues (${parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
}

async function findDuplicateRows(client) {
  const query = `
    WITH monthly AS (
      SELECT
        fv.id AS voucher_id,
        sch.student_id,
        s.name AS student_name,
        DATE_TRUNC('month', fv.month)::date AS month_key,
        fv.month,
        fv.created_at,
        c.name AS class_name,
        sec.name AS section_name,
        COALESCE((
          SELECT SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END)
          FROM fee_voucher_items vi
          WHERE vi.voucher_id = fv.id
        ), 0) AS base_total,
        COALESCE((
          SELECT SUM(fp.amount)
          FROM fee_payments fp
          WHERE fp.voucher_id = fv.id
        ), 0) AS paid_total
      FROM fee_vouchers fv
      JOIN student_class_history sch ON sch.id = fv.student_class_history_id
      JOIN students s ON s.id = sch.student_id
      JOIN classes c ON c.id = sch.class_id
      JOIN sections sec ON sec.id = sch.section_id
      WHERE COALESCE(fv.voucher_type, 'MONTHLY') = 'MONTHLY'
    ), ranked AS (
      SELECT
        m.*,
        ROW_NUMBER() OVER (
          PARTITION BY m.student_id, m.month_key
          ORDER BY m.created_at DESC, m.voucher_id DESC
        ) AS keep_rank,
        COUNT(*) OVER (
          PARTITION BY m.student_id, m.month_key
        ) AS dup_count
      FROM monthly m
    )
    SELECT *
    FROM ranked
    WHERE dup_count > 1
    ORDER BY student_id ASC, month_key DESC, keep_rank ASC, voucher_id DESC;
  `;

  const result = await client.query(query);
  return result.rows;
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
            COALESCE(bt.base_total, 0) as base_total,
            COALESCE(pt.paid_total, 0) as paid_total,
            GREATEST(COALESCE(bt.base_total, 0) - COALESCE(pt.paid_total, 0), 0) as outstanding
     FROM student_vouchers sv
     LEFT JOIN base_totals bt ON bt.voucher_id = sv.voucher_id
     LEFT JOIN payment_totals pt ON pt.voucher_id = sv.voucher_id
     ORDER BY sv.month ASC, sv.voucher_id ASC`,
    [studentId]
  );

  const vouchers = vouchersResult.rows;
  if (vouchers.length === 0) return;

  await client.query(
    `DELETE FROM fee_voucher_items
     WHERE voucher_id = ANY($1::bigint[])
       AND item_type = 'ARREARS'`,
    [vouchers.map(v => v.voucher_id)]
  );

  for (const current of vouchers) {
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
          monthLabel(due.month)
        ]
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.apply && !args.confirm) {
    console.error('Refusing to apply without --confirm.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const duplicateRows = await findDuplicateRows(client);

    const grouped = new Map();
    for (const row of duplicateRows) {
      const key = `${row.student_id}::${row.month_key}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(row);
    }

    const deleteVoucherIds = [];
    const skippedPaidVoucherIds = [];
    const affectedStudents = new Set();

    for (const rows of grouped.values()) {
      for (const row of rows) {
        if (Number(row.keep_rank) === 1) {
          continue;
        }

        const paid = parseFloat(row.paid_total) || 0;
        if (paid > 0) {
          skippedPaidVoucherIds.push(Number(row.voucher_id));
          continue;
        }

        deleteVoucherIds.push(Number(row.voucher_id));
        affectedStudents.add(Number(row.student_id));
      }
    }

    let deletedCount = 0;
    if (args.apply && deleteVoucherIds.length > 0) {
      const deleteResult = await client.query(
        `DELETE FROM fee_vouchers
         WHERE id = ANY($1::bigint[])
         RETURNING id`,
        [deleteVoucherIds]
      );
      deletedCount = deleteResult.rowCount;

      for (const studentId of affectedStudents) {
        await resyncStudentVoucherDues(client, studentId);
      }
    }

    if (args.apply) {
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    const result = {
      mode: args.apply ? 'apply' : 'dry-run',
      duplicate_groups: grouped.size,
      candidate_extra_vouchers: deleteVoucherIds.length + skippedPaidVoucherIds.length,
      deletable_extra_vouchers: deleteVoucherIds.length,
      skipped_paid_extra_vouchers: skippedPaidVoucherIds.length,
      deleted_vouchers: deletedCount,
      affected_students_resynced: args.apply ? affectedStudents.size : 0,
      sample_deletions: deleteVoucherIds.slice(0, 25),
      sample_skipped_paid: skippedPaidVoucherIds.slice(0, 25)
    };

    console.log(JSON.stringify(result, null, 2));

    if (args.verbose && grouped.size > 0) {
      const details = [];
      for (const rows of grouped.values()) {
        const first = rows[0];
        details.push({
          student_id: first.student_id,
          student_name: first.student_name,
          month_key: first.month_key,
          vouchers: rows.map(r => ({
            voucher_id: Number(r.voucher_id),
            keep_rank: Number(r.keep_rank),
            class_name: r.class_name,
            section_name: r.section_name,
            base_total: Number(r.base_total),
            paid_total: Number(r.paid_total)
          }))
        });
      }
      console.log(JSON.stringify({ details }, null, 2));
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error.message || error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
