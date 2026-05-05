-- Add email field to students table for bulk import feature
ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email ON students(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_roll_no ON students(roll_no) WHERE roll_no IS NOT NULL;