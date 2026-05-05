const pool = require('../config/db');
const ApiResponse = require('../utils/response');

/**
 * Analytics Controller
 * Handles dashboard statistics and trend analysis
 */
class AnalyticsController {
  /**
   * Dashboard overview statistics
   * GET /api/analytics/dashboard
   */
  async dashboard(req, res, next) {
    const client = await pool.connect();
    try {
      // Student statistics
      const studentStats = await client.query(`
        SELECT 
          COUNT(*) as total_students,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_students,
          COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_students,
          COUNT(CASE WHEN is_expelled = true THEN 1 END) as expelled_students
        FROM students
      `);

      // Faculty statistics
      const facultyStats = await client.query(`
        SELECT 
          COUNT(*) as total_faculty,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_faculty,
          COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_faculty
        FROM faculty
      `);

      // Fee statistics (current month)
      const currentMonth = new Date();
      currentMonth.setDate(1);
      const nextMonth = new Date(currentMonth);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const feeStats = await client.query(`
        WITH voucher_totals AS (
          SELECT 
            v.id,
            SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END) as voucher_total,
            COALESCE((SELECT SUM(amount) FROM fee_payments WHERE voucher_id = v.id), 0) as paid_amount
          FROM fee_vouchers v
          LEFT JOIN fee_voucher_items vi ON v.id = vi.voucher_id
          WHERE v.month >= $1 AND v.month < $2
          GROUP BY v.id
        )
        SELECT 
          COUNT(*) as total_vouchers,
          COUNT(CASE WHEN paid_amount >= voucher_total THEN 1 END) as paid_vouchers,
          COALESCE(SUM(voucher_total), 0) as total_fee_generated,
          COALESCE(SUM(paid_amount), 0) as total_collected
        FROM voucher_totals
      `, [currentMonth, nextMonth]);

      // Salary statistics (current month) - calculate net_salary dynamically
      const salaryStats = await client.query(`
        WITH voucher_calculations AS (
          SELECT 
            sv.id,
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
            COALESCE((SELECT SUM(amount) FROM salary_payments WHERE voucher_id = sv.id), 0) as paid_amount
          FROM salary_vouchers sv
          JOIN faculty f ON sv.faculty_id = f.id
          JOIN LATERAL (
            SELECT base_salary
            FROM salary_structure
            WHERE faculty_id = f.id AND effective_from <= sv.month
            ORDER BY effective_from DESC
            LIMIT 1
          ) ss ON true
          WHERE sv.month >= $1 AND sv.month < $2
        )
        SELECT 
          COUNT(*) as total_vouchers,
          COUNT(CASE WHEN paid_amount >= net_salary THEN 1 END) as paid_vouchers,
          COALESCE(SUM(net_salary), 0) as total_salary_generated,
          COALESCE(SUM(paid_amount), 0) as total_paid
        FROM voucher_calculations
      `, [currentMonth, nextMonth]);

      // Today's collections
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayCollections = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM fee_payments
        WHERE payment_date >= $1 AND payment_date < $2
      `, [today, tomorrow]);

      // Today's expenses
      const todayExpenses = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE expense_date >= $1 AND expense_date < $2
      `, [today, tomorrow]);

      // Recent activity (last 5 transactions)
      const recentActivity = await client.query(`
        (SELECT 
          'fee_payment' as type,
          fp.amount,
          fp.payment_date as date,
          s.name as related_name,
          'Student' as related_type
         FROM fee_payments fp
         JOIN fee_vouchers v ON fp.voucher_id = v.id
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         JOIN students s ON sch.student_id = s.id
         ORDER BY fp.payment_date DESC
         LIMIT 5)
        UNION ALL
        (SELECT 
          'salary_payment' as type,
          sp.amount,
          sp.payment_date as date,
          f.name as related_name,
          'Faculty' as related_type
         FROM salary_payments sp
         JOIN salary_vouchers sv ON sp.voucher_id = sv.id
         JOIN faculty f ON sv.faculty_id = f.id
         ORDER BY sp.payment_date DESC
         LIMIT 5)
        UNION ALL
        (SELECT 
          'expense' as type,
          amount,
          expense_date as date,
          title as related_name,
          'Expense' as related_type
         FROM expenses
         ORDER BY expense_date DESC
         LIMIT 5)
        ORDER BY date DESC
        LIMIT 10
      `);

      return ApiResponse.success(res, {
        students: studentStats.rows[0],
        faculty: facultyStats.rows[0],
        fees: {
          current_month: {
            total_vouchers: parseInt(feeStats.rows[0].total_vouchers),
            paid_vouchers: parseInt(feeStats.rows[0].paid_vouchers),
            collection_rate: feeStats.rows[0].total_fee_generated > 0 
              ? ((parseFloat(feeStats.rows[0].total_collected) / parseFloat(feeStats.rows[0].total_fee_generated)) * 100).toFixed(2)
              : 0,
            total_generated: parseFloat(feeStats.rows[0].total_fee_generated),
            total_collected: parseFloat(feeStats.rows[0].total_collected),
            pending: Math.max(
              parseFloat(feeStats.rows[0].total_fee_generated) - parseFloat(feeStats.rows[0].total_collected),
              0
            )
          }
        },
        salaries: {
          current_month: {
            total_vouchers: parseInt(salaryStats.rows[0].total_vouchers),
            paid_vouchers: parseInt(salaryStats.rows[0].paid_vouchers),
            payment_rate: salaryStats.rows[0].total_salary_generated > 0
              ? ((parseFloat(salaryStats.rows[0].total_paid) / parseFloat(salaryStats.rows[0].total_salary_generated)) * 100).toFixed(2)
              : 0,
            total_generated: parseFloat(salaryStats.rows[0].total_salary_generated),
            total_paid: parseFloat(salaryStats.rows[0].total_paid),
            pending: Math.max(
              parseFloat(salaryStats.rows[0].total_salary_generated) - parseFloat(salaryStats.rows[0].total_paid),
              0
            )
          }
        },
        today: {
          collections: parseFloat(todayCollections.rows[0].total),
          expenses: parseFloat(todayExpenses.rows[0].total),
          net: parseFloat(todayCollections.rows[0].total) - parseFloat(todayExpenses.rows[0].total)
        },
        recent_activity: recentActivity.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Revenue trends (last 6 months)
   * GET /api/analytics/revenue-trends
   */
  async revenueTrends(req, res, next) {
    const client = await pool.connect();
    try {
      const { months = 6 } = req.query;

      const result = await client.query(`
        WITH months AS (
          SELECT 
            DATE_TRUNC('month', CURRENT_DATE - (n || ' month')::interval) as month
          FROM generate_series(0, $1 - 1) n
        )
        SELECT 
          TO_CHAR(m.month, 'YYYY-MM') as month,
          COALESCE(SUM(fp.amount), 0) as fee_collections,
          COALESCE((SELECT SUM(sp.amount) 
                    FROM salary_payments sp 
                    WHERE DATE_TRUNC('month', sp.payment_date) = m.month), 0) as salary_payments,
          COALESCE((SELECT SUM(e.amount) 
                    FROM expenses e 
                    WHERE DATE_TRUNC('month', e.expense_date) = m.month), 0) as expenses,
          COALESCE(SUM(fp.amount), 0) - 
          COALESCE((SELECT SUM(sp.amount) 
                    FROM salary_payments sp 
                    WHERE DATE_TRUNC('month', sp.payment_date) = m.month), 0) -
          COALESCE((SELECT SUM(e.amount) 
                    FROM expenses e 
                    WHERE DATE_TRUNC('month', e.expense_date) = m.month), 0) as net_profit
        FROM months m
        LEFT JOIN fee_payments fp ON DATE_TRUNC('month', fp.payment_date) = m.month
        GROUP BY m.month
        ORDER BY m.month DESC
      `, [parseInt(months)]);

      return ApiResponse.success(res, result.rows);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Student enrollment trends
   * GET /api/analytics/enrollment-trends
   */
  async enrollmentTrends(req, res, next) {
    const client = await pool.connect();
    try {
      // Monthly enrollment counts
      const result = await client.query(`
        WITH months AS (
          SELECT 
            DATE_TRUNC('month', CURRENT_DATE - (n || ' month')::interval) as month
          FROM generate_series(0, 11) n
        )
        SELECT 
          TO_CHAR(m.month, 'YYYY-MM') as month,
          COUNT(DISTINCT s.id) as total_students,
          COUNT(DISTINCT CASE WHEN s.is_active = true THEN s.id END) as active_students,
          COUNT(DISTINCT CASE 
            WHEN sch.start_date >= m.month 
            AND sch.start_date < m.month + interval '1 month'
            THEN s.id 
          END) as new_enrollments
        FROM months m
        CROSS JOIN students s
        LEFT JOIN student_class_history sch ON s.id = sch.student_id
        WHERE s.created_at <= m.month + interval '1 month'
        GROUP BY m.month
        ORDER BY m.month DESC
      `);

      // Class-wise distribution
      const classDistribution = await client.query(`
        SELECT 
          c.name as class_name,
          COUNT(DISTINCT sch.student_id) as student_count
        FROM classes c
        LEFT JOIN student_class_history sch ON c.id = sch.class_id AND sch.end_date IS NULL
        GROUP BY c.id, c.name
        ORDER BY c.name
      `);

      return ApiResponse.success(res, {
        trends: result.rows,
        class_distribution: classDistribution.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Class-wise fee collection analysis
   * GET /api/analytics/class-collection
   * Returns real classes with aggregated fee collection data
   */
  async classCollection(req, res, next) {
    const client = await pool.connect();
    try {
      // Get all classes with aggregated fee collection data
      const result = await client.query(`
        WITH voucher_data AS (
          SELECT 
            sch.class_id,
            v.id as voucher_id,
            SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END) as voucher_amount,
            v.status,
            COALESCE(
              (SELECT SUM(fp.amount) 
               FROM fee_payments fp 
               WHERE fp.voucher_id = v.id), 
              0
            ) as paid_amount
          FROM student_class_history sch
          LEFT JOIN fee_vouchers v ON sch.id = v.student_class_history_id
          LEFT JOIN fee_voucher_items vi ON v.id = vi.voucher_id
          WHERE sch.end_date IS NULL
          GROUP BY sch.class_id, v.id, v.status
        )
        SELECT 
          c.id as class_id,
          c.name as class_name,
          COUNT(DISTINCT vd.voucher_id) FILTER (WHERE vd.voucher_id IS NOT NULL) as total_vouchers,
          COALESCE(SUM(vd.voucher_amount), 0) as total_generated,
          COALESCE(SUM(vd.paid_amount), 0) as total_collected,
          COALESCE(SUM(GREATEST(vd.voucher_amount - vd.paid_amount, 0)), 0) as total_pending,
          CASE 
            WHEN SUM(vd.voucher_amount) > 0 
            THEN ROUND((SUM(vd.paid_amount) / SUM(vd.voucher_amount) * 100)::numeric, 1)
            ELSE 0 
          END as collection_rate
        FROM classes c
        LEFT JOIN voucher_data vd ON c.id = vd.class_id
        GROUP BY c.id, c.name
        HAVING c.id IS NOT NULL
        ORDER BY c.id
      `);

      return ApiResponse.success(res, result.rows);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Faculty & salary statistics
   * GET /api/analytics/faculty-stats
   */
  async facultyStats(req, res, next) {
    const client = await pool.connect();
    try {
      // Role-wise distribution (changed from designation to role)
      const designationStats = await client.query(`
        SELECT 
          role,
          COUNT(*) as count,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_count,
          ROUND(AVG((SELECT base_salary 
                     FROM salary_structure ss 
                     WHERE ss.faculty_id = f.id 
                     ORDER BY effective_from DESC 
                     LIMIT 1))::numeric, 2) as avg_salary
        FROM faculty f
        GROUP BY role
        ORDER BY count DESC
      `);

      // Salary distribution ranges
      const salaryDistribution = await client.query(`
        WITH latest_salaries AS (
          SELECT DISTINCT ON (faculty_id)
            faculty_id,
            base_salary
          FROM salary_structure
          ORDER BY faculty_id, effective_from DESC
        ),
        salary_ranges AS (
          SELECT 
            CASE 
              WHEN base_salary < 20000 THEN '< 20k'
              WHEN base_salary < 30000 THEN '20k-30k'
              WHEN base_salary < 40000 THEN '30k-40k'
              WHEN base_salary < 50000 THEN '40k-50k'
              ELSE '50k+'
            END as salary_range,
            CASE 
              WHEN base_salary < 20000 THEN 1
              WHEN base_salary < 30000 THEN 2
              WHEN base_salary < 40000 THEN 3
              WHEN base_salary < 50000 THEN 4
              ELSE 5
            END as range_order
          FROM latest_salaries
        )
        SELECT 
          salary_range,
          COUNT(*) as count
        FROM salary_ranges
        GROUP BY salary_range, range_order
        ORDER BY range_order
      `);

      // Monthly salary expense trend
      const salaryTrend = await client.query(`
        WITH voucher_salaries AS (
          SELECT 
            sv.month,
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
                     WHERE voucher_id = sv.id AND type = 'ADVANCE'), 0) as net_salary
          FROM salary_vouchers sv
          JOIN faculty f ON sv.faculty_id = f.id
          JOIN LATERAL (
            SELECT base_salary
            FROM salary_structure
            WHERE faculty_id = f.id AND effective_from <= sv.month
            ORDER BY effective_from DESC
            LIMIT 1
          ) ss ON true
          WHERE sv.month >= CURRENT_DATE - interval '6 months'
        )
        SELECT 
          TO_CHAR(month, 'YYYY-MM') as month,
          COUNT(*) as voucher_count,
          SUM(net_salary) as total_salary
        FROM voucher_salaries
        GROUP BY month
        ORDER BY month DESC
      `);

      return ApiResponse.success(res, {
        designation_stats: designationStats.rows,
        salary_distribution: salaryDistribution.rows,
        salary_trend: salaryTrend.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Expense analysis
   * GET /api/analytics/expense-analysis
   */
  async expenseAnalysis(req, res, next) {
    const client = await pool.connect();
    try {
      // Monthly expense trend
      const monthlyTrend = await client.query(`
        SELECT 
          TO_CHAR(DATE_TRUNC('month', expense_date), 'YYYY-MM') as month,
          COUNT(*) as expense_count,
          SUM(amount) as total_amount
        FROM expenses
        WHERE expense_date >= CURRENT_DATE - interval '6 months'
        GROUP BY DATE_TRUNC('month', expense_date)
        ORDER BY month DESC
      `);

      // Compare with salaries
      const comparison = await client.query(`
        WITH monthly_data AS (
          SELECT 
            DATE_TRUNC('month', CURRENT_DATE - (n || ' month')::interval) as month
          FROM generate_series(0, 5) n
        )
        SELECT 
          TO_CHAR(m.month, 'YYYY-MM') as month,
          COALESCE((SELECT SUM(amount) FROM expenses e WHERE DATE_TRUNC('month', e.expense_date) = m.month), 0) as other_expenses,
          COALESCE((SELECT SUM(amount) FROM salary_payments sp WHERE DATE_TRUNC('month', sp.payment_date) = m.month), 0) as salary_expenses,
          COALESCE((SELECT SUM(amount) FROM expenses e WHERE DATE_TRUNC('month', e.expense_date) = m.month), 0) +
          COALESCE((SELECT SUM(amount) FROM salary_payments sp WHERE DATE_TRUNC('month', sp.payment_date) = m.month), 0) as total_expenses
        FROM monthly_data m
        ORDER BY m.month DESC
      `);

      return ApiResponse.success(res, {
        monthly_trend: monthlyTrend.rows,
        expense_comparison: comparison.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Financial Summary for Accounts Overview
   * GET /api/analytics/financial-summary
   * Query: startDate, endDate
   */
  async financialSummary(req, res, next) {
    const client = await pool.connect();
    try {
      let { startDate, endDate } = req.query;
      
      // Default to current month if no dates provided
      if (!startDate || !endDate) {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      }

      // 1. Total Collection (fee payments in date range)
      const collectionResult = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total_collection
        FROM fee_payments
        WHERE payment_date >= $1 AND payment_date <= $2
      `, [startDate, endDate]);

      // 2. Total Expenses (expenses + salary payments in date range)
      const expenseResult = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM expenses
        WHERE expense_date >= $1 AND expense_date <= $2
      `, [startDate, endDate]);

      const salaryExpenseResult = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total_salary_expenses
        FROM salary_payments
        WHERE payment_date >= $1 AND payment_date <= $2
      `, [startDate, endDate]);

      const totalCollection = parseFloat(collectionResult.rows[0].total_collection);
      const totalExpenses = parseFloat(expenseResult.rows[0].total_expenses) + parseFloat(salaryExpenseResult.rows[0].total_salary_expenses);
      const netBalance = totalCollection - totalExpenses;

      // 3. Monthly breakdown for bar chart (income vs expenses)
      const monthlyBreakdown = await client.query(`
        WITH date_range AS (
          SELECT generate_series(
            DATE_TRUNC('month', $1::date),
            DATE_TRUNC('month', $2::date),
            '1 month'::interval
          ) as month
        )
        SELECT 
          TO_CHAR(dr.month, 'Mon YYYY') as label,
          TO_CHAR(dr.month, 'YYYY-MM') as month_key,
          COALESCE((
            SELECT SUM(fp.amount)
            FROM fee_payments fp
            WHERE DATE_TRUNC('month', fp.payment_date) = dr.month
              AND fp.payment_date >= $1 AND fp.payment_date <= $2
          ), 0) as income,
          COALESCE((
            SELECT SUM(e.amount)
            FROM expenses e
            WHERE DATE_TRUNC('month', e.expense_date) = dr.month
              AND e.expense_date >= $1 AND e.expense_date <= $2
          ), 0) + COALESCE((
            SELECT SUM(sp.amount)
            FROM salary_payments sp
            WHERE DATE_TRUNC('month', sp.payment_date) = dr.month
              AND sp.payment_date >= $1 AND sp.payment_date <= $2
          ), 0) as expenses
        FROM date_range dr
        ORDER BY dr.month ASC
      `, [startDate, endDate]);

      // 4. Expense distribution by title (for pie chart)
      const expenseDistribution = await client.query(`
        (
          SELECT title as category, SUM(amount) as total
          FROM expenses
          WHERE expense_date >= $1 AND expense_date <= $2
          GROUP BY title
        )
        UNION ALL
        (
          SELECT 'Salaries' as category, COALESCE(SUM(amount), 0) as total
          FROM salary_payments
          WHERE payment_date >= $1 AND payment_date <= $2
        )
        ORDER BY total DESC
      `, [startDate, endDate]);

      // 5. Collection matrix - month-by-month expected vs actual
      const collectionMatrix = await client.query(`
        WITH date_range AS (
          SELECT generate_series(
            DATE_TRUNC('month', $1::date),
            DATE_TRUNC('month', $2::date),
            '1 month'::interval
          ) as month
        )
        SELECT 
          TO_CHAR(dr.month, 'Mon YYYY') as label,
          TO_CHAR(dr.month, 'YYYY-MM') as month_key,
          COALESCE((
            SELECT SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END)
            FROM fee_voucher_items vi
            JOIN fee_vouchers v ON vi.voucher_id = v.id
            WHERE DATE_TRUNC('month', v.month) = dr.month
          ), 0) as expected,
          COALESCE((
            SELECT SUM(fp.amount)
            FROM fee_payments fp
            WHERE DATE_TRUNC('month', fp.payment_date) = dr.month
              AND fp.payment_date >= $1 AND fp.payment_date <= $2
          ), 0) as actual,
          CASE 
            WHEN COALESCE((
              SELECT SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END)
              FROM fee_voucher_items vi
              JOIN fee_vouchers v ON vi.voucher_id = v.id
              WHERE DATE_TRUNC('month', v.month) = dr.month
            ), 0) > 0 
            THEN ROUND(
              COALESCE((
                SELECT SUM(fp.amount)
                FROM fee_payments fp
                WHERE DATE_TRUNC('month', fp.payment_date) = dr.month
                  AND fp.payment_date >= $1 AND fp.payment_date <= $2
              ), 0) * 100.0 / 
              COALESCE((
                SELECT SUM(CASE WHEN vi.item_type <> 'ARREARS' THEN vi.amount ELSE 0 END)
                FROM fee_voucher_items vi
                JOIN fee_vouchers v ON vi.voucher_id = v.id
                WHERE DATE_TRUNC('month', v.month) = dr.month
              ), 1), 1
            )
            ELSE 0
          END as collection_rate
        FROM date_range dr
        ORDER BY dr.month ASC
      `, [startDate, endDate]);

      return ApiResponse.success(res, {
        summary: {
          total_collection: totalCollection,
          total_expenses: totalExpenses,
          net_balance: netBalance,
        },
        monthly_breakdown: monthlyBreakdown.rows,
        expense_distribution: expenseDistribution.rows.filter(r => parseFloat(r.total) > 0),
        collection_matrix: collectionMatrix.rows,
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Performance metrics
   * GET /api/analytics/performance
   */
  async performanceMetrics(req, res, next) {
    const client = await pool.connect();
    try {
      // Calculate various performance metrics
      const currentMonth = new Date();
      currentMonth.setDate(1);
      const lastMonth = new Date(currentMonth);
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      // Current month metrics
      const currentMetrics = await client.query(`
        SELECT 
          (SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE DATE_TRUNC('month', payment_date) = $1) as fee_collections,
          (SELECT COALESCE(SUM(amount), 0) FROM salary_payments WHERE DATE_TRUNC('month', payment_date) = $1) as salary_payments,
          (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE DATE_TRUNC('month', expense_date) = $1) as other_expenses,
          (SELECT COUNT(*) FROM students WHERE is_active = true) as active_students,
          (SELECT COUNT(*) FROM faculty WHERE is_active = true) as active_faculty
      `, [currentMonth]);

      // Last month metrics
      const lastMetrics = await client.query(`
        SELECT 
          (SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE DATE_TRUNC('month', payment_date) = $1) as fee_collections,
          (SELECT COALESCE(SUM(amount), 0) FROM salary_payments WHERE DATE_TRUNC('month', payment_date) = $1) as salary_payments,
          (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE DATE_TRUNC('month', expense_date) = $1) as other_expenses
      `, [lastMonth]);

      const current = currentMetrics.rows[0];
      const last = lastMetrics.rows[0];

      // Calculate growth percentages
      const feeGrowth = last.fee_collections > 0 
        ? (((current.fee_collections - last.fee_collections) / last.fee_collections) * 100).toFixed(2)
        : 0;

      const expenseGrowth = last.salary_payments + last.other_expenses > 0
        ? (((parseFloat(current.salary_payments) + parseFloat(current.other_expenses) - parseFloat(last.salary_payments) - parseFloat(last.other_expenses)) / (parseFloat(last.salary_payments) + parseFloat(last.other_expenses))) * 100).toFixed(2)
        : 0;

      return ApiResponse.success(res, {
        current_month: {
          revenue: parseFloat(current.fee_collections),
          expenses: parseFloat(current.salary_payments) + parseFloat(current.other_expenses),
          profit: parseFloat(current.fee_collections) - parseFloat(current.salary_payments) - parseFloat(current.other_expenses),
          active_students: parseInt(current.active_students),
          active_faculty: parseInt(current.active_faculty)
        },
        last_month: {
          revenue: parseFloat(last.fee_collections),
          expenses: parseFloat(last.salary_payments) + parseFloat(last.other_expenses),
          profit: parseFloat(last.fee_collections) - parseFloat(last.salary_payments) - parseFloat(last.other_expenses)
        },
        growth: {
          fee_collections: parseFloat(feeGrowth),
          expenses: parseFloat(expenseGrowth)
        }
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new AnalyticsController();
