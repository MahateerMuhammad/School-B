const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Discounts Controller
 * Manages student discounts per class
 */
class DiscountsController {
    constructor() {
        this.create = this.create.bind(this);
        this.list = this.list.bind(this);
        this.getByStudent = this.getByStudent.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
    }

    /**
     * Create or update student discount for a class
     * POST /api/discounts
     */
    async create(req, res, next) {
        const client = await pool.connect();
        try {
            const { student_id, class_id, discount_type, discount_value, reason, is_permanent, for_month, is_fee_free } = req.body;

            // Validate input
            const schema = Joi.object({
                student_id: Joi.number().integer().required(),
                class_id: Joi.number().integer().required(),
                discount_type: Joi.string().valid('PERCENTAGE', 'FLAT').required(),
                discount_value: Joi.number().min(0).required(),
                reason: Joi.string().optional().allow('', null),
                is_permanent: Joi.boolean().optional().default(true),
                for_month: Joi.date().optional().allow(null),
                is_fee_free: Joi.boolean().optional().default(false)
            });

            const { error } = schema.validate(req.body);
            if (error) {
                return ApiResponse.error(res, error.details[0].message, 400);
            }

            // Validate percentage discount
            if (discount_type === 'PERCENTAGE' && discount_value > 100) {
                return ApiResponse.error(res, 'Percentage discount cannot exceed 100%', 400);
            }

            // Check if student exists (remove strict enrollment validation)
            const studentCheck = await client.query(
                `SELECT id, name FROM students WHERE id = $1`,
                [student_id]
            );

            if (studentCheck.rows.length === 0) {
                return ApiResponse.error(res, 'Student not found', 400);
            }

            // Check if class exists  
            const classCheck = await client.query(
                `SELECT id FROM classes WHERE id = $1`,
                [class_id]
            );

            if (classCheck.rows.length === 0) {
                return ApiResponse.error(res, 'Class not found', 400);
            }

            // Handle fee-free status
            if (is_fee_free === true) {
                await client.query(
                    `UPDATE students SET is_fee_free = true WHERE id = $1`,
                    [student_id]
                );
                return ApiResponse.success(res, { student_id, is_fee_free: true }, 'Student marked as fee-free. No vouchers will be generated.');
            } else if (is_fee_free === false) {
                await client.query(
                    `UPDATE students SET is_fee_free = false WHERE id = $1`,
                    [student_id]
                );
                return ApiResponse.success(res, { student_id, is_fee_free: false }, 'Student unmarked as fee-free. Vouchers will be generated normally.');
            }

            // Insert or update discount (permanent or temporary)
            // For permanent discounts, store in student_discounts table
            // For one-time/monthly discounts, we'll need to handle differently
            if (is_permanent === true || is_permanent === undefined) {
                const result = await client.query(
                    `INSERT INTO student_discounts 
             (student_id, class_id, discount_type, discount_value, reason, applied_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (student_id, class_id) 
             DO UPDATE SET 
               discount_type = EXCLUDED.discount_type,
               discount_value = EXCLUDED.discount_value,
               reason = EXCLUDED.reason,
               applied_by = EXCLUDED.applied_by,
               created_at = now()
             RETURNING *`,
                    [student_id, class_id, discount_type, discount_value, reason || null, req.user?.id || null]
                );
                return ApiResponse.created(res, result.rows[0], 'Permanent discount applied successfully');
            } else {
                // For one-time discounts (for a specific month), return data for frontend to apply manually
                return ApiResponse.success(res, {
                    student_id,
                    class_id,
                    discount_type,
                    discount_value,
                    for_month,
                    reason,
                    is_permanent: false
                }, 'One-time discount data prepared. Apply to specific voucher.');
            }
        } catch (error) {
            next(error);
        } finally {
            client.release();
        }
    }

    /**
     * List all discounts with filters
     * GET /api/discounts
     */
    async list(req, res, next) {
        const client = await pool.connect();
        try {
            const { class_id, student_id, page = 1, limit = 50 } = req.query;

            let query = `
        SELECT 
          sd.*,
          s.name as student_name,
          s.roll_no,
          c.name as class_name,
          u.email as applied_by_email
        FROM student_discounts sd
        JOIN students s ON sd.student_id = s.id
        JOIN classes c ON sd.class_id = c.id
        LEFT JOIN users u ON sd.applied_by = u.id
        WHERE 1=1
      `;

            const params = [];
            let paramCount = 1;

            if (class_id) {
                query += ` AND sd.class_id = $${paramCount}`;
                params.push(class_id);
                paramCount++;
            }

            if (student_id) {
                query += ` AND sd.student_id = $${paramCount}`;
                params.push(student_id);
                paramCount++;
            }

            // Count total
            const countQuery = `SELECT COUNT(*) FROM (${query}) as counted`;
            const countResult = await client.query(countQuery, params);
            const total = parseInt(countResult.rows[0].count);

            // Add pagination
            query += ` ORDER BY sd.created_at DESC`;
            query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
            params.push(limit, (page - 1) * limit);

            const result = await client.query(query, params);

            return ApiResponse.paginated(
                res,
                result.rows,
                { page: parseInt(page), limit: parseInt(limit), total },
                'Discounts retrieved successfully'
            );
        } catch (error) {
            next(error);
        } finally {
            client.release();
        }
    }

    /**
     * Get discounts for a specific student
     * GET /api/discounts/student/:id
     */
    async getByStudent(req, res, next) {
        const client = await pool.connect();
        try {
            const { id } = req.params;

            const result = await client.query(
                `SELECT 
          sd.*,
          c.name as class_name,
          u.email as applied_by_email
         FROM student_discounts sd
         JOIN classes c ON sd.class_id = c.id
         LEFT JOIN users u ON sd.applied_by = u.id
         WHERE sd.student_id = $1
         ORDER BY sd.created_at DESC`,
                [id]
            );

            return ApiResponse.success(res, result.rows);
        } catch (error) {
            next(error);
        } finally {
            client.release();
        }
    }

    /**
     * Update discount
     * PUT /api/discounts/:id
     */
    async update(req, res, next) {
        const client = await pool.connect();
        try {
            const { id } = req.params;
            const { discount_type, discount_value, reason } = req.body;

            // Validate input
            const schema = Joi.object({
                discount_type: Joi.string().valid('PERCENTAGE', 'FLAT').optional(),
                discount_value: Joi.number().min(0).optional(),
                reason: Joi.string().optional().allow('', null)
            });

            const { error } = schema.validate(req.body);
            if (error) {
                return ApiResponse.error(res, error.details[0].message, 400);
            }

            const updates = [];
            const values = [];
            let paramCount = 1;

            if (discount_type !== undefined) {
                updates.push(`discount_type = $${paramCount}`);
                values.push(discount_type);
                paramCount++;
            }

            if (discount_value !== undefined) {
                updates.push(`discount_value = $${paramCount}`);
                values.push(discount_value);
                paramCount++;
            }

            if (reason !== undefined) {
                updates.push(`reason = $${paramCount}`);
                values.push(reason || null);
                paramCount++;
            }

            if (updates.length === 0) {
                return ApiResponse.error(res, 'No fields to update', 400);
            }

            values.push(id);
            const result = await client.query(
                `UPDATE student_discounts SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
                values
            );

            if (result.rows.length === 0) {
                return ApiResponse.error(res, 'Discount not found', 404);
            }

            return ApiResponse.success(res, result.rows[0], 'Discount updated successfully');
        } catch (error) {
            next(error);
        } finally {
            client.release();
        }
    }

    /**
     * Delete discount
     * DELETE /api/discounts/:id
     */
    async delete(req, res, next) {
        const client = await pool.connect();
        try {
            const { id } = req.params;

            const result = await client.query(
                'DELETE FROM student_discounts WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return ApiResponse.error(res, 'Discount not found', 404);
            }

            return ApiResponse.success(res, result.rows[0], 'Discount deleted successfully');
        } catch (error) {
            next(error);
        } finally {
            client.release();
        }
    }
}

module.exports = new DiscountsController();
