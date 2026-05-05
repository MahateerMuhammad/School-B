-- Prevent duplicate MONTHLY vouchers for a student in the same calendar month,
-- even when promotions/transfers create multiple enrollments.
--
-- This is concurrency-safe by taking an advisory transaction lock per
-- (student_id, month_key) before duplicate detection.

CREATE OR REPLACE FUNCTION prevent_duplicate_monthly_voucher_per_student()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_student_id BIGINT;
  v_month_start DATE;
  v_lock_key BIGINT;
BEGIN
  IF COALESCE(NEW.voucher_type, 'MONTHLY') <> 'MONTHLY' THEN
    RETURN NEW;
  END IF;

  SELECT sch.student_id
    INTO v_student_id
  FROM student_class_history sch
  WHERE sch.id = NEW.student_class_history_id;

  IF v_student_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_month_start := DATE_TRUNC('month', NEW.month)::date;

  -- Serialize writes for this student-month to avoid concurrent duplicate inserts.
  v_lock_key := hashtextextended(
    format('%s:%s', v_student_id, to_char(v_month_start, 'YYYY-MM')),
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF EXISTS (
    SELECT 1
    FROM fee_vouchers fv
    JOIN student_class_history sch ON sch.id = fv.student_class_history_id
    WHERE sch.student_id = v_student_id
      AND COALESCE(fv.voucher_type, 'MONTHLY') = 'MONTHLY'
      AND DATE_TRUNC('month', fv.month)::date = v_month_start
      AND fv.id <> COALESCE(NEW.id, -1)
  ) THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '23505',
        MESSAGE = format(
          'Monthly voucher already exists for student_id=%s in month=%s',
          v_student_id,
          to_char(v_month_start, 'YYYY-MM')
        );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_monthly_vouchers_per_student ON fee_vouchers;

CREATE TRIGGER trg_prevent_duplicate_monthly_vouchers_per_student
BEFORE INSERT OR UPDATE OF student_class_history_id, month, voucher_type
ON fee_vouchers
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_monthly_voucher_per_student();
