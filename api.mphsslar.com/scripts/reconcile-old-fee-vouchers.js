#!/usr/bin/env node

/**
 * One-time historical fee voucher reconciliation.
 *
 * What it does (per student):
 * 1) Recalculate vouchers in month order (base totals exclude ARREARS rows).
 * 2) Reallocate all historical payments oldest-first.
 * 3) Rebuild ARREARS rows on later vouchers from true unpaid balances.
 * 4) Produce before/after status snapshots (PAID/PARTIAL/UNPAID).
 *
 * Safety:
 * - Default mode is dry-run (no writes).
 * - Apply mode requires both --apply and --confirm.
 *
 * Usage:
 *   node scripts/reconcile-old-fee-vouchers.js
 *   node scripts/reconcile-old-fee-vouchers.js --dry-run --limit=100
 *   node scripts/reconcile-old-fee-vouchers.js --dry-run --student-id=123
 *   node scripts/reconcile-old-fee-vouchers.js --apply --confirm
 */

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

function parseArgs(argv) {
  const args = {
    dryRun: true,
    apply: false,
    confirm: false,
    studentId: null,
    limit: null,
    reportFile: null,
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
      continue;
    }

    if (arg.startsWith('--student-id=')) {
      const raw = arg.split('=')[1];
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.studentId = parsed;
      }
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const raw = arg.split('=')[1];
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.limit = parsed;
      }
      continue;
    }

    if (arg.startsWith('--report-file=')) {
      const raw = arg.split('=')[1];
      if (raw && raw.trim()) {
        args.reportFile = raw.trim();
      }
    }
  }

  return args;
}

function toCents(value) {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

function monthLabel(monthValue) {
  const parsed = new Date(monthValue);
  if (Number.isNaN(parsed.getTime())) return 'Dues';
  return `Dues (${parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
}

function statusFrom(baseCents, paidCents) {
  if (paidCents >= baseCents) return 'PAID';
  if (paidCents > 0) return 'PARTIAL';
  return 'UNPAID';
}

function normalizeDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function sortPaymentRows(rows) {
  return [...rows].sort((a, b) => {
    const av = `${a.voucher_id}|${a.payment_date_key}|${a.created_at_key}|${a.amount_cents}`;
    const bv = `${b.voucher_id}|${b.payment_date_key}|${b.created_at_key}|${b.amount_cents}`;
    return av.localeCompare(bv);
  });
}

function sortArrearsRows(rows) {
  return [...rows].sort((a, b) => {
    const av = `${a.voucher_id}|${a.amount_cents}|${a.description || ''}`;
    const bv = `${b.voucher_id}|${b.amount_cents}|${b.description || ''}`;
    return av.localeCompare(bv);
  });
}

function sameRows(a, b, keys) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    for (const key of keys) {
      if (a[i][key] !== b[i][key]) return false;
    }
  }
  return true;
}

async function getStudentsToProcess(client, options) {
  const where = [];
  const params = [];
  let idx = 1;

  if (options.studentId) {
    where.push(`s.id = $${idx}`);
    params.push(options.studentId);
    idx += 1;
  }

  let query = `
    SELECT s.id as student_id,
           s.name as student_name,
           COUNT(v.id)::int as voucher_count
    FROM students s
    JOIN student_class_history sch ON sch.student_id = s.id
    JOIN fee_vouchers v ON v.student_class_history_id = sch.id
  `;

  if (where.length > 0) {
    query += ` WHERE ${where.join(' AND ')}`;
  }

  query += `
    GROUP BY s.id, s.name
    ORDER BY s.id ASC
  `;

  if (options.limit) {
    query += ` LIMIT $${idx}`;
    params.push(options.limit);
  }

  const result = await client.query(query, params);
  return result.rows;
}

async function getStudentData(client, studentId) {
  const vouchersResult = await client.query(
    `SELECT
       v.id as voucher_id,
       v.month,
       sch.id as enrollment_id,
       COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) as base_total,
       COALESCE((SELECT SUM(fp.amount) FROM fee_payments fp WHERE fp.voucher_id = v.id), 0) as paid_total
     FROM fee_vouchers v
     JOIN student_class_history sch ON sch.id = v.student_class_history_id
     LEFT JOIN fee_voucher_items vi ON vi.voucher_id = v.id
     WHERE sch.student_id = $1
     GROUP BY v.id, v.month, sch.id
     ORDER BY v.month ASC, v.id ASC`,
    [studentId]
  );

  const paymentResult = await client.query(
    `SELECT fp.id,
            fp.voucher_id,
            fp.amount,
            fp.payment_date,
            fp.created_at
     FROM fee_payments fp
     JOIN fee_vouchers v ON v.id = fp.voucher_id
     JOIN student_class_history sch ON sch.id = v.student_class_history_id
     WHERE sch.student_id = $1
     ORDER BY fp.payment_date ASC, fp.created_at ASC, fp.id ASC`,
    [studentId]
  );

  const arrearsResult = await client.query(
    `SELECT vi.id,
            vi.voucher_id,
            vi.amount,
            vi.description
     FROM fee_voucher_items vi
     JOIN fee_vouchers v ON v.id = vi.voucher_id
     JOIN student_class_history sch ON sch.id = v.student_class_history_id
     WHERE sch.student_id = $1
       AND vi.item_type = 'ARREARS'
     ORDER BY vi.voucher_id ASC, vi.id ASC`,
    [studentId]
  );

  const itemsResult = await client.query(
    `SELECT vi.voucher_id,
            vi.item_type,
            vi.amount,
            vi.description
     FROM fee_voucher_items vi
     JOIN fee_vouchers v ON v.id = vi.voucher_id
     JOIN student_class_history sch ON sch.id = v.student_class_history_id
     WHERE sch.student_id = $1
     ORDER BY vi.voucher_id ASC, vi.id ASC`,
    [studentId]
  );

  const vouchers = vouchersResult.rows.map((row) => ({
    voucher_id: Number(row.voucher_id),
    month: row.month,
    month_iso: new Date(row.month).toISOString().slice(0, 10),
    base_cents: toCents(row.base_total),
    paid_cents_existing: toCents(row.paid_total)
  }));

  const payments = paymentResult.rows.map((row) => ({
    id: Number(row.id),
    source_voucher_id: Number(row.voucher_id),
    amount_cents: toCents(row.amount),
    payment_date: row.payment_date,
    created_at: row.created_at
  }));

  const existingArrears = arrearsResult.rows.map((row) => ({
    id: Number(row.id),
    voucher_id: Number(row.voucher_id),
    amount_cents: toCents(row.amount),
    description: row.description || null
  }));

  const itemsByVoucher = new Map();
  for (const row of itemsResult.rows) {
    const voucherId = Number(row.voucher_id);
    if (!itemsByVoucher.has(voucherId)) {
      itemsByVoucher.set(voucherId, []);
    }
    itemsByVoucher.get(voucherId).push({
      voucher_id: voucherId,
      item_type: row.item_type,
      amount_cents: toCents(row.amount),
      description: row.description || null
    });
  }

  return { vouchers, payments, existingArrears, itemsByVoucher };
}

function inferLegacyTwoMonthSettlementPayments(vouchers, payments, itemsByVoucher) {
  // Legacy repair rule requested by business:
  // If system has only March+April style 2 vouchers and latest has only monthly fee
  // (no carried dues), mark previous month paid by default.
  if (!Array.isArray(vouchers) || vouchers.length !== 2) return [];

  const older = vouchers[0];
  const latest = vouchers[1];

  const olderPaidExisting = payments
    .filter((p) => p.source_voucher_id === older.voucher_id)
    .reduce((sum, p) => sum + p.amount_cents, 0);

  const olderOutstanding = Math.max(older.base_cents - olderPaidExisting, 0);
  if (olderOutstanding <= 0) return [];

  const latestItems = itemsByVoucher.get(latest.voucher_id) || [];
  const latestHasAnyArrears = latestItems.some(
    (item) => item.item_type === 'ARREARS' && item.amount_cents > 0
  );
  if (latestHasAnyArrears) return [];

  const latestPositiveBaseItems = latestItems.filter(
    (item) => item.item_type !== 'ARREARS' && item.amount_cents > 0
  );

  const latestMonthlyOnly = (
    latestPositiveBaseItems.length === 1 &&
    latestPositiveBaseItems[0].item_type === 'MONTHLY'
  );

  if (!latestMonthlyOnly) return [];

  if (olderPaidExisting > 0) return [];

  return [{
    id: `INFERRED-${older.voucher_id}-${latest.voucher_id}`,
    source_voucher_id: older.voucher_id,
    amount_cents: olderOutstanding,
    payment_date: latest.month,
    created_at: new Date(),
    inferred_legacy_settlement: true
  }];
}

function buildAllocationPlan(vouchers, payments) {
  const outstanding = new Map();
  const paidAfter = new Map();

  for (const voucher of vouchers) {
    outstanding.set(voucher.voucher_id, voucher.base_cents);
    paidAfter.set(voucher.voucher_id, 0);
  }

  const allocations = [];
  let unallocatedCents = 0;

  for (const payment of payments) {
    let remaining = payment.amount_cents;

    for (const voucher of vouchers) {
      if (remaining <= 0) break;

      const currentOutstanding = outstanding.get(voucher.voucher_id) || 0;
      if (currentOutstanding <= 0) continue;

      const alloc = Math.min(remaining, currentOutstanding);
      allocations.push({
        source_payment_id: payment.id,
        source_voucher_id: payment.source_voucher_id,
        voucher_id: voucher.voucher_id,
        amount_cents: alloc,
        payment_date: payment.payment_date,
        created_at: payment.created_at
      });

      outstanding.set(voucher.voucher_id, currentOutstanding - alloc);
      paidAfter.set(voucher.voucher_id, (paidAfter.get(voucher.voucher_id) || 0) + alloc);
      remaining -= alloc;
    }

    if (remaining > 0) {
      // Preserve any historical overpayment instead of dropping data.
      allocations.push({
        source_payment_id: payment.id,
        source_voucher_id: payment.source_voucher_id,
        voucher_id: payment.source_voucher_id,
        amount_cents: remaining,
        payment_date: payment.payment_date,
        created_at: payment.created_at,
        overpayment: true
      });
      paidAfter.set(payment.source_voucher_id, (paidAfter.get(payment.source_voucher_id) || 0) + remaining);
      unallocatedCents += remaining;
    }
  }

  return { allocations, outstanding, paidAfter, unallocatedCents };
}

function buildReconciledArrearsRows(vouchers, outstandingByVoucher) {
  const rows = [];

  for (let i = 0; i < vouchers.length; i++) {
    const current = vouchers[i];
    const currentMonth = new Date(current.month);
    if (Number.isNaN(currentMonth.getTime())) continue;

    for (let j = 0; j < i; j++) {
      const previous = vouchers[j];
      const previousMonth = new Date(previous.month);
      if (Number.isNaN(previousMonth.getTime())) continue;

      if (previousMonth >= currentMonth) continue;

      const dueCents = outstandingByVoucher.get(previous.voucher_id) || 0;
      if (dueCents <= 0) continue;

      rows.push({
        voucher_id: current.voucher_id,
        amount_cents: dueCents,
        description: monthLabel(previous.month)
      });
    }
  }

  return rows;
}

function summarizeVoucherStatuses(vouchers, paidByVoucherMap) {
  const summary = {
    paid: 0,
    partial: 0,
    unpaid: 0,
    total_due_cents: 0
  };

  const voucherBreakdown = vouchers.map((voucher) => {
    const paid = paidByVoucherMap.get(voucher.voucher_id) || 0;
    const due = Math.max(voucher.base_cents - paid, 0);
    const status = statusFrom(voucher.base_cents, paid);

    if (status === 'PAID') summary.paid += 1;
    else if (status === 'PARTIAL') summary.partial += 1;
    else summary.unpaid += 1;

    summary.total_due_cents += due;

    return {
      voucher_id: voucher.voucher_id,
      month: voucher.month_iso,
      base_amount: fromCents(voucher.base_cents),
      paid_amount: fromCents(paid),
      due_amount: fromCents(due),
      status
    };
  });

  return { summary, voucherBreakdown };
}

function buildExistingPaymentRows(payments) {
  return payments.map((p) => ({
    voucher_id: p.source_voucher_id,
    amount_cents: p.amount_cents,
    payment_date: p.payment_date,
    created_at: p.created_at,
    payment_date_key: normalizeDateKey(p.payment_date),
    created_at_key: normalizeDateKey(p.created_at)
  }));
}

function buildPlannedPaymentRows(allocations) {
  return allocations.map((a) => ({
    voucher_id: a.voucher_id,
    amount_cents: a.amount_cents,
    payment_date: a.payment_date,
    created_at: a.created_at,
    payment_date_key: normalizeDateKey(a.payment_date),
    created_at_key: normalizeDateKey(a.created_at)
  }));
}

function buildExistingArrearsRows(rows) {
  return rows.map((r) => ({
    voucher_id: r.voucher_id,
    amount_cents: r.amount_cents,
    description: r.description || null
  }));
}

function buildPlannedArrearsRows(rows) {
  return rows.map((r) => ({
    voucher_id: r.voucher_id,
    amount_cents: r.amount_cents,
    description: r.description || null
  }));
}

function hasMeaningfulChanges(existingPaymentRows, plannedPaymentRows, existingArrearsRows, plannedArrearsRows) {
  const paymentsA = sortPaymentRows(existingPaymentRows);
  const paymentsB = sortPaymentRows(plannedPaymentRows);
  const arrearsA = sortArrearsRows(existingArrearsRows);
  const arrearsB = sortArrearsRows(plannedArrearsRows);

  const paymentChanged = !sameRows(paymentsA, paymentsB, [
    'voucher_id',
    'amount_cents',
    'payment_date_key',
    'created_at_key'
  ]);

  const arrearsChanged = !sameRows(arrearsA, arrearsB, [
    'voucher_id',
    'amount_cents',
    'description'
  ]);

  return { paymentChanged, arrearsChanged, changed: paymentChanged || arrearsChanged };
}

async function applyStudentChanges(client, studentId, plannedPaymentRows, plannedArrearsRows) {
  // Lock relevant vouchers for this student.
  const voucherLockResult = await client.query(
    `SELECT v.id
     FROM fee_vouchers v
     JOIN student_class_history sch ON sch.id = v.student_class_history_id
     WHERE sch.student_id = $1
     ORDER BY v.month ASC, v.id ASC
     FOR UPDATE`,
    [studentId]
  );

  const voucherIds = voucherLockResult.rows.map((r) => Number(r.id));
  if (voucherIds.length === 0) {
    return {
      deleted_payments: 0,
      inserted_payments: 0,
      deleted_arrears: 0,
      inserted_arrears: 0
    };
  }

  const deletePaymentsResult = await client.query(
    `DELETE FROM fee_payments
     WHERE voucher_id = ANY($1::bigint[])`,
    [voucherIds]
  );

  let insertedPayments = 0;
  for (const row of plannedPaymentRows) {
    await client.query(
      `INSERT INTO fee_payments (voucher_id, amount, payment_date, created_at)
       VALUES ($1, $2, $3, $4)`,
      [
        row.voucher_id,
        fromCents(row.amount_cents),
        row.payment_date,
        row.created_at || new Date()
      ]
    );
    insertedPayments += 1;
  }

  const deleteArrearsResult = await client.query(
    `DELETE FROM fee_voucher_items
     WHERE voucher_id = ANY($1::bigint[])
       AND item_type = 'ARREARS'`,
    [voucherIds]
  );

  let insertedArrears = 0;
  for (const row of plannedArrearsRows) {
    await client.query(
      `INSERT INTO fee_voucher_items (voucher_id, item_type, amount, description)
       VALUES ($1, 'ARREARS', $2, $3)`,
      [row.voucher_id, fromCents(row.amount_cents), row.description]
    );
    insertedArrears += 1;
  }

  return {
    deleted_payments: deletePaymentsResult.rowCount,
    inserted_payments: insertedPayments,
    deleted_arrears: deleteArrearsResult.rowCount,
    inserted_arrears: insertedArrears
  };
}

function buildReportPath(explicitPath) {
  if (explicitPath) return explicitPath;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  return path.join(reportsDir, `fee-reconciliation-${timestamp}.json`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.apply && !options.confirm) {
    console.error('Refusing to run in apply mode without --confirm.');
    console.error('Run a dry-run first, take a DB backup, then run with: --apply --confirm');
    process.exit(1);
  }

  console.log('=========================================================');
  console.log('Fee Voucher Historical Reconciliation');
  console.log('Mode:', options.apply ? 'APPLY (writes enabled)' : 'DRY-RUN (no writes)');
  if (options.studentId) console.log('Student filter:', options.studentId);
  if (options.limit) console.log('Limit:', options.limit);
  console.log('=========================================================');

  const client = await pool.connect();
  const startedAt = new Date();

  const report = {
    generated_at: startedAt.toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    filters: {
      student_id: options.studentId,
      limit: options.limit
    },
    totals: {
      students_scanned: 0,
      students_with_changes: 0,
      students_updated: 0,
      students_failed: 0,
      inferred_payments_added: 0,
      payment_rows_before: 0,
      payment_rows_after: 0,
      arrears_rows_before: 0,
      arrears_rows_after: 0,
      total_due_before: 0,
      total_due_after: 0,
      overpayment_preserved: 0
    },
    students: [],
    failures: []
  };

  try {
    const students = await getStudentsToProcess(client, options);
    report.totals.students_scanned = students.length;

    for (const student of students) {
      const studentId = Number(student.student_id);
      const studentName = student.student_name;

      try {
        const { vouchers, payments, existingArrears, itemsByVoucher } = await getStudentData(client, studentId);
        if (vouchers.length === 0) continue;

        const inferredPayments = inferLegacyTwoMonthSettlementPayments(vouchers, payments, itemsByVoucher);
        const effectivePayments = [...payments, ...inferredPayments];

        const allocationPlan = buildAllocationPlan(vouchers, effectivePayments);
        const plannedArrears = buildReconciledArrearsRows(vouchers, allocationPlan.outstanding);

        const paidBeforeMap = new Map();
        for (const v of vouchers) {
          paidBeforeMap.set(v.voucher_id, v.paid_cents_existing);
        }

        const before = summarizeVoucherStatuses(vouchers, paidBeforeMap);
        const after = summarizeVoucherStatuses(vouchers, allocationPlan.paidAfter);

        const existingPaymentRows = buildExistingPaymentRows(payments);
        const plannedPaymentRows = buildPlannedPaymentRows(allocationPlan.allocations);
        const existingArrearsRows = buildExistingArrearsRows(existingArrears);
        const plannedArrearsRows = buildPlannedArrearsRows(plannedArrears);

        const changeCheck = hasMeaningfulChanges(
          existingPaymentRows,
          plannedPaymentRows,
          existingArrearsRows,
          plannedArrearsRows
        );

        const studentReport = {
          student_id: studentId,
          student_name: studentName,
          voucher_count: vouchers.length,
          inferred_payments_added: inferredPayments.length,
          changed: changeCheck.changed,
          payment_changed: changeCheck.paymentChanged,
          arrears_changed: changeCheck.arrearsChanged,
          payment_rows_before: existingPaymentRows.length,
          payment_rows_after: plannedPaymentRows.length,
          arrears_rows_before: existingArrearsRows.length,
          arrears_rows_after: plannedArrearsRows.length,
          total_due_before: fromCents(before.summary.total_due_cents),
          total_due_after: fromCents(after.summary.total_due_cents),
          overpayment_preserved: fromCents(allocationPlan.unallocatedCents),
          status_before: {
            paid: before.summary.paid,
            partial: before.summary.partial,
            unpaid: before.summary.unpaid
          },
          status_after: {
            paid: after.summary.paid,
            partial: after.summary.partial,
            unpaid: after.summary.unpaid
          },
          vouchers_before: options.verbose ? before.voucherBreakdown : undefined,
          vouchers_after: options.verbose ? after.voucherBreakdown : undefined
        };

        report.totals.inferred_payments_added += inferredPayments.length;
        report.totals.payment_rows_before += existingPaymentRows.length;
        report.totals.payment_rows_after += plannedPaymentRows.length;
        report.totals.arrears_rows_before += existingArrearsRows.length;
        report.totals.arrears_rows_after += plannedArrearsRows.length;
        report.totals.total_due_before += before.summary.total_due_cents;
        report.totals.total_due_after += after.summary.total_due_cents;
        report.totals.overpayment_preserved += allocationPlan.unallocatedCents;

        if (!changeCheck.changed) {
          report.students.push(studentReport);
          continue;
        }

        report.totals.students_with_changes += 1;

        if (options.apply) {
          await client.query('BEGIN');
          try {
            const applyResult = await applyStudentChanges(
              client,
              studentId,
              plannedPaymentRows,
              plannedArrearsRows
            );

            await client.query('COMMIT');
            report.totals.students_updated += 1;
            studentReport.apply_result = applyResult;
          } catch (applyError) {
            await client.query('ROLLBACK');
            report.totals.students_failed += 1;

            studentReport.error = applyError.message;
            report.failures.push({
              student_id: studentId,
              student_name: studentName,
              error: applyError.message
            });
          }
        }

        report.students.push(studentReport);
      } catch (studentError) {
        report.totals.students_failed += 1;
        report.failures.push({
          student_id: studentId,
          student_name: studentName,
          error: studentError.message
        });
      }
    }

    report.totals.total_due_before = fromCents(report.totals.total_due_before);
    report.totals.total_due_after = fromCents(report.totals.total_due_after);
    report.totals.overpayment_preserved = fromCents(report.totals.overpayment_preserved);

    const reportPath = buildReportPath(options.reportFile);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log('Completed reconciliation run.');
    console.log('Students scanned:', report.totals.students_scanned);
    console.log('Students with changes:', report.totals.students_with_changes);
    if (options.apply) {
      console.log('Students updated:', report.totals.students_updated);
      console.log('Students failed:', report.totals.students_failed);
    }
    console.log('Total due before:', report.totals.total_due_before);
    console.log('Total due after:', report.totals.total_due_after);
    console.log('Overpayment preserved:', report.totals.overpayment_preserved);
    console.log('Report written to:', reportPath);

    if (options.apply && report.totals.students_failed > 0) {
      process.exitCode = 2;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Reconciliation failed:', error.message);
  process.exit(1);
});
