-- Foreign key lookups
CREATE INDEX idx_fee_vouchers_sch ON fee_vouchers(student_class_history_id);
CREATE INDEX idx_fee_items_voucher ON fee_voucher_items(voucher_id);
CREATE INDEX idx_fee_payments_voucher ON fee_payments(voucher_id);
CREATE INDEX idx_salary_payments_voucher ON salary_payments(voucher_id);

-- Date-based reports
CREATE INDEX idx_fee_payments_date ON fee_payments(payment_date);
CREATE INDEX idx_salary_payments_date ON salary_payments(payment_date);
CREATE INDEX idx_expenses_date ON expenses(expense_date);

-- Student queries
CREATE INDEX idx_student_class_history_student ON student_class_history(student_id);
CREATE INDEX idx_students_active ON students(is_active);

-- Salary vouchers
CREATE INDEX idx_salary_vouchers_faculty_month ON salary_vouchers(faculty_id, month);

-- Fee voucher month lookup
CREATE INDEX idx_fee_vouchers_month ON fee_vouchers(month);
