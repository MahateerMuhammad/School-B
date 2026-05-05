-- =========================================
-- DEFAULTERS
-- =========================================
CREATE VIEW v_defaulters AS
SELECT
  s.id AS student_id,
  s.name AS student_name,
  v.id AS voucher_id,
  v.month,
  SUM(i.amount) AS total_fee,
  COALESCE(SUM(p.amount), 0) AS paid_amount,
  SUM(i.amount) - COALESCE(SUM(p.amount), 0) AS due_amount
FROM fee_vouchers v
JOIN student_class_history sch ON sch.id = v.student_class_history_id
JOIN students s ON s.id = sch.student_id
JOIN fee_voucher_items i ON i.voucher_id = v.id
LEFT JOIN fee_payments p ON p.voucher_id = v.id
GROUP BY s.id, s.name, v.id, v.month
HAVING SUM(i.amount) > COALESCE(SUM(p.amount), 0);

-- =========================================
-- DAILY CLOSING
-- =========================================
CREATE VIEW v_daily_closing AS
SELECT
  d.date,
  COALESCE(fees.total_fees_collected, 0) AS fees_collected,
  COALESCE(salaries.total_salary_paid, 0) AS salaries_paid,
  COALESCE(exp.total_expenses, 0) AS other_expenses,
  COALESCE(fees.total_fees_collected, 0)
  - COALESCE(salaries.total_salary_paid, 0)
  - COALESCE(exp.total_expenses, 0) AS net_balance
FROM (
  SELECT DISTINCT payment_date AS date FROM fee_payments
  UNION
  SELECT DISTINCT payment_date FROM salary_payments
  UNION
  SELECT DISTINCT expense_date FROM expenses
) d
LEFT JOIN (
  SELECT payment_date, SUM(amount) AS total_fees_collected
  FROM fee_payments
  GROUP BY payment_date
) fees ON fees.payment_date = d.date
LEFT JOIN (
  SELECT payment_date, SUM(amount) AS total_salary_paid
  FROM salary_payments
  GROUP BY payment_date
) salaries ON salaries.payment_date = d.date
LEFT JOIN (
  SELECT expense_date, SUM(amount) AS total_expenses
  FROM expenses
  GROUP BY expense_date
) exp ON exp.expense_date = d.date;

-- =========================================
-- MONTHLY PROFIT
-- =========================================
CREATE VIEW v_monthly_profit AS
SELECT
  date_trunc('month', d.date)::DATE AS month,
  SUM(d.fees_collected) AS total_fees,
  SUM(d.salaries_paid) AS total_salaries,
  SUM(d.other_expenses) AS total_expenses,
  SUM(d.net_balance) AS profit_or_loss
FROM v_daily_closing d
GROUP BY date_trunc('month', d.date);
