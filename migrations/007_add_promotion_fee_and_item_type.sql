-- =========================================
-- MIGRATION: Add Promotion Fee and Enhance Voucher Items
-- =========================================

-- 1. Add promotion_fee to class_fee_structure
ALTER TABLE class_fee_structure 
  ADD COLUMN IF NOT EXISTS promotion_fee NUMERIC(12,2) DEFAULT 0;

-- 2. Update fee_voucher_items check constraint for item_type
-- We drop the existing constraint and add a new one including PROMOTION and FINE
DO $$ 
BEGIN 
    ALTER TABLE fee_voucher_items DROP CONSTRAINT IF EXISTS fee_voucher_items_item_type_check;
END $$;

ALTER TABLE fee_voucher_items 
  ADD CONSTRAINT fee_voucher_items_item_type_check 
  CHECK (item_type IN ('MONTHLY','ADMISSION','PAPER_FUND','TRANSPORT','DISCOUNT','ARREARS','CUSTOM','PROMOTION','FINE'));

-- 3. Update fee_voucher_items check constraint for amount
-- Migration 006 set it to (amount > 0 OR item_type = 'DISCOUNT')
-- We drop and recreate it to ensure PROMOTION, FINE and others are handled correctly.
-- Actually, the 006 constraint (amount > 0 OR item_type = 'DISCOUNT') is broad enough for new types 
-- as long as they are > 0. But just to be explicitly clean:
DO $$ 
BEGIN 
    ALTER TABLE fee_voucher_items DROP CONSTRAINT IF EXISTS fee_voucher_items_amount_check;
END $$;

ALTER TABLE fee_voucher_items 
  ADD CONSTRAINT fee_voucher_items_amount_check 
  CHECK (
    (item_type = 'DISCOUNT' AND amount <= 0) OR 
    (item_type != 'DISCOUNT' AND amount >= 0)
  );
