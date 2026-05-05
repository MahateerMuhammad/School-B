-- =========================================
-- MIGRATION 021: College Annual Fee Voucher Support
-- =========================================
-- Adds a voucher_type field to fee_vouchers so that College class students
-- (1st Year / 2nd Year) can have a single YEARLY_COLLEGE voucher instead of
-- monthly vouchers. Adds YEARLY_PACKAGE as a valid fee_voucher_items item_type.
-- =========================================

-- Step 1: Add voucher_type column to fee_vouchers
ALTER TABLE fee_vouchers
  ADD COLUMN IF NOT EXISTS voucher_type VARCHAR(20) NOT NULL DEFAULT 'MONTHLY';

-- Step 2: Add check constraint for allowed voucher types
DO $$
BEGIN
  ALTER TABLE fee_vouchers DROP CONSTRAINT IF EXISTS fee_vouchers_type_check;
END $$;

ALTER TABLE fee_vouchers
  ADD CONSTRAINT fee_vouchers_type_check
  CHECK (voucher_type IN ('MONTHLY', 'YEARLY_COLLEGE'));

-- Step 3: Update fee_voucher_items item_type constraint to include YEARLY_PACKAGE
DO $$
BEGIN
  ALTER TABLE fee_voucher_items
    DROP CONSTRAINT IF EXISTS fee_voucher_items_item_type_check;
END $$;

ALTER TABLE fee_voucher_items
  ADD CONSTRAINT fee_voucher_items_item_type_check
  CHECK (item_type IN (
    'MONTHLY', 'ADMISSION', 'PAPER_FUND', 'TRANSPORT',
    'DISCOUNT', 'ARREARS', 'CUSTOM', 'PROMOTION', 'FINE', 'YEARLY_PACKAGE'
  ));

-- Step 4: Performance indexes
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_type
  ON fee_vouchers(voucher_type);

CREATE INDEX IF NOT EXISTS idx_fee_vouchers_enrollment_type
  ON fee_vouchers(student_class_history_id, voucher_type);
