-- Migration: Add bulk import flag to students table
-- This flag tracks students imported via CSV/bulk import
-- For these students, vouchers should only include monthly fee (no admission fee)

ALTER TABLE students ADD COLUMN IF NOT EXISTS is_bulk_imported BOOLEAN DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN students.is_bulk_imported IS 'True if student was imported via CSV/bulk import. These students only get monthly fee in vouchers.';
