-- Migration: Add is_fee_free field to students table
-- Description: Allows marking students as fee-free (no voucher generation)
-- Date: 2026-02-28

-- Add is_fee_free column to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_fee_free BOOLEAN DEFAULT false;

-- Create index for faster queries on fee-free students
CREATE INDEX IF NOT EXISTS idx_students_is_fee_free ON students(is_fee_free);

-- Add comment
COMMENT ON COLUMN students.is_fee_free IS 'Indicates if student is marked as fee-free (no vouchers generated)';
