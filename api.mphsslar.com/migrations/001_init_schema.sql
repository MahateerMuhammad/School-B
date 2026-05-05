-- =========================================
-- USERS
-- =========================================
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('ADMIN','ACCOUNTANT')) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================================
-- CLASSES
-- =========================================
CREATE TABLE classes (
  id BIGSERIAL PRIMARY KEY,
  class_type TEXT CHECK (class_type IN ('SCHOOL','COLLEGE')) NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================================
-- CLASS FEE STRUCTURE
-- =========================================
CREATE TABLE class_fee_structure (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT REFERENCES classes(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  admission_fee NUMERIC(12,2) DEFAULT 0,
  monthly_fee NUMERIC(12,2) DEFAULT 0,
  paper_fund NUMERIC(12,2) DEFAULT 0,
  UNIQUE (class_id, effective_from)
);

-- =========================================
-- SECTIONS
-- =========================================
CREATE TABLE sections (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT REFERENCES classes(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  UNIQUE (class_id, name)
);

-- =========================================
-- STUDENTS
-- =========================================
CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  roll_no TEXT UNIQUE,
  email TEXT UNIQUE,
  phone TEXT,
  address TEXT,
  date_of_birth DATE,
  bay_form TEXT,
  caste TEXT,
  previous_school TEXT,
  admission_date DATE DEFAULT CURRENT_DATE,
  is_expelled BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================================
-- GUARDIANS
-- =========================================
CREATE TABLE guardians (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cnic TEXT,
  phone TEXT,
  occupation TEXT
);

CREATE TABLE student_guardians (
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  guardian_id BIGINT REFERENCES guardians(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  PRIMARY KEY (student_id, guardian_id)
);

-- =========================================
-- STUDENT CLASS HISTORY
-- =========================================
CREATE TABLE student_class_history (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE RESTRICT,
  class_id BIGINT REFERENCES classes(id) ON DELETE RESTRICT,
  section_id BIGINT REFERENCES sections(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE
);

-- =========================================
-- STUDENT DOCUMENTS
-- =========================================
CREATE TABLE student_documents (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  document_type VARCHAR(50),
  file_name VARCHAR(255),
  file_url TEXT,
  file_size BIGINT,
  mime_type VARCHAR(100),
  description TEXT,
  uploaded_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_student_documents_student_id ON student_documents(student_id);
CREATE INDEX idx_student_documents_type ON student_documents(document_type);

COMMENT ON TABLE student_documents IS 'Stores student documents uploaded to Cloudflare R2 storage';

-- =========================================
-- FEE VOUCHERS
-- =========================================
CREATE TABLE fee_vouchers (
  id BIGSERIAL PRIMARY KEY,
  student_class_history_id BIGINT REFERENCES student_class_history(id) ON DELETE RESTRICT,
  month DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (student_class_history_id, month)
);

-- =========================================
-- FEE VOUCHER ITEMS
-- =========================================
CREATE TABLE fee_voucher_items (
  id BIGSERIAL PRIMARY KEY,
  voucher_id BIGINT REFERENCES fee_vouchers(id) ON DELETE CASCADE,
  item_type TEXT CHECK (
    item_type IN ('MONTHLY','ADMISSION','PAPER_FUND','TRANSPORT','DISCOUNT','ARREARS','CUSTOM')
  ) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0)
);

-- =========================================
-- FEE PAYMENTS
-- =========================================
CREATE TABLE fee_payments (
  id BIGSERIAL PRIMARY KEY,
  voucher_id BIGINT REFERENCES fee_vouchers(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================================
-- FACULTY
-- =========================================
CREATE TABLE faculty (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  father_or_husband TEXT,
  cnic TEXT,
  phone TEXT,
  gender TEXT,
  role TEXT,
  subject TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================================
-- SALARY STRUCTURE
-- =========================================
CREATE TABLE salary_structure (
  id BIGSERIAL PRIMARY KEY,
  faculty_id BIGINT REFERENCES faculty(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  base_salary NUMERIC(12,2) NOT NULL,
  UNIQUE (faculty_id, effective_from)
);

-- =========================================
-- SALARY VOUCHERS
-- =========================================
CREATE TABLE salary_vouchers (
  id BIGSERIAL PRIMARY KEY,
  faculty_id BIGINT REFERENCES faculty(id) ON DELETE RESTRICT,
  month DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (faculty_id, month)
);

-- =========================================
-- SALARY ADJUSTMENTS
-- =========================================
CREATE TABLE salary_adjustments (
  id BIGSERIAL PRIMARY KEY,
  voucher_id BIGINT REFERENCES salary_vouchers(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('BONUS','ADVANCE')) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  calc_type TEXT CHECK (calc_type IN ('FLAT','PERCENTAGE')) NOT NULL
);

-- =========================================
-- SALARY PAYMENTS
-- =========================================
CREATE TABLE salary_payments (
  id BIGSERIAL PRIMARY KEY,
  voucher_id BIGINT REFERENCES salary_vouchers(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL
);

-- =========================================
-- EXPENSES
-- =========================================
CREATE TABLE expenses (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);-- =========================================
-- USERS
-- =========================================
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('ADMIN','ACCOUNTANT')) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================================
-- CLASSES
-- =========================================
CREATE TABLE classes (
  id BIGSERIAL PRIMARY KEY,
  class_type TEXT CHECK (class_type IN ('SCHOOL','COLLEGE')) NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================================
-- CLASS FEE STRUCTURE
-- =========================================
CREATE TABLE class_fee_structure (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT REFERENCES classes(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  admission_fee NUMERIC(12,2) DEFAULT 0,
  monthly_fee NUMERIC(12,2) DEFAULT 0,
  paper_fund NUMERIC(12,2) DEFAULT 0,
  UNIQUE (class_id, effective_from)
);

-- =========================================
-- SECTIONS
-- =========================================
CREATE TABLE sections (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT REFERENCES classes(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  UNIQUE (class_id, name)
);

-- =========================================
-- STUDENTS
-- =========================================
CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  roll_no TEXT UNIQUE,
  email TEXT UNIQUE,
  phone TEXT,
  address TEXT,
  date_of_birth DATE,
  bay_form TEXT,
  caste TEXT,
  previous_school TEXT,
  admission_date DATE DEFAULT CURRENT_DATE,
  is_expelled BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================================
-- GUARDIANS
-- =========================================
CREATE TABLE guardians (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cnic TEXT,
  phone TEXT,
  occupation TEXT
);

CREATE TABLE student_guardians (
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  guardian_id BIGINT REFERENCES guardians(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  PRIMARY KEY (student_id, guardian_id)
);

-- =========================================
-- STUDENT CLASS HISTORY
-- =========================================
CREATE TABLE student_class_history (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE RESTRICT,
  class_id BIGINT REFERENCES classes(id) ON DELETE RESTRICT,
  section_id BIGINT REFERENCES sections(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE
);

-- =========================================
-- STUDENT DOCUMENTS
-- =========================================
CREATE TABLE student_documents (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  document_type VARCHAR(50),
  file_name VARCHAR(255),
  file_url TEXT,
  file_size BIGINT,
  mime_type VARCHAR(100),
  description TEXT,
  uploaded_at TIMESTAMP DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_student_documents_student_id ON student_documents(student_id);
CREATE INDEX idx_student_documents_type ON student_documents(document_type);

-- Add table comment
COMMENT ON TABLE student_documents IS 'Stores student documents uploaded to Cloudflare R2 storage';

-- =========================================
-- FEE VOUCHERS
-- =========================================
CREATE TABLE fee_vouchers (
  id BIGSERIAL PRIMARY KEY,
  student_class_history_id BIGINT REFERENCES student_class_history(id) ON DELETE RESTRICT,
  month DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (student_class_history_id, month)
);

-- =========================================
-- FEE VOUCHER ITEMS
-- =========================================
CREATE TABLE fee_voucher_items (
  id BIGSERIAL PRIMARY KEY,
  voucher_id BIGINT REFERENCES fee_vouchers(id) ON DELETE CASCADE,
  item_type TEXT CHECK (
    item_type IN ('MONTHLY','ADMISSION','PAPER_FUND','TRANSPORT','DISCOUNT','ARREARS','CUSTOM')
  ) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0)
);

-- =========================================
-- FEE PAYMENTS
-- =========================================
CREATE TABLE fee_payments (
  id BIGSERIAL PRIMARY KEY,
  voucher_id BIGINT REFERENCES fee_vouchers(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================================
-- FACULTY
-- =========================================
CREATE TABLE faculty (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  father_or_husband TEXT,
  cnic TEXT,
  phone TEXT,
  gender TEXT,
  role TEXT,
  subject TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================================
-- SALARY STRUCTURE
-- =========================================
CREATE TABLE salary_structure (
  id BIGSERIAL PRIMARY KEY,
  faculty_id BIGINT REFERENCES faculty(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  base_salary NUMERIC(12,2) NOT NULL,
  UNIQUE (faculty_id, effective_from)
);

-- =========================================
-- SALARY VOUCHERS
-- =========================================
CREATE TABLE salary_vouchers (
  id BIGSERIAL PRIMARY KEY,
  faculty_id BIGINT REFERENCES faculty(id) ON DELETE RESTRICT,
  month DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (faculty_id, month)
);

-- =========================================
-- SALARY ADJUSTMENTS
-- =========================================
CREATE TABLE salary_adjustments (
  id BIGSERIAL PRIMARY KEY,
  voucher_id BIGINT REFERENCES salary_vouchers(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('BONUS','ADVANCE')) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  calc_type TEXT CHECK (calc_type IN ('FLAT','PERCENTAGE')) NOT NULL
);

-- =========================================
-- SALARY PAYMENTS
-- =========================================
CREATE TABLE salary_payments (
  id BIGSERIAL PRIMARY KEY,
  voucher_id BIGINT REFERENCES salary_vouchers(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL
);

-- =========================================
-- EXPENSES
-- =========================================
CREATE TABLE expenses (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
