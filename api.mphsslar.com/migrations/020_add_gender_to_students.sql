-- Migration: Add gender field to students table
-- This enables tracking student gender information

ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('Male', 'Female', 'Other', NULL));

-- Add comment for documentation
COMMENT ON COLUMN students.gender IS 'Student gender: Male, Female, or Other';
