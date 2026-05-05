-- Migration: Add test_reports table
-- Description: Store test report documents (PDF/images) for each class and section
-- Date: 2026-03-01

CREATE TABLE IF NOT EXISTS test_reports (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id BIGINT REFERENCES sections(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf', 'image/jpeg', 'image/png', etc.
  file_size BIGINT,
  uploaded_by BIGINT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_test_reports_class_id ON test_reports(class_id);
CREATE INDEX IF NOT EXISTS idx_test_reports_section_id ON test_reports(section_id);
CREATE INDEX IF NOT EXISTS idx_test_reports_date ON test_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_test_reports_class_section ON test_reports(class_id, section_id);

-- Add comments
COMMENT ON TABLE test_reports IS 'Stores test report documents for classes and sections';
COMMENT ON COLUMN test_reports.report_date IS 'Date of the test/exam';
COMMENT ON COLUMN test_reports.file_path IS 'Path to the uploaded file';
