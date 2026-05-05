-- =========================================
-- MIGRATION: Add Discounts and Due Date Support
-- =========================================
-- This migration adds support for:
-- 1. Due dates on fee vouchers
-- 2. Persistent student discounts per class

-- =========================================
-- ADD DUE DATE TO FEE VOUCHERS
-- =========================================
ALTER TABLE fee_vouchers 
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Set default due date for existing vouchers (10th of the voucher month)
UPDATE fee_vouchers 
SET due_date = DATE_TRUNC('month', month) + INTERVAL '9 days'
WHERE due_date IS NULL;

-- Create index for due date queries (defaulters, overdue reports)
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_due_date ON fee_vouchers(due_date);

-- =========================================
-- STUDENT DISCOUNTS TABLE
-- =========================================
-- Stores persistent discounts per student per class
-- Discounts are applied by admin and remain consistent across monthly vouchers
-- On promotion, discounts may be redefined by admin

CREATE TABLE IF NOT EXISTS student_discounts (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  class_id BIGINT REFERENCES classes(id) ON DELETE RESTRICT,
  discount_type TEXT CHECK (discount_type IN ('PERCENTAGE', 'FLAT')) NOT NULL,
  discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value >= 0),
  reason TEXT,
  applied_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now(),
  -- Ensure one discount per student per class
  UNIQUE (student_id, class_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_discounts_student ON student_discounts(student_id);
CREATE INDEX IF NOT EXISTS idx_student_discounts_class ON student_discounts(class_id);

-- Add table comment
COMMENT ON TABLE student_discounts IS 'Stores persistent discounts for students per class. Applied consistently to monthly vouchers.';

-- =========================================
-- UPDATE FEE VOUCHER ITEMS
-- =========================================
-- Ensure DISCOUNT is a valid item type (already exists in schema)
-- No changes needed - DISCOUNT is already in the CHECK constraint
