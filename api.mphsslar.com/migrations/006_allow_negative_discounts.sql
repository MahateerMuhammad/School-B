-- Fix: Allow negative amounts for discounts
-- Drop the existing check constraint and recreate it to allow negative amounts for DISCOUNT items

ALTER TABLE fee_voucher_items DROP CONSTRAINT IF EXISTS fee_voucher_items_amount_check;

-- Add new constraint: amount must be positive UNLESS it's a DISCOUNT
ALTER TABLE fee_voucher_items ADD CONSTRAINT fee_voucher_items_amount_check 
CHECK (amount > 0 OR item_type = 'DISCOUNT');
