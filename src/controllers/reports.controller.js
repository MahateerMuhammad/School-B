const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const DateUtil = require('../utils/date');
const Joi = require('joi');

/**
 * Reports Controller
 * Handles comprehensive financial and operational reports
 */
class ReportsController {
  constructor() {
    this.dailyClosing = this.dailyClosing.bind(this);
    this.monthlyProfit = this.monthlyProfit.bind(this);
    this.feeCollection = this.feeCollection.bind(this);
    this.defaultersAging = this.defaultersAging.bind(this);
    this.salaryDisbursement = this.salaryDisbursement.bind(this);
    this.customReport = this.customReport.bind(this);
  }

  /**
   * Daily closing report
   * GET /api/reports/daily-closing
   */
  async dailyClosing(req, res, next) {
    const client = await pool.connect();
    try {
      const { date } = req.query;

      // Validate input
      const schema = Joi.object({
        date: Joi.date().required()
      });

      const { error } = schema.validate({ date });
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      const reportDate = new Date(date);
      const dayStart = DateUtil.getDayStart(reportDate);
      const dayEnd = DateUtil.getDayEnd(reportDate);

      // Fee collections for the day
      const feeCollections = await client.query(
        `SELECT 
          COUNT(*) as payment_count,
          COALESCE(SUM(amount), 0) as total_collected
         FROM fee_payments
         WHERE payment_date >= $1 AND payment_date <= $2`,
        [dayStart, dayEnd]
      );

      // Salary payments for the day
      const salaryPayments = await client.query(
        `SELECT 
          COUNT(*) as payment_count,
          COALESCE(SUM(amount), 0) as total_paid
         FROM salary_payments
         WHERE payment_date >= $1 AND payment_date <= $2`,
        [dayStart, dayEnd]
      );

      // Expenses for the day
      const expenses = await client.query(
        `SELECT 
          COUNT(*) as expense_count,
          COALESCE(SUM(amount), 0) as total_expenses
         FROM expenses
         WHERE expense_date >= $1 AND expense_date <= $2`,
        [dayStart, dayEnd]
      );

      // Calculate net
      const feeTotal = parseFloat(feeCollections.rows[0].total_collected);
      const salaryTotal = parseFloat(salaryPayments.rows[0].total_paid);
      const expenseTotal = parseFloat(expenses.rows[0].total_expenses);
      const netAmount = feeTotal - salaryTotal - expenseTotal;

      // Get detailed transactions
      const feeTransactions = await client.query(
        `SELECT 
          fp.id,
          fp.amount,
          fp.payment_date,
          s.name as student_name,
          s.roll_no,
          c.name as class_name
         FROM fee_payments fp
         JOIN fee_vouchers v ON fp.voucher_id = v.id
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         JOIN students s ON sch.student_id = s.id
         JOIN classes c ON sch.class_id = c.id
         WHERE fp.payment_date >= $1 AND fp.payment_date <= $2
         ORDER BY fp.payment_date DESC`,
        [dayStart, dayEnd]
      );

      const salaryTransactions = await client.query(
        `SELECT 
          sp.id,
          sp.amount,
          sp.payment_date,
          f.name as faculty_name,
          f.role
         FROM salary_payments sp
         JOIN salary_vouchers sv ON sp.voucher_id = sv.id
         JOIN faculty f ON sv.faculty_id = f.id
         WHERE sp.payment_date >= $1 AND sp.payment_date <= $2
         ORDER BY sp.payment_date DESC`,
        [dayStart, dayEnd]
      );

      const expenseTransactions = await client.query(
        `SELECT 
          id,
          title,
          amount,
          expense_date
         FROM expenses
         WHERE expense_date >= $1 AND expense_date <= $2
         ORDER BY expense_date DESC`,
        [dayStart, dayEnd]
      );

      return ApiResponse.success(res, {
        date: DateUtil.formatDate(reportDate),
        summary: {
          fee_collections: {
            count: parseInt(feeCollections.rows[0].payment_count),
            total: feeTotal
          },
          salary_payments: {
            count: parseInt(salaryPayments.rows[0].payment_count),
            total: salaryTotal
          },
          expenses: {
            count: parseInt(expenses.rows[0].expense_count),
            total: expenseTotal
          },
          net_amount: netAmount
        },
        transactions: {
          fee_collections: feeTransactions.rows,
          salary_payments: salaryTransactions.rows,
          expenses: expenseTransactions.rows
        }
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Monthly profit/loss report
   * GET /api/reports/monthly-profit
   */
  async monthlyProfit(req, res, next) {
    const client = await pool.connect();
    try {
      const { month } = req.query;

      // Validate input
      const schema = Joi.object({
        month: Joi.date().required()
      });

      const { error } = schema.validate({ month });
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      const reportMonth = new Date(month);
      const monthStart = DateUtil.getMonthStart(reportMonth);
      const monthEnd = DateUtil.getMonthEnd(reportMonth);

      // Fee collections for the month
      const feeCollections = await client.query(
        `SELECT 
          COUNT(DISTINCT fp.id) as payment_count,
          COUNT(DISTINCT v.student_class_history_id) as students_paid,
          COALESCE(SUM(fp.amount), 0) as total_collected
         FROM fee_payments fp
         JOIN fee_vouchers v ON fp.voucher_id = v.id
         WHERE fp.payment_date >= $1 AND fp.payment_date <= $2`,
        [monthStart, monthEnd]
      );

      // Salary payments for the month
      const salaryPayments = await client.query(
        `SELECT 
          COUNT(DISTINCT sp.id) as payment_count,
          COUNT(DISTINCT sv.faculty_id) as faculty_paid,
          COALESCE(SUM(sp.amount), 0) as total_paid
         FROM salary_payments sp
         JOIN salary_vouchers sv ON sp.voucher_id = sv.id
         WHERE sp.payment_date >= $1 AND sp.payment_date <= $2`,
        [monthStart, monthEnd]
      );

      // Expenses for the month
      const expenses = await client.query(
        `SELECT 
          COUNT(*) as expense_count,
          COALESCE(SUM(amount), 0) as total_expenses
         FROM expenses
         WHERE expense_date >= $1 AND expense_date <= $2`,
        [monthStart, monthEnd]
      );

      // Calculate totals
      const revenue = parseFloat(feeCollections.rows[0].total_collected);
      const salaryExpense = parseFloat(salaryPayments.rows[0].total_paid);
      const otherExpenses = parseFloat(expenses.rows[0].total_expenses);
      const totalExpenses = salaryExpense + otherExpenses;
      const profit = revenue - totalExpenses;

      // Get class-wise collection breakdown
      const classwiseCollection = await client.query(
        `SELECT 
          c.id as class_id,
          c.name as class_name,
          COUNT(DISTINCT sch.student_id) as students_paid,
          COALESCE(SUM(fp.amount), 0) as total_collected
         FROM fee_payments fp
         JOIN fee_vouchers v ON fp.voucher_id = v.id
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         JOIN classes c ON sch.class_id = c.id
         WHERE fp.payment_date >= $1 AND fp.payment_date <= $2
         GROUP BY c.id, c.name
         ORDER BY total_collected DESC`,
        [monthStart, monthEnd]
      );

      // Get expense breakdown by date
      const expenseBreakdown = await client.query(
        `SELECT 
          DATE(expense_date) as date,
          COUNT(*) as count,
          SUM(amount) as total
         FROM expenses
         WHERE expense_date >= $1 AND expense_date <= $2
         GROUP BY DATE(expense_date)
         ORDER BY date`,
        [monthStart, monthEnd]
      );

      return ApiResponse.success(res, {
        month: DateUtil.formatDate(reportMonth, 'yyyy-MM'),
        summary: {
          revenue: {
            fee_collections: revenue,
            total: revenue
          },
          expenses: {
            salaries: salaryExpense,
            other: otherExpenses,
            total: totalExpenses
          },
          profit: profit,
          profit_margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : 0
        },
        statistics: {
          fee_payments: parseInt(feeCollections.rows[0].payment_count),
          students_paid: parseInt(feeCollections.rows[0].students_paid),
          salary_payments: parseInt(salaryPayments.rows[0].payment_count),
          faculty_paid: parseInt(salaryPayments.rows[0].faculty_paid),
          expense_count: parseInt(expenses.rows[0].expense_count)
        },
        breakdown: {
          classwise_collection: classwiseCollection.rows,
          expense_timeline: expenseBreakdown.rows
        }
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Fee collection report
   * GET /api/reports/fee-collection
   */
  async feeCollection(req, res, next) {
    const client = await pool.connect();
    try {
      const { from_date, to_date, class_id, section_id } = req.query;

      // Validate input
      const schema = Joi.object({
        from_date: Joi.date().required(),
        to_date: Joi.date().required(),
        class_id: Joi.number().integer().optional(),
        section_id: Joi.number().integer().optional()
      });

      const { error } = schema.validate(req.query);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      let query = `
        WITH voucher_payments AS (
          SELECT 
            v.id as voucher_id,
            SUM(vi.amount) as voucher_total,
            COALESCE((SELECT SUM(amount) FROM fee_payments WHERE voucher_id = v.id AND payment_date >= $1 AND payment_date <= $2), 0) as paid_amount
          FROM fee_vouchers v
          LEFT JOIN fee_voucher_items vi ON v.id = vi.voucher_id
          GROUP BY v.id
        )
        SELECT 
          c.id as class_id,
          c.name as class_name,
          sec.id as section_id,
          sec.name as section_name,
          COUNT(DISTINCT sch.student_id) as total_students,
          COUNT(DISTINCT v.id) as total_vouchers,
          COUNT(DISTINCT CASE WHEN vp.paid_amount >= vp.voucher_total THEN v.id END) as paid_vouchers,
          COUNT(DISTINCT CASE WHEN vp.paid_amount = 0 OR vp.paid_amount IS NULL THEN v.id END) as unpaid_vouchers,
          COALESCE(SUM(vp.voucher_total), 0) as total_fee_generated,
          COALESCE(SUM(vp.paid_amount), 0) as total_collected,
          COALESCE(SUM(vp.voucher_total - vp.paid_amount), 0) as total_pending
        FROM student_class_history sch
        JOIN classes c ON sch.class_id = c.id
        JOIN sections sec ON sch.section_id = sec.id
        LEFT JOIN fee_vouchers v ON sch.id = v.student_class_history_id
        LEFT JOIN voucher_payments vp ON v.id = vp.voucher_id
        WHERE 1=1
      `;

      const params = [from_date, to_date];
      let paramCount = 3;

      if (class_id) {
        query += ` AND c.id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      if (section_id) {
        query += ` AND sec.id = $${paramCount}`;
        params.push(section_id);
        paramCount++;
      }

      query += ` 
        GROUP BY c.id, c.name, sec.id, sec.name
        ORDER BY c.name, sec.name
      `;

      const result = await client.query(query, params);

      // Calculate overall summary
      const summary = result.rows.reduce((acc, row) => ({
        total_students: acc.total_students + parseInt(row.total_students),
        total_vouchers: acc.total_vouchers + parseInt(row.total_vouchers),
        paid_vouchers: acc.paid_vouchers + parseInt(row.paid_vouchers),
        unpaid_vouchers: acc.unpaid_vouchers + parseInt(row.unpaid_vouchers),
        total_fee_generated: acc.total_fee_generated + parseFloat(row.total_fee_generated),
        total_collected: acc.total_collected + parseFloat(row.total_collected),
        total_pending: acc.total_pending + parseFloat(row.total_pending)
      }), {
        total_students: 0,
        total_vouchers: 0,
        paid_vouchers: 0,
        unpaid_vouchers: 0,
        total_fee_generated: 0,
        total_collected: 0,
        total_pending: 0
      });

      summary.collection_rate = summary.total_fee_generated > 0 
        ? ((summary.total_collected / summary.total_fee_generated) * 100).toFixed(2)
        : 0;

      return ApiResponse.success(res, {
        period: {
          from: DateUtil.formatDate(from_date),
          to: DateUtil.formatDate(to_date)
        },
        summary,
        breakdown: result.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Defaulters aging analysis
   * GET /api/reports/defaulters-aging
   */
  async defaultersAging(req, res, next) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          s.id as student_id,
          s.name as student_name,
          s.roll_no,
          s.phone,
          c.name as class_name,
          sec.name as section_name,
          v.month as oldest_unpaid_month,
          COUNT(v.id) as unpaid_voucher_count,
          COALESCE(SUM(vi.amount) - SUM(p.amount), SUM(vi.amount), 0) as total_due,
          EXTRACT(MONTH FROM AGE(CURRENT_DATE, MIN(v.month))) as months_overdue
        FROM students s
        JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
        JOIN classes c ON sch.class_id = c.id
        JOIN sections sec ON sch.section_id = sec.id
        JOIN fee_vouchers v ON sch.id = v.student_class_history_id
        JOIN fee_voucher_items vi ON v.id = vi.voucher_id
        LEFT JOIN fee_payments p ON v.id = p.voucher_id
        WHERE s.is_active = true
        GROUP BY s.id, s.name, s.roll_no, s.phone, c.name, sec.name, v.month
        HAVING SUM(vi.amount) > COALESCE(SUM(p.amount), 0)
        ORDER BY months_overdue DESC, total_due DESC
      `);

      // Categorize by aging
      const aging = {
        '0-1_months': [],
        '1-3_months': [],
        '3-6_months': [],
        '6_plus_months': []
      };

      result.rows.forEach(row => {
        const months = parseInt(row.months_overdue);
        if (months <= 1) {
          aging['0-1_months'].push(row);
        } else if (months <= 3) {
          aging['1-3_months'].push(row);
        } else if (months <= 6) {
          aging['3-6_months'].push(row);
        } else {
          aging['6_plus_months'].push(row);
        }
      });

      // Calculate summary
      const summary = {
        total_defaulters: result.rows.length,
        total_due_amount: result.rows.reduce((sum, row) => sum + parseFloat(row.total_due), 0),
        categories: {
          '0-1_months': {
            count: aging['0-1_months'].length,
            total_due: aging['0-1_months'].reduce((sum, row) => sum + parseFloat(row.total_due), 0)
          },
          '1-3_months': {
            count: aging['1-3_months'].length,
            total_due: aging['1-3_months'].reduce((sum, row) => sum + parseFloat(row.total_due), 0)
          },
          '3-6_months': {
            count: aging['3-6_months'].length,
            total_due: aging['3-6_months'].reduce((sum, row) => sum + parseFloat(row.total_due), 0)
          },
          '6_plus_months': {
            count: aging['6_plus_months'].length,
            total_due: aging['6_plus_months'].reduce((sum, row) => sum + parseFloat(row.total_due), 0)
          }
        }
      };

      return ApiResponse.success(res, {
        summary,
        aging
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Salary disbursement report
   * GET /api/reports/salary-disbursement
   */
  async salaryDisbursement(req, res, next) {
    const client = await pool.connect();
    try {
      const { from_date, to_date, role } = req.query;

      // Validate input (changed designation to role)
      const schema = Joi.object({
        from_date: Joi.date().required(),
        to_date: Joi.date().required(),
        role: Joi.string().optional()
      });

      const { error } = schema.validate(req.query);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      let query = `
        WITH voucher_details AS (
          SELECT 
            sv.id as voucher_id,
            sv.faculty_id,
            ss.base_salary +
            COALESCE((SELECT SUM(CASE WHEN calc_type = 'FLAT' THEN amount
                                     WHEN calc_type = 'PERCENTAGE' THEN (amount / 100 * ss.base_salary)
                                END)
                     FROM salary_adjustments
                     WHERE voucher_id = sv.id AND type = 'BONUS'), 0) -
            COALESCE((SELECT SUM(CASE WHEN calc_type = 'FLAT' THEN amount
                                     WHEN calc_type = 'PERCENTAGE' THEN (amount / 100 * ss.base_salary)
                                END)
                     FROM salary_adjustments
                     WHERE voucher_id = sv.id AND type = 'ADVANCE'), 0) as net_salary,
            COALESCE((SELECT SUM(amount) FROM salary_payments WHERE voucher_id = sv.id AND payment_date >= $1 AND payment_date <= $2), 0) as paid_amount
          FROM salary_vouchers sv
          JOIN faculty f ON sv.faculty_id = f.id
          JOIN LATERAL (
            SELECT base_salary
            FROM salary_structure
            WHERE faculty_id = f.id AND effective_from <= sv.month
            ORDER BY effective_from DESC
            LIMIT 1
          ) ss ON true
        )
        SELECT 
          f.id as faculty_id,
          f.name as faculty_name,
          f.role,
          f.cnic,
          COUNT(vd.voucher_id) as total_vouchers,
          COUNT(CASE WHEN vd.paid_amount >= vd.net_salary THEN 1 END) as paid_vouchers,
          COUNT(CASE WHEN vd.paid_amount = 0 THEN 1 END) as unpaid_vouchers,
          COALESCE(SUM(vd.net_salary), 0) as total_salary_generated,
          COALESCE(SUM(vd.paid_amount), 0) as total_paid,
          COALESCE(SUM(vd.net_salary - vd.paid_amount), 0) as total_pending
        FROM faculty f
        LEFT JOIN voucher_details vd ON f.id = vd.faculty_id
        WHERE f.is_active = true
      `;

      const params = [from_date, to_date];
      let paramCount = 3;

      if (role) {
        query += ` AND f.role ILIKE $${paramCount}`;
        params.push(`%${role}%`);
        paramCount++;
      }

      query += ` 
        GROUP BY f.id, f.name, f.role, f.cnic
        ORDER BY total_paid DESC
      `;

      const result = await client.query(query, params);

      // Calculate summary
      const summary = result.rows.reduce((acc, row) => ({
        total_faculty: acc.total_faculty + 1,
        total_vouchers: acc.total_vouchers + parseInt(row.total_vouchers),
        paid_vouchers: acc.paid_vouchers + parseInt(row.paid_vouchers),
        unpaid_vouchers: acc.unpaid_vouchers + parseInt(row.unpaid_vouchers),
        total_salary_generated: acc.total_salary_generated + parseFloat(row.total_salary_generated),
        total_paid: acc.total_paid + parseFloat(row.total_paid),
        total_pending: acc.total_pending + parseFloat(row.total_pending)
      }), {
        total_faculty: 0,
        total_vouchers: 0,
        paid_vouchers: 0,
        unpaid_vouchers: 0,
        total_salary_generated: 0,
        total_paid: 0,
        total_pending: 0
      });

      return ApiResponse.success(res, {
        period: {
          from: DateUtil.formatDate(from_date),
          to: DateUtil.formatDate(to_date)
        },
        summary,
        faculty: result.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Custom date range report (comprehensive)
   * GET /api/reports/custom
   */
  async customReport(req, res, next) {
    const client = await pool.connect();
    try {
      const { from_date, to_date } = req.query;

      // Validate input
      const schema = Joi.object({
        from_date: Joi.date().required(),
        to_date: Joi.date().required()
      });

      const { error } = schema.validate(req.query);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Revenue
      const revenue = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as total 
         FROM fee_payments 
         WHERE payment_date >= $1 AND payment_date <= $2`,
        [from_date, to_date]
      );

      // Expenses
      const salaryExpense = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as total 
         FROM salary_payments 
         WHERE payment_date >= $1 AND payment_date <= $2`,
        [from_date, to_date]
      );

      const otherExpenses = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as total 
         FROM expenses 
         WHERE expense_date >= $1 AND expense_date <= $2`,
        [from_date, to_date]
      );

      // Student statistics
      const studentStats = await client.query(
        `SELECT 
          COUNT(*) as total_students,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_students,
          COUNT(CASE WHEN is_expelled = true THEN 1 END) as expelled_students
         FROM students`
      );

      // Faculty statistics
      const facultyStats = await client.query(
        `SELECT 
          COUNT(*) as total_faculty,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_faculty
         FROM faculty`
      );

      // Calculate totals
      const totalRevenue = parseFloat(revenue.rows[0].total);
      const totalSalary = parseFloat(salaryExpense.rows[0].total);
      const totalOtherExpenses = parseFloat(otherExpenses.rows[0].total);
      const totalExpenses = totalSalary + totalOtherExpenses;
      const netProfit = totalRevenue - totalExpenses;

      return ApiResponse.success(res, {
        period: {
          from: DateUtil.formatDate(from_date),
          to: DateUtil.formatDate(to_date),
          days: Math.ceil((new Date(to_date) - new Date(from_date)) / (1000 * 60 * 60 * 24))
        },
        financial: {
          revenue: totalRevenue,
          expenses: {
            salaries: totalSalary,
            other: totalOtherExpenses,
            total: totalExpenses
          },
          net_profit: netProfit,
          profit_margin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0
        },
        student_statistics: {
          total: parseInt(studentStats.rows[0].total_students),
          active: parseInt(studentStats.rows[0].active_students),
          expelled: parseInt(studentStats.rows[0].expelled_students)
        },
        faculty_statistics: {
          total: parseInt(facultyStats.rows[0].total_faculty),
          active: parseInt(facultyStats.rows[0].active_faculty)
        }
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new ReportsController();
