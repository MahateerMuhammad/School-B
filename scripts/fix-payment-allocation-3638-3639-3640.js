#!/usr/bin/env node

const pool = require('../src/config/db');

const CONTEXT_VOUCHER_IDS = [3638, 3639, 3640];
const SOURCE_VOUCHER_ID = 3639;
const TARGET_VOUCHER_ID = 3640;
const APPLY_MODE = process.argv.includes('--apply');

function toAmount(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCents(value) {
  return Math.round(toAmount(value) * 100);
}

function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

async function getVoucherSnapshot(client, voucherIds) {
  const result = await client.query(
    `SELECT
       v.id,
       v.month,
       sch.student_id,
       s.name as student_name,
       COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) as base_total,
       COALESCE((SELECT SUM(fp.amount) FROM fee_payments fp WHERE fp.voucher_id = v.id), 0) as paid_total,
       GREATEST(
         COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) -
         COALESCE((SELECT SUM(fp.amount) FROM fee_payments fp WHERE fp.voucher_id = v.id), 0),
         0
       ) as due_amount
     FROM fee_vouchers v
     JOIN student_class_history sch ON sch.id = v.student_class_history_id
     JOIN students s ON s.id = sch.student_id
     LEFT JOIN fee_voucher_items vi ON vi.voucher_id = v.id
     WHERE v.id = ANY($1::int[])
     GROUP BY v.id, v.month, sch.student_id, s.name
     ORDER BY v.month ASC, v.id ASC`,
    [voucherIds]
  );

  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    student_id: Number(row.student_id),
    base_total: toAmount(row.base_total),
    paid_total: toAmount(row.paid_total),
    due_amount: toAmount(row.due_amount)
  }));
}

async function getSourcePayments(client) {
  const result = await client.query(
    `SELECT id, voucher_id, amount, payment_date, created_at
     FROM fee_payments
     WHERE voucher_id = $1
     ORDER BY created_at DESC, id DESC`,
    [SOURCE_VOUCHER_ID]
  );

  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    voucher_id: Number(row.voucher_id),
    amount: toAmount(row.amount)
  }));
}

function computeTransfer(snapshot) {
  const source = snapshot.find((row) => row.id === SOURCE_VOUCHER_ID);
  const target = snapshot.find((row) => row.id === TARGET_VOUCHER_ID);

  if (!source || !target) {
    throw new Error('Required vouchers not found for correction.');
  }

  if (source.student_id !== target.student_id) {
    throw new Error('Source and target vouchers do not belong to the same student.');
  }

  const sourceExcessCents = Math.max(toCents(source.paid_total) - toCents(source.base_total), 0);
  const targetNeededCents = Math.max(toCents(target.base_total) - toCents(target.paid_total), 0);
  const transferCents = Math.min(sourceExcessCents, targetNeededCents);

  return {
    studentId: source.student_id,
    studentName: source.student_name,
    source,
    target,
    sourceExcessCents,
    targetNeededCents,
    transferCents
  };
}

async function assertVoucherIntegrity(client, voucherIds) {
  const result = await client.query(
    `WITH base_totals AS (
       SELECT v.id as voucher_id,
              COALESCE(SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END), 0) as base_total
       FROM fee_vouchers v
       LEFT JOIN fee_voucher_items vi ON vi.voucher_id = v.id
       WHERE v.id = ANY($1::int[])
       GROUP BY v.id
     ),
     paid_totals AS (
       SELECT v.id as voucher_id,
              COALESCE(SUM(fp.amount), 0) as paid_total
       FROM fee_vouchers v
       LEFT JOIN fee_payments fp ON fp.voucher_id = v.id
       WHERE v.id = ANY($1::int[])
       GROUP BY v.id
     )
     SELECT bt.voucher_id, bt.base_total, COALESCE(pt.paid_total, 0) as paid_total
     FROM base_totals bt
     LEFT JOIN paid_totals pt ON pt.voucher_id = bt.voucher_id
     WHERE COALESCE(pt.paid_total, 0) > bt.base_total`,
    [voucherIds]
  );

  if (result.rows.length > 0) {
    throw new Error(`Integrity check failed: paid_total exceeds base_total for voucher ${result.rows[0].voucher_id}`);
  }
}

async function main() {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    console.log(`Mode: ${APPLY_MODE ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Context vouchers: ${CONTEXT_VOUCHER_IDS.join(', ')}`);

    const beforeSnapshot = await getVoucherSnapshot(client, CONTEXT_VOUCHER_IDS);
    console.log('\nBefore correction:');
    console.table(beforeSnapshot);

    const plan = computeTransfer(beforeSnapshot);
    console.log(`\nStudent: ${plan.studentName} (ID ${plan.studentId})`);
    console.log(`Source excess (voucher ${SOURCE_VOUCHER_ID}): Rs. ${fromCents(plan.sourceExcessCents).toFixed(2)}`);
    console.log(`Target need   (voucher ${TARGET_VOUCHER_ID}): Rs. ${fromCents(plan.targetNeededCents).toFixed(2)}`);
    console.log(`Planned move: Rs. ${fromCents(plan.transferCents).toFixed(2)}`);

    if (plan.transferCents <= 0) {
      console.log('\nNo correction needed.');
      return;
    }

    const sourcePayments = await getSourcePayments(client);
    const sourcePaymentTotalCents = sourcePayments.reduce((sum, payment) => sum + toCents(payment.amount), 0);

    if (sourcePaymentTotalCents < plan.transferCents) {
      throw new Error('Source voucher does not have enough payment amount to transfer.');
    }

    console.log('\nSource voucher payments considered for transfer:');
    console.table(sourcePayments);

    if (!APPLY_MODE) {
      console.log('\nDry-run completed. Re-run with --apply to execute correction.');
      return;
    }

    await client.query('BEGIN');
    transactionStarted = true;

    await client.query(
      `SELECT id
       FROM fee_vouchers
       WHERE id = ANY($1::int[])
       FOR UPDATE`,
      [CONTEXT_VOUCHER_IDS]
    );

    const lockedSnapshot = await getVoucherSnapshot(client, CONTEXT_VOUCHER_IDS);
    const lockedPlan = computeTransfer(lockedSnapshot);

    if (lockedPlan.transferCents <= 0) {
      console.log('\nNo correction needed after lock.');
      await client.query('ROLLBACK');
      transactionStarted = false;
      return;
    }

    let remainingCents = lockedPlan.transferCents;
    const lockedSourcePayments = await getSourcePayments(client);

    for (const payment of lockedSourcePayments) {
      if (remainingCents <= 0) break;

      const paymentCents = toCents(payment.amount);
      if (paymentCents <= 0) continue;

      const moveCents = Math.min(paymentCents, remainingCents);

      if (moveCents === paymentCents) {
        await client.query(
          `UPDATE fee_payments
           SET voucher_id = $1
           WHERE id = $2`,
          [TARGET_VOUCHER_ID, payment.id]
        );
      } else {
        await client.query(
          `UPDATE fee_payments
           SET amount = $1
           WHERE id = $2`,
          [fromCents(paymentCents - moveCents), payment.id]
        );

        await client.query(
          `INSERT INTO fee_payments (voucher_id, amount, payment_date, created_at)
           VALUES ($1, $2, $3, $4)`,
          [TARGET_VOUCHER_ID, fromCents(moveCents), payment.payment_date, payment.created_at]
        );
      }

      remainingCents -= moveCents;
    }

    if (remainingCents > 0) {
      throw new Error(`Unable to transfer full amount. Remaining: Rs. ${fromCents(remainingCents).toFixed(2)}`);
    }

    await assertVoucherIntegrity(client, CONTEXT_VOUCHER_IDS);

    await client.query('COMMIT');
    transactionStarted = false;

    const afterSnapshot = await getVoucherSnapshot(client, CONTEXT_VOUCHER_IDS);
    console.log('\nAfter correction:');
    console.table(afterSnapshot);
    console.log('\nCorrection applied successfully.');
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    console.error('\nCorrection failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
