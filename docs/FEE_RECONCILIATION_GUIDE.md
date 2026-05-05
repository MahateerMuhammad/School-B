# One-Time Historical Fee Reconciliation Guide

This process retroactively applies the synced fee rules to old vouchers.

## What this fixes

For each student, the script will:

1. Recalculate vouchers in month order.
2. Reallocate all historical payments oldest-first.
3. Rebuild ARREARS rows in later vouchers from true unpaid balances.
4. Re-derive voucher status from recalculated totals.

Legacy compatibility rule for preexisting 2-month chains:

- If a student has exactly 2 vouchers (for example March and April), and the latest voucher has only one positive `MONTHLY` item with no `ARREARS`, the previous voucher is auto-settled as paid.
- If latest voucher carries any `ARREARS`, previous pending dues are kept as pending.

Source of truth is:

- Fee items excluding ARREARS (base charges)
- Fee payment history

It does not trust existing ARREARS text for financial correctness.

## Safety model

- Default mode is dry-run (no writes).
- Apply mode needs explicit `--apply --confirm`.
- A JSON report is generated for every run.

## Commands

From `backend` folder:

```bash
npm run reconcile:fees:dry
```

Run for one student only:

```bash
node scripts/reconcile-old-fee-vouchers.js --dry-run --student-id=123
```

Run limited sample batch:

```bash
node scripts/reconcile-old-fee-vouchers.js --dry-run --limit=100
```

Apply to all students:

```bash
npm run reconcile:fees:apply
```

Apply to one student:

```bash
node scripts/reconcile-old-fee-vouchers.js --apply --confirm --student-id=123
```

## Recommended rollout

1. Run dry-run on full dataset.
2. Review the generated report in `backend/reports/`.
3. Run dry-run on a small sample with `--verbose` to inspect voucher-level before/after.
4. Take a full database backup.
5. Run apply mode.
6. Re-run dry-run to confirm no remaining changes.

## Report fields (high level)

- `students_scanned`: number of students processed.
- `students_with_changes`: students needing reconciliation.
- `students_updated`: students successfully updated (apply mode).
- `students_failed`: students that failed update.
- `inferred_payments_added`: auto-settlement payments inserted by the legacy 2-month rule.
- `total_due_before` / `total_due_after`: recalculated due totals.
- `overpayment_preserved`: payment amount preserved when historical payments exceeded all dues.

Per student:

- whether payment allocation changed
- whether ARREARS rows changed
- before/after status counts (PAID, PARTIAL, UNPAID)
- row counts before/after for payments and ARREARS

## Notes

- The script rewrites `fee_payments` rows for the student's vouchers based on deterministic oldest-first allocation.
- The script deletes and rebuilds ARREARS rows for all affected vouchers.
- Historical payment dates are preserved.
