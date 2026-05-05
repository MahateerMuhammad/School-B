-- Migration: Add description field to fee_voucher_items
-- Allows storing custom charge descriptions with CUSTOM fee items

ALTER TABLE fee_voucher_items 
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN fee_voucher_items.description IS 'Description for CUSTOM fee items (e.g., "Library Fee", "Sports Fee")';
