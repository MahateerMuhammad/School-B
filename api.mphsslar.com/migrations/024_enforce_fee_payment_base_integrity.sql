-- Enforce strong payment integrity at the database level.
-- 1) Payment amounts must always be positive.
-- 2) A voucher cannot be paid beyond its base total (excluding ARREARS).
-- 3) Item edits cannot leave a voucher with paid_total > base_total at commit.

ALTER TABLE fee_payments
  DROP CONSTRAINT IF EXISTS chk_fee_payments_amount_positive;

ALTER TABLE fee_payments
  ADD CONSTRAINT chk_fee_payments_amount_positive CHECK (amount > 0);

CREATE OR REPLACE FUNCTION validate_fee_payment_against_base_total()
RETURNS trigger
LANGUAGE plpgsql
AS $fn_validate_fee_payment$
DECLARE
  v_base_total numeric := 0;
  v_other_paid_total numeric := 0;
  v_candidate_paid_total numeric := 0;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN item_type <> 'ARREARS' THEN amount ELSE 0 END), 0)
    INTO v_base_total
  FROM fee_voucher_items
  WHERE voucher_id = NEW.voucher_id;

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(SUM(amount), 0)
      INTO v_other_paid_total
    FROM fee_payments
    WHERE voucher_id = NEW.voucher_id
      AND id <> OLD.id;
  ELSE
    SELECT COALESCE(SUM(amount), 0)
      INTO v_other_paid_total
    FROM fee_payments
    WHERE voucher_id = NEW.voucher_id;
  END IF;

  v_candidate_paid_total := v_other_paid_total + NEW.amount;

  IF v_base_total <= 0 THEN
    RAISE EXCEPTION 'Cannot record payment for voucher % because base total is %', NEW.voucher_id, v_base_total;
  END IF;

  IF v_candidate_paid_total > v_base_total THEN
    RAISE EXCEPTION 'Payment would exceed voucher % base total. Base: %, attempted paid: %', NEW.voucher_id, v_base_total, v_candidate_paid_total;
  END IF;

  RETURN NEW;
END;
$fn_validate_fee_payment$;

DROP TRIGGER IF EXISTS trg_validate_fee_payment_against_base_total ON fee_payments;
CREATE TRIGGER trg_validate_fee_payment_against_base_total
BEFORE INSERT OR UPDATE OF voucher_id, amount
ON fee_payments
FOR EACH ROW
EXECUTE FUNCTION validate_fee_payment_against_base_total();

CREATE OR REPLACE FUNCTION assert_voucher_paid_not_exceed_base_total()
RETURNS trigger
LANGUAGE plpgsql
AS $fn_assert_voucher_integrity$
DECLARE
  v_target_voucher_id integer;
  v_base_total numeric := 0;
  v_paid_total numeric := 0;
BEGIN
  v_target_voucher_id := COALESCE(NEW.voucher_id, OLD.voucher_id);

  SELECT COALESCE(SUM(CASE WHEN item_type <> 'ARREARS' THEN amount ELSE 0 END), 0)
    INTO v_base_total
  FROM fee_voucher_items
  WHERE voucher_id = v_target_voucher_id;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_total
  FROM fee_payments
  WHERE voucher_id = v_target_voucher_id;

  IF v_paid_total > v_base_total THEN
    RAISE EXCEPTION 'Voucher % paid total (%) exceeds base total (%)', v_target_voucher_id, v_paid_total, v_base_total;
  END IF;

  RETURN NULL;
END;
$fn_assert_voucher_integrity$;

DROP TRIGGER IF EXISTS trg_assert_voucher_paid_not_exceed_base_total ON fee_voucher_items;
CREATE CONSTRAINT TRIGGER trg_assert_voucher_paid_not_exceed_base_total
AFTER INSERT OR UPDATE OR DELETE ON fee_voucher_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_voucher_paid_not_exceed_base_total();
