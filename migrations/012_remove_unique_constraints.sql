-- Remove unique constraints on students table to allow duplicate entries
DROP INDEX IF EXISTS idx_students_email;
DROP INDEX IF EXISTS idx_students_roll_no;
