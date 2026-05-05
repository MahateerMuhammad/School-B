-- Add father_cnic to students for direct profile editing
ALTER TABLE students ADD COLUMN IF NOT EXISTS father_cnic TEXT;

-- Helpful indexes for frequently searched/edited profile fields
CREATE INDEX IF NOT EXISTS idx_students_bay_form ON students(bay_form);
CREATE INDEX IF NOT EXISTS idx_students_date_of_birth ON students(date_of_birth);
CREATE INDEX IF NOT EXISTS idx_students_father_cnic ON students(father_cnic);
