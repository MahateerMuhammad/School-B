-- Promotion module: history, undo, ex-classes archive support

-- 1) Allow section archival without breaking historical references
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sections_class_archived
ON sections(class_id, is_archived);

COMMENT ON COLUMN sections.is_archived IS 'Archived sections are hidden from active section lists but kept for historical records.';

-- 2) Promotion runs (header)
CREATE TABLE IF NOT EXISTS promotion_runs (
  id BIGSERIAL PRIMARY KEY,
  promotion_type TEXT NOT NULL CHECK (promotion_type IN ('FULL_SCHOOL', 'FULL_COLLEGE', 'CLASS')),
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'UNDONE')),
  promotion_date DATE NOT NULL DEFAULT CURRENT_DATE,
  promoted_at TIMESTAMP NOT NULL DEFAULT now(),
  undone_at TIMESTAMP NULL,
  initiated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_promotion_runs_type_date
ON promotion_runs(promotion_type, promotion_date DESC, promoted_at DESC);

-- 3) Per-student movement details for safe undo
CREATE TABLE IF NOT EXISTS promotion_run_students (
  id BIGSERIAL PRIMARY KEY,
  promotion_run_id BIGINT NOT NULL REFERENCES promotion_runs(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  old_enrollment_id BIGINT NOT NULL REFERENCES student_class_history(id) ON DELETE RESTRICT,
  new_enrollment_id BIGINT NULL REFERENCES student_class_history(id) ON DELETE RESTRICT,
  action_type TEXT NOT NULL CHECK (action_type IN ('PROMOTED', 'ARCHIVED')),
  old_class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  old_section_id BIGINT NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  new_class_id BIGINT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  new_section_id BIGINT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  previous_individual_monthly_fee NUMERIC(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotion_run_students_run
ON promotion_run_students(promotion_run_id);

CREATE INDEX IF NOT EXISTS idx_promotion_run_students_student
ON promotion_run_students(student_id);

-- 4) Archived passout batches (Ex Classes)
CREATE TABLE IF NOT EXISTS ex_class_batches (
  id BIGSERIAL PRIMARY KEY,
  promotion_run_id BIGINT NOT NULL REFERENCES promotion_runs(id) ON DELETE CASCADE,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  section_id BIGINT NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  class_name TEXT NOT NULL,
  section_name TEXT NOT NULL,
  batch_month SMALLINT NOT NULL CHECK (batch_month >= 1 AND batch_month <= 12),
  batch_year SMALLINT NOT NULL CHECK (batch_year >= 2000),
  locked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ex_class_batches_period
ON ex_class_batches(batch_year DESC, batch_month DESC, class_name, section_name);

CREATE TABLE IF NOT EXISTS ex_class_students (
  id BIGSERIAL PRIMARY KEY,
  ex_class_batch_id BIGINT NOT NULL REFERENCES ex_class_batches(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  student_name TEXT NOT NULL,
  father_name TEXT NULL,
  roll_no TEXT NULL,
  phone TEXT NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (ex_class_batch_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_ex_class_students_batch
ON ex_class_students(ex_class_batch_id);
