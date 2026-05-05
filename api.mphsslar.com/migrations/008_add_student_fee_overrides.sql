-- =========================================
-- MIGRATION: Add Student Fee Overrides
-- =========================================
-- This migration adds support for per-student fee overrides
-- Allows customizing admission fee and monthly fee for individual students

-- =========================================
-- STUDENT FEE OVERRIDES TABLE
-- =========================================
-- Stores per-student fee overrides that take precedence over class fee structure
-- When a voucher is generated, these overrides are checked first

CREATE TABLE IF NOT EXISTS student_fee_overrides (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  class_id BIGINT REFERENCES classes(id) ON DELETE RESTRICT,
  admission_fee NUMERIC(12,2), -- NULL means use class default
  monthly_fee NUMERIC(12,2),   -- NULL means use class default
  paper_fund NUMERIC(12,2),    -- NULL means use class default
  reason TEXT,
  applied_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now(),
  -- Ensure one override per student per class
  UNIQUE (student_id, class_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_fee_overrides_student ON student_fee_overrides(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fee_overrides_class ON student_fee_overrides(class_id);

-- Add table comment
COMMENT ON TABLE student_fee_overrides IS 'Stores per-student fee overrides. When generating vouchers, these values take precedence over class fee structure.';

-- Add column comments
COMMENT ON COLUMN student_fee_overrides.admission_fee IS 'Override admission fee for this student in this class. NULL means use class default.';
COMMENT ON COLUMN student_fee_overrides.monthly_fee IS 'Override monthly fee for this student in this class. NULL means use class default.';
COMMENT ON COLUMN student_fee_overrides.paper_fund IS 'Override paper fund for this student in this class. NULL means use class default.';
COMMENT ON COLUMN student_fee_overrides.reason IS 'Reason for fee override (e.g., "Special agreement", "Scholarship", "Sibling discount")';
