-- Migration: Update student_documents table for R2 integration
-- This migration extends the student_documents table to support Cloudflare R2 storage

-- Add new columns if they don't exist
ALTER TABLE student_documents 
  ADD COLUMN IF NOT EXISTS document_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Rename file_type to legacy_file_type if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'student_documents' AND column_name = 'file_type'
  ) THEN
    ALTER TABLE student_documents RENAME COLUMN file_type TO legacy_file_type;
  END IF;
END $$;

-- Rename file_path to legacy_file_path if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'student_documents' AND column_name = 'file_path'
  ) THEN
    ALTER TABLE student_documents RENAME COLUMN file_path TO legacy_file_path;
  END IF;
END $$;

-- Make legacy columns nullable
ALTER TABLE student_documents 
  ALTER COLUMN legacy_file_type DROP NOT NULL,
  ALTER COLUMN legacy_file_path DROP NOT NULL;

-- Create index on document_type for filtering
CREATE INDEX IF NOT EXISTS idx_student_documents_type ON student_documents(document_type);

-- Create index on student_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_student_documents_student_id ON student_documents(student_id);

-- Add comment
COMMENT ON TABLE student_documents IS 'Stores student documents uploaded to Cloudflare R2 storage';
