-- Migration: Add individual_monthly_fee to students table
-- This allows each student to have their own monthly fee that can differ from the class fee structure
-- Used for CSV imports where fees are specified per student

ALTER TABLE students ADD COLUMN IF NOT EXISTS individual_monthly_fee DECIMAL(10, 2);

-- Add comment to explain the column
COMMENT ON COLUMN students.individual_monthly_fee IS 'Individual monthly fee for this student. If set, this overrides the class fee structure for monthly vouchers.';

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_students_individual_fee ON students(individual_monthly_fee) WHERE individual_monthly_fee IS NOT NULL;
