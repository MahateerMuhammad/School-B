#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const summaryQuery = `
      WITH monthly AS (
        SELECT
          fv.id AS voucher_id,
          sch.student_id,
          s.name AS student_name,
          DATE_TRUNC('month', fv.month)::date AS month_key,
          c.name AS class_name,
          sec.name AS section_name,
          fv.created_at,
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
      ),
      ranked AS (
        SELECT
          m.*,
          GREATEST(m.base_total - m.paid_total, 0) AS due_amount,
          ROW_NUMBER() OVER (
            PARTITION BY m.student_id, m.month_key
            ORDER BY m.created_at DESC, m.voucher_id DESC
          ) AS keep_rank,
          COUNT(*) OVER (
            PARTITION BY m.student_id, m.month_key
          ) AS dup_count
        FROM monthly m
      )
      SELECT
        COUNT(DISTINCT (student_id, month_key))::int AS duplicate_groups,
        COUNT(*) FILTER (WHERE keep_rank > 1)::int AS extra_vouchers,
        COUNT(DISTINCT student_id)::int AS affected_students,
        COALESCE(SUM(base_total) FILTER (WHERE keep_rank > 1), 0)::numeric(14,2) AS extra_base_total,
        COALESCE(SUM(paid_total) FILTER (WHERE keep_rank > 1), 0)::numeric(14,2) AS extra_paid_total,
        COALESCE(SUM(due_amount) FILTER (WHERE keep_rank > 1), 0)::numeric(14,2) AS extra_due_total,
        COUNT(*) FILTER (WHERE keep_rank > 1 AND paid_total > 0)::int AS extra_vouchers_with_payments,
        COUNT(*) FILTER (WHERE keep_rank > 1 AND paid_total = 0)::int AS extra_vouchers_without_payments
      FROM ranked
      WHERE dup_count > 1;
    `;

    const detailsQuery = `
      WITH monthly AS (
        SELECT
          fv.id AS voucher_id,
          sch.student_id,
          s.name AS student_name,
          DATE_TRUNC('month', fv.month)::date AS month_key,
          c.name AS class_name,
          sec.name AS section_name,
          fv.created_at,
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
      ),
      ranked AS (
        SELECT
          m.*,
          GREATEST(m.base_total - m.paid_total, 0) AS due_amount,
          ROW_NUMBER() OVER (
            PARTITION BY m.student_id, m.month_key
            ORDER BY m.created_at DESC, m.voucher_id DESC
          ) AS keep_rank,
          COUNT(*) OVER (
            PARTITION BY m.student_id, m.month_key
          ) AS dup_count
        FROM monthly m
      ),
      grouped AS (
        SELECT
          student_id,
          MIN(student_name) AS student_name,
          month_key,
          MAX(dup_count)::int AS voucher_count,
          COUNT(*) FILTER (WHERE keep_rank > 1)::int AS extra_count,
          COALESCE(SUM(base_total) FILTER (WHERE keep_rank > 1), 0)::numeric(14,2) AS extra_base_total,
          COALESCE(SUM(paid_total) FILTER (WHERE keep_rank > 1), 0)::numeric(14,2) AS extra_paid_total,
          COALESCE(SUM(due_amount) FILTER (WHERE keep_rank > 1), 0)::numeric(14,2) AS extra_due_total,
          json_agg(
            json_build_object(
              'voucher_id', voucher_id,
              'keep_rank', keep_rank,
              'class_name', class_name,
              'section_name', section_name,
              'created_at', created_at,
              'base_total', base_total,
              'paid_total', paid_total,
              'due_amount', due_amount
            )
            ORDER BY keep_rank ASC, created_at DESC, voucher_id DESC
          ) AS vouchers
        FROM ranked
        WHERE dup_count > 1
        GROUP BY student_id, month_key
      )
      SELECT *
      FROM grouped
      ORDER BY month_key DESC, extra_due_total DESC, student_id ASC;
    `;

    const summaryResult = await pool.query(summaryQuery);
    const detailResult = await pool.query(detailsQuery);

    const summary = summaryResult.rows[0] || {};
    const groups = detailResult.rows || [];

    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
    const reportDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, `duplicate-monthly-vouchers-${stamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({ generated_at: now.toISOString(), summary, groups }, null, 2));

    const topGroups = groups.slice(0, 15).map((g) => ({
      student_id: g.student_id,
      student_name: g.student_name,
      month_key: g.month_key,
      voucher_count: g.voucher_count,
      extra_count: g.extra_count,
      extra_base_total: g.extra_base_total,
      extra_paid_total: g.extra_paid_total,
      extra_due_total: g.extra_due_total
    }));

    console.log('SUMMARY');
    console.log(JSON.stringify(summary, null, 2));
    console.log('TOP_GROUPS');
    console.log(JSON.stringify(topGroups, null, 2));
    console.log('REPORT_FILE');
    console.log(reportPath);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('DIAGNOSIS_FAILED');
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
