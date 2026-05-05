# Duplicate Monthly Voucher Fix (Promotion/Transfer)

## Root Cause

When generating monthly vouchers, duplicate checks were performed per enrollment (`student_class_history_id`) or removed in some generation paths.

After promotion/transfer, one student can have:

- old enrollment voucher for month M
- new enrollment voucher for month M

Both vouchers then contribute to outstanding totals, which inflates dues and corrupts displayed pending amounts.

## Code Fix Applied

Controller updates now enforce one MONTHLY voucher per student per calendar month across all enrollments:

- `backend/src/controllers/vouchers.controller.js`
- `backend/api.mphsslar.com/src/controllers/vouchers.controller.js`

Updated paths:

- single generate (`POST /api/vouchers/generate`)
- bulk generate (`POST /api/vouchers/generate-bulk`)
- bulk preview (`POST /api/vouchers/preview-bulk`)
- bulk PDF generate (`POST /api/vouchers/generate-bulk-pdf`)

Behavior after fix:

- if a monthly voucher already exists for the same student and month, system blocks (single) or skips (bulk/preview/pdf)
- old+new class same-month duplicate creation is prevented

## Existing Data: Detection Query

Run this in Postgres to find students with duplicate MONTHLY vouchers in the same month:

```sql
WITH monthly_vouchers AS (
  SELECT
    fv.id AS voucher_id,
    sch.student_id,
    DATE_TRUNC('month', fv.month)::date AS month_key,
    sch.class_id,
    sch.section_id,
    COALESCE(fv.voucher_type, 'MONTHLY') AS voucher_type,
    fv.created_at
  FROM fee_vouchers fv
  JOIN student_class_history sch ON sch.id = fv.student_class_history_id
  WHERE COALESCE(fv.voucher_type, 'MONTHLY') = 'MONTHLY'
), grouped AS (
  SELECT
    student_id,
    month_key,
    COUNT(*) AS voucher_count,
    ARRAY_AGG(voucher_id ORDER BY created_at DESC, voucher_id DESC) AS voucher_ids_desc
  FROM monthly_vouchers
  GROUP BY student_id, month_key
  HAVING COUNT(*) > 1
)
SELECT *
FROM grouped
ORDER BY month_key DESC, student_id ASC;
```

## Existing Data: Safe Cleanup Guidance

Recommended manual cleanup policy per duplicate group:

1. Keep the latest voucher (highest `created_at`/id) for that student+month.
2. For older duplicate vouchers:
   - if no payments exist, delete voucher
   - if payments exist, do not hard delete blindly; first reallocate payments intentionally, then remove/adjust voucher items
3. After cleanup for a student, run dues resync by generating/updating a voucher or using your reconciliation tooling.

If needed, use existing script patterns in `backend/scripts/reconcile-old-fee-vouchers.js` for structured historical repair.
