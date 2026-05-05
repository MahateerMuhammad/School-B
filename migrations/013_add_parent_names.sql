-- Migration: Add father_name and mother_name columns to students table
-- This supports the CSV bulk import format with Father Name as a core field

ALTER TABLE students ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS mother_name TEXT;

-- Add index for faster searches
CREATE INDEX IF NOT EXISTS idx_students_father_name ON students(father_name);
