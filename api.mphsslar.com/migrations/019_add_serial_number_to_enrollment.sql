-- Migration: Add serial number field to student_class_history table
-- This enables automatic assignment of serial numbers within sections

-- Add serial_number column to track position within section
ALTER TABLE student_class_history ADD COLUMN IF NOT EXISTS serial_number INTEGER;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_student_class_history_serial ON student_class_history(section_id, serial_number);

-- Add constraint to ensure serial numbers are unique within a section for active enrollments
-- This prevents duplicate serial numbers in the same section
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_serial_per_section 
ON student_class_history(section_id, serial_number) 
WHERE end_date IS NULL;

-- Update existing records to assign serial numbers based on enrollment date
-- This gives existing students sequential serial numbers
WITH numbered_rows AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY section_id ORDER BY start_date, id) as new_serial
  FROM student_class_history
  WHERE end_date IS NULL
)
UPDATE student_class_history 
SET serial_number = numbered_rows.new_serial
FROM numbered_rows
WHERE student_class_history.id = numbered_rows.id
  AND student_class_history.serial_number IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN student_class_history.serial_number IS 'Sequential number within section, auto-assigned on enrollment';