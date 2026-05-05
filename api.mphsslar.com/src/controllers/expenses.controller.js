const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Expenses Controller
 * Handles expense tracking for school operations
 */
class ExpensesController {
  /**
   * Create new expense
   * POST /api/expenses
   */
  async create(req, res, next) {
    const client = await pool.connect();
    try {
      const { title, amount, expense_date } = req.body;

      // Validate input
      const schema = Joi.object({
        title: Joi.string().required(),
        amount: Joi.number().positive().required(),
        expense_date: Joi.date().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Insert expense
      const result = await client.query(
        `INSERT INTO expenses (title, amount, expense_date)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [title, amount, expense_date]
      );

      return ApiResponse.created(res, result.rows[0], 'Expense created successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get expense by ID
   * GET /api/expenses/:id
   */
  async getById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'SELECT * FROM expenses WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Expense not found', 404);
      }

      return ApiResponse.success(res, result.rows[0]);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List expenses with filters
   * GET /api/expenses
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const {
        from_date,
        to_date,
        search,
        min_amount,
        max_amount,
        page = 1,
        limit = 50
      } = req.query;

      let query = 'SELECT * FROM expenses WHERE 1=1';
      const params = [];
      let paramCount = 1;

      // Date range filter
      if (from_date) {
        query += ` AND expense_date >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        query += ` AND expense_date <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      // Search by title
      if (search) {
        query += ` AND title ILIKE $${paramCount}`;
        params.push(`%${search}%`);
        paramCount++;
      }

      // Amount range filter
      if (min_amount) {
        query += ` AND amount >= $${paramCount}`;
        params.push(min_amount);
        paramCount++;
      }

      if (max_amount) {
        query += ` AND amount <= $${paramCount}`;
        params.push(max_amount);
        paramCount++;
      }

      // Count total records
      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Add pagination and ordering
      query += ` ORDER BY expense_date DESC, created_at DESC`;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);

      return ApiResponse.paginated(
        res,
        result.rows,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Expenses retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update expense
   * PUT /api/expenses/:id
   */
  async update(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const updates = req.body;

      // Validate input
      const schema = Joi.object({
        title: Joi.string().optional(),
        amount: Joi.number().positive().optional(),
        expense_date: Joi.date().optional()
      });

      const { error } = schema.validate(updates);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Remove fields that shouldn't be updated
      delete updates.id;
      delete updates.created_at;

      const fields = Object.keys(updates);
      const values = Object.values(updates);

      if (fields.length === 0) {
        return ApiResponse.error(res, 'No fields to update', 400);
      }

      // Check if expense exists
      const existCheck = await client.query(
        'SELECT id FROM expenses WHERE id = $1',
        [id]
      );

      if (existCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Expense not found', 404);
      }

      // Build update query
      const setClause = fields.map((field, index) =>
        `${field} = $${index + 1}`
      ).join(', ');

      values.push(id);

      const result = await client.query(
        `UPDATE expenses SET ${setClause} WHERE id = $${values.length} RETURNING *`,
        values
      );

      return ApiResponse.success(res, result.rows[0], 'Expense updated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete expense (Admin only)
   * DELETE /api/expenses/:id
   */
  async delete(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'DELETE FROM expenses WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Expense not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Expense deleted successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get expenses summary/statistics
   * GET /api/expenses/summary
   */
  async getSummary(req, res, next) {
    const client = await pool.connect();
    try {
      const { from_date, to_date } = req.query;

      let query = `
        SELECT 
          COUNT(*) as total_expenses,
          SUM(amount) as total_amount,
          AVG(amount) as average_amount,
          MIN(amount) as min_amount,
          MAX(amount) as max_amount,
          MIN(expense_date) as earliest_date,
          MAX(expense_date) as latest_date
        FROM expenses
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (from_date) {
        query += ` AND expense_date >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        query += ` AND expense_date <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      const result = await client.query(query, params);

      // Get monthly breakdown
      let monthlyQuery = `
        SELECT 
          DATE_TRUNC('month', expense_date) as month,
          COUNT(*) as count,
          SUM(amount) as total
        FROM expenses
        WHERE 1=1
      `;

      if (from_date) {
        monthlyQuery += ` AND expense_date >= $1`;
      }
      if (to_date) {
        const idx = from_date ? 2 : 1;
        monthlyQuery += ` AND expense_date <= $${idx}`;
      }

      monthlyQuery += ` GROUP BY DATE_TRUNC('month', expense_date) ORDER BY month DESC LIMIT 12`;

      const monthlyResult = await client.query(monthlyQuery, params);

      return ApiResponse.success(res, {
        summary: result.rows[0],
        monthly_breakdown: monthlyResult.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get expenses by date range with daily totals
   * GET /api/expenses/daily
   */
  async getDailyExpenses(req, res, next) {
    const client = await pool.connect();
    try {
      const { from_date, to_date } = req.query;

      if (!from_date || !to_date) {
        return ApiResponse.error(res, 'from_date and to_date are required', 400);
      }

      const result = await client.query(
        `SELECT 
          expense_date,
          COUNT(*) as count,
          SUM(amount) as total,
          json_agg(json_build_object(
            'id', id,
            'title', title,
            'amount', amount
          )) as expenses
         FROM expenses
         WHERE expense_date >= $1 AND expense_date <= $2
         GROUP BY expense_date
         ORDER BY expense_date DESC`,
        [from_date, to_date]
      );

      return ApiResponse.success(res, result.rows);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get top expenses
   * GET /api/expenses/top
   */
  async getTopExpenses(req, res, next) {
    const client = await pool.connect();
    try {
      const { limit = 10, from_date, to_date } = req.query;

      let query = 'SELECT * FROM expenses WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (from_date) {
        query += ` AND expense_date >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        query += ` AND expense_date <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      query += ` ORDER BY amount DESC LIMIT $${paramCount}`;
      params.push(limit);

      const result = await client.query(query, params);

      return ApiResponse.success(res, result.rows);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Bulk create expenses
   * POST /api/expenses/bulk
   */
  async bulkCreate(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { expenses } = req.body;

      // Validate input
      const schema = Joi.object({
        expenses: Joi.array().items(
          Joi.object({
            title: Joi.string().required(),
            amount: Joi.number().positive().required(),
            expense_date: Joi.date().required()
          })
        ).min(1).required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      const results = {
        created: [],
        failed: []
      };

      for (const expense of expenses) {
        try {
          const result = await client.query(
            `INSERT INTO expenses (title, amount, expense_date)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [expense.title, expense.amount, expense.expense_date]
          );

          results.created.push(result.rows[0]);
        } catch (itemError) {
          results.failed.push({
            expense,
            error: itemError.message
          });
        }
      }

      await client.query('COMMIT');

      return ApiResponse.created(res, {
        summary: {
          total: expenses.length,
          created: results.created.length,
          failed: results.failed.length
        },
        details: results
      }, 'Bulk expense creation completed');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new ExpensesController();
