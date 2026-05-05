-- =========================================
-- MIGRATION: Add Discount Description to Student Fee Overrides
-- =========================================
-- Adds discount_description column to student_fee_overrides table
-- This description will be printed on all monthly vouchers for students with discounted fees

-- Add discount_description column
ALTER TABLE student_fee_overrides 
ADD COLUMN IF NOT EXISTS discount_description TEXT;

-- Add column comment
COMMENT ON COLUMN student_fee_overrides.discount_description IS 'Description of the discount (e.g., Staff child discount, Financial hardship). Will be printed on all monthly vouchers for this student.';

-- Add discount_description column to fee_vouchers table to store it with each voucher
ALTER TABLE fee_vouchers 
ADD COLUMN IF NOT EXISTS discount_description TEXT;

-- Add column comment
COMMENT ON COLUMN fee_vouchers.discount_description IS 'Discount description copied from student_fee_overrides at voucher generation time. Printed on voucher receipts.';
