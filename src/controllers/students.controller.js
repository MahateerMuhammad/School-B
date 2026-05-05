const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Students Controller
 * Manages students, enrollment, and related operations
 * Handles all edge cases and validations
 */
class StudentsController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.create = this.create.bind(this);
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.update = this.update.bind(this);
    this.enroll = this.enroll.bind(this);
    this.withdraw = this.withdraw.bind(this);
    this.deactivate = this.deactivate.bind(this);
    this.activate = this.activate.bind(this);
    this.expel = this.expel.bind(this);
    this.clearExpulsion = this.clearExpulsion.bind(this);
    this.addGuardian = this.addGuardian.bind(this);
    this.removeGuardian = this.removeGuardian.bind(this);
    this.transfer = this.transfer.bind(this);
    this.promote = this.promote.bind(this);
    this.bulkCreate = this.bulkCreate.bind(this);
    this.bulkUpdate = this.bulkUpdate.bind(this);
    this.bulkDeactivate = this.bulkDeactivate.bind(this);
    this.bulkDelete = this.bulkDelete.bind(this);
    this.deleteOne = this.deleteOne.bind(this);
    this.setYearlyPackage = this.setYearlyPackage.bind(this);
  }

  /**
   * Create new student with guardians and enrollment
   * POST /api/students
   */
  async create(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        name, phone, address, email, date_of_birth,
        bay_form, caste, previous_school, father_name, gender,
        is_fee_free,
        individual_monthly_fee,
        guardians,
        enrollment // { class_id, section_id, start_date }
      } = req.body;

      // Validate input
      const schema = Joi.object({
        name: Joi.string().required(),
        phone: Joi.string().optional().allow('', null),
        address: Joi.string().optional().allow('', null),
        email: Joi.string().email().optional().allow('', null),
        date_of_birth: Joi.date().optional().allow(null),
        bay_form: Joi.string().optional().allow('', null),
        caste: Joi.string().optional().allow('', null),
        previous_school: Joi.string().optional().allow('', null),
        father_name: Joi.string().optional().allow('', null),
        gender: Joi.string().valid('Male', 'Female', 'Other').optional().allow('', null),
        is_fee_free: Joi.boolean().optional().default(false),
        individual_monthly_fee: Joi.number().optional().allow(null),
        guardians: Joi.array().items(
          Joi.object({
            guardian_id: Joi.number().optional(),
            name: Joi.string().optional(),
            cnic: Joi.string().pattern(/^[0-9]{13}$/).optional().allow(''),
            phone: Joi.string().optional().allow(''),
            occupation: Joi.string().optional().allow(''),
            relation: Joi.string().required()
          })
        ).optional(),
        enrollment: Joi.object({
          class_id: Joi.number().integer().required(),
          section_id: Joi.number().integer().required(),
          start_date: Joi.date().optional()
        }).optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Validate enrollment if provided
      if (enrollment) {
        const classCheck = await client.query(
          'SELECT id, is_active FROM classes WHERE id = $1',
          [enrollment.class_id]
        );
        if (classCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return ApiResponse.error(res, 'Class not found', 404);
        }
        if (!classCheck.rows[0].is_active) {
          await client.query('ROLLBACK');
          return ApiResponse.error(res, 'Cannot enroll in inactive class', 400);
        }

        const sectionCheck = await client.query(
          'SELECT id FROM sections WHERE id = $1 AND class_id = $2',
          [enrollment.section_id, enrollment.class_id]
        );
        if (sectionCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return ApiResponse.error(res, 'Section not found or does not belong to the specified class', 404);
        }
      }

      // Insert student
      const studentResult = await client.query(
        `INSERT INTO students 
         (name, phone, address, email, date_of_birth, bay_form, caste, previous_school, father_name, gender, admission_date, is_fee_free, individual_monthly_fee) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
         RETURNING *`,
        [
          name,
          phone || null,
          address || null,
          email || null,
          date_of_birth || null,
          bay_form || null,
          caste || null,
          previous_school || null,
          father_name || null,
          gender || null,
          enrollment ? enrollment.start_date : new Date().toISOString().split('T')[0],
          is_fee_free || false,
          individual_monthly_fee ?? null  // Use ?? to preserve 0 for free students
        ]
      );

      const student = studentResult.rows[0];

      // Handle guardians
      if (guardians && guardians.length > 0) {
        for (const guardian of guardians) {
          let guardianId = guardian.guardian_id;

          // If guardian_id not provided, check if guardian exists by CNIC or create new
          if (!guardianId) {
            if (guardian.cnic) {
              const existingGuardian = await client.query(
                'SELECT id FROM guardians WHERE cnic = $1',
                [guardian.cnic]
              );
              if (existingGuardian.rows.length > 0) {
                guardianId = existingGuardian.rows[0].id;
              }
            }

            // Create new guardian if not found
            if (!guardianId) {
              if (!guardian.name) {
                await client.query('ROLLBACK');
                return ApiResponse.error(
                  res,
                  'Guardian name is required when creating new guardian',
                  400
                );
              }

              const guardianResult = await client.query(
                `INSERT INTO guardians (name, cnic, phone, occupation) 
                 VALUES ($1, $2, $3, $4) 
                 RETURNING id`,
                [
                  guardian.name,
                  guardian.cnic || null,
                  guardian.phone || null,
                  guardian.occupation || null
                ]
              );
              guardianId = guardianResult.rows[0].id;
            }
          } else {
            // Verify guardian_id exists
            const guardianCheck = await client.query(
              'SELECT id FROM guardians WHERE id = $1',
              [guardianId]
            );
            if (guardianCheck.rows.length === 0) {
              await client.query('ROLLBACK');
              return ApiResponse.error(res, `Guardian with ID ${guardianId} not found`, 404);
            }
          }

          // Check if relationship already exists
          const relationCheck = await client.query(
            'SELECT * FROM student_guardians WHERE student_id = $1 AND guardian_id = $2',
            [student.id, guardianId]
          );

          if (relationCheck.rows.length === 0) {
            // Link guardian to student
            await client.query(
              `INSERT INTO student_guardians (student_id, guardian_id, relation) 
               VALUES ($1, $2, $3)`,
              [student.id, guardianId, guardian.relation]
            );
          }
        }
      }

      // Handle enrollment if provided
      if (enrollment) {
        // Get next serial number for this section
        const serialNumber = await this.getNextSerialNumber(client, enrollment.section_id);
        
        await client.query(
          `INSERT INTO student_class_history 
           (student_id, class_id, section_id, start_date, serial_number) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            student.id,
            enrollment.class_id,
            enrollment.section_id,
            enrollment.start_date || new Date(),
            serialNumber
          ]
        );
      }

      await client.query('COMMIT');

      // Return the created student data
      return ApiResponse.created(res, student, 'Student created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Get next serial number for section
   */
  async getNextSerialNumber(client, sectionId) {
    const result = await client.query(
      `SELECT COALESCE(MAX(serial_number), 0) + 1 as next_serial
       FROM student_class_history 
       WHERE section_id = $1 AND end_date IS NULL`,
      [sectionId]
    );
    return result.rows[0].next_serial;
  }

  /**
   * Helper: Get complete student data
   */
  async getStudentById(client, studentId) {
    // Get student
    const studentResult = await client.query(
      'SELECT * FROM students WHERE id = $1',
      [studentId]
    );

    if (studentResult.rows.length === 0) {
      return null;
    }

    const student = studentResult.rows[0];

    // Get guardians
    const guardiansResult = await client.query(
      `SELECT g.*, sg.relation 
       FROM guardians g
       JOIN student_guardians sg ON g.id = sg.guardian_id
       WHERE sg.student_id = $1
       ORDER BY g.name`,
      [studentId]
    );

    // Get current enrollment
    const enrollmentResult = await client.query(
      `SELECT sch.*, 
              c.name as class_name, 
              c.class_type, 
              s.name as section_name
       FROM student_class_history sch
       JOIN classes c ON sch.class_id = c.id
       JOIN sections s ON sch.section_id = s.id
       WHERE sch.student_id = $1 AND sch.end_date IS NULL`,
      [studentId]
    );

    // Get enrollment history
    const historyResult = await client.query(
      `SELECT sch.*, 
              c.name as class_name, 
              c.class_type, 
              s.name as section_name
       FROM student_class_history sch
       JOIN classes c ON sch.class_id = c.id
       JOIN sections s ON sch.section_id = s.id
       WHERE sch.student_id = $1
       ORDER BY sch.start_date DESC`,
      [studentId]
    );

    // Get documents
    const documentsResult = await client.query(
      'SELECT * FROM student_documents WHERE student_id = $1 ORDER BY uploaded_at DESC',
      [studentId]
    );

    return {
      ...student,
      guardians: guardiansResult.rows,
      current_enrollment: enrollmentResult.rows[0] || null,
      enrollment_history: historyResult.rows,
      documents: documentsResult.rows
    };
  }

  /**
   * Get student by ID
   * GET /api/students/:id
   */
  async getById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const student = await this.getStudentById(client, id);

      if (!student) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      return ApiResponse.success(res, student);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List students with advanced filtering
   * GET /api/students
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const {
        is_active,
        is_expelled,
        class_id,
        section_id,
        search,
        page = 1,
        limit = 500  // Increased from 50 to 500 to show all students in a class/section
      } = req.query;

      let query = `
        SELECT DISTINCT ON (s.id) 
               s.id, s.name, s.roll_no, s.phone, s.address, s.date_of_birth, 
               s.bay_form, s.caste, s.previous_school, s.is_expelled, s.is_active, s.created_at,
               s.father_name, s.individual_monthly_fee, s.is_fee_free,
               c.id as class_id,
               c.name as class_name,
               c.class_type,
               sec.id as section_id,
               sec.name as section_name,
               cfs.monthly_fee as class_monthly_fee,
               cfs.admission_fee,
               cfs.paper_fund,
               g.name as father_guardian_name,
               COALESCE(s.individual_monthly_fee, cfs.monthly_fee, 0) as effective_monthly_fee,
               CASE 
                 WHEN c.class_type = 'COLLEGE' THEN 
                   GREATEST(COALESCE(yearly_package.amount, 0) - COALESCE(total_payments.amount, 0), 0)
                 ELSE 0 
               END as pending_amount,
               COALESCE(yearly_package.amount, 0) as yearly_package_amount,
               COALESCE(total_payments.amount, 0) as total_paid_amount
        FROM students s
        LEFT JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
        LEFT JOIN classes c ON sch.class_id = c.id
        LEFT JOIN sections sec ON sch.section_id = sec.id
        LEFT JOIN LATERAL (
          SELECT * FROM class_fee_structure 
          WHERE class_id = c.id 
          ORDER BY effective_from DESC 
          LIMIT 1
        ) cfs ON true
        LEFT JOIN student_guardians sg ON s.id = sg.student_id AND sg.relation = 'Father'
        LEFT JOIN guardians g ON sg.guardian_id = g.id
        -- College fee calculation joins (across ALL enrollments, not just current)
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(CASE WHEN fvi.item_type <> 'ARREARS' THEN fvi.amount ELSE 0 END), 0) as amount
          FROM student_class_history sch_all
          JOIN fee_vouchers fv ON fv.student_class_history_id = sch_all.id
          JOIN fee_voucher_items fvi ON fv.id = fvi.voucher_id
          WHERE sch_all.student_id = s.id
        ) yearly_package ON c.class_type = 'COLLEGE'
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(fp.amount), 0) as amount
          FROM student_class_history sch_all
          JOIN fee_vouchers fv ON fv.student_class_history_id = sch_all.id
          JOIN fee_payments fp ON fv.id = fp.voucher_id
          WHERE sch_all.student_id = s.id
        ) total_payments ON c.class_type = 'COLLEGE'
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (is_active !== undefined) {
        query += ` AND s.is_active = $${paramCount}`;
        params.push(is_active === 'true');
        paramCount++;
      }

      if (is_expelled !== undefined) {
        query += ` AND s.is_expelled = $${paramCount}`;
        params.push(is_expelled === 'true');
        paramCount++;
      }

      if (class_id) {
        query += ` AND sch.class_id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      if (section_id) {
        query += ` AND sch.section_id = $${paramCount}`;
        params.push(section_id);
        paramCount++;
      }

      if (search) {
        query += ` AND (s.name ILIKE $${paramCount} OR s.roll_no ILIKE $${paramCount} OR s.phone ILIKE $${paramCount})`;
        params.push(`%${search}%`);
        paramCount++;
      }

      // Count total records
      let countQuery = `
        SELECT COUNT(DISTINCT s.id)
        FROM students s
        LEFT JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
        WHERE 1=1
      `;

      let countParams = [];
      let countParamCount = 1;

      if (is_active !== undefined) {
        countQuery += ` AND s.is_active = $${countParamCount}`;
        countParams.push(is_active === 'true');
        countParamCount++;
      }

      if (is_expelled !== undefined) {
        countQuery += ` AND s.is_expelled = $${countParamCount}`;
        countParams.push(is_expelled === 'true');
        countParamCount++;
      }

      if (class_id) {
        countQuery += ` AND sch.class_id = $${countParamCount}`;
        countParams.push(class_id);
        countParamCount++;
      }

      if (section_id) {
        countQuery += ` AND sch.section_id = $${countParamCount}`;
        countParams.push(section_id);
        countParamCount++;
      }

      if (search) {
        countQuery += ` AND (s.name ILIKE $${countParamCount} OR s.roll_no ILIKE $${countParamCount} OR s.phone ILIKE $${countParamCount})`;
        countParams.push(`%${search}%`);
        countParamCount++;
      }

      const countResult = await client.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      query += ` ORDER BY s.id, s.created_at ASC`; // DISTINCT ON requires s.id first in ORDER BY
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);

      // Debug: Log first student to verify data is correct
      if (result.rows.length > 0) {
        console.log('📊 API returning students - first student data:', {
          id: result.rows[0].id,
          name: result.rows[0].name,
          class_id: result.rows[0].class_id,
          class_name: result.rows[0].class_name,
          class_type: result.rows[0].class_type,
          section_id: result.rows[0].section_id,
          section_name: result.rows[0].section_name,
          father_name: result.rows[0].father_name,
          phone: result.rows[0].phone,
          individual_monthly_fee: result.rows[0].individual_monthly_fee,
          effective_monthly_fee: result.rows[0].effective_monthly_fee,
          pending_amount: result.rows[0].pending_amount,
          yearly_package_amount: result.rows[0].yearly_package_amount,
          total_paid_amount: result.rows[0].total_paid_amount
        });
      }

      return ApiResponse.paginated(
        res,
        result.rows,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Students retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update student
   * PUT /api/students/:id
   */
  async update(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const {
        name, roll_no, phone, address, date_of_birth,
        bay_form, caste, previous_school, email, father_name, father_cnic, gender
      } = req.body;

      // Validate input
      const schema = Joi.object({
        name: Joi.string().optional(),
        roll_no: Joi.string().optional().allow('', null),
        phone: Joi.string().optional().allow('', null),
        address: Joi.string().optional().allow('', null),
        date_of_birth: Joi.date().optional().allow(null),
        bay_form: Joi.string().optional().allow('', null),
        caste: Joi.string().optional().allow('', null),
        previous_school: Joi.string().optional().allow('', null),
        email: Joi.string().email().optional().allow('', null),
        father_name: Joi.string().optional().allow('', null),
        father_cnic: Joi.string().optional().allow('', null),
        gender: Joi.string().valid('Male', 'Female', 'Other').optional().allow('', null)
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if roll_no is unique (if being updated)
      if (roll_no !== undefined && roll_no) {
        const rollNoCheck = await client.query(
          'SELECT id FROM students WHERE roll_no = $1 AND id != $2',
          [roll_no, id]
        );
        if (rollNoCheck.rows.length > 0) {
          return ApiResponse.error(res, 'Roll number already exists', 409);
        }
      }

      if (email !== undefined && email) {
        const emailCheck = await client.query(
          'SELECT id FROM students WHERE lower(email) = lower($1) AND id != $2',
          [email, id]
        );
        if (emailCheck.rows.length > 0) {
          return ApiResponse.error(res, 'Email already exists', 409);
        }
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        values.push(name);
        paramCount++;
      }

      if (roll_no !== undefined) {
        updates.push(`roll_no = $${paramCount}`);
        values.push(roll_no || null);
        paramCount++;
      }

      if (phone !== undefined) {
        updates.push(`phone = $${paramCount}`);
        values.push(phone || null);
        paramCount++;
      }

      if (email !== undefined) {
        updates.push(`email = $${paramCount}`);
        values.push(email || null);
        paramCount++;
      }

      if (address !== undefined) {
        updates.push(`address = $${paramCount}`);
        values.push(address || null);
        paramCount++;
      }

      if (date_of_birth !== undefined) {
        updates.push(`date_of_birth = $${paramCount}`);
        values.push(date_of_birth || null);
        paramCount++;
      }

      if (bay_form !== undefined) {
        updates.push(`bay_form = $${paramCount}`);
        values.push(bay_form || null);
        paramCount++;
      }

      if (caste !== undefined) {
        updates.push(`caste = $${paramCount}`);
        values.push(caste || null);
        paramCount++;
      }

      if (previous_school !== undefined) {
        updates.push(`previous_school = $${paramCount}`);
        values.push(previous_school || null);
        paramCount++;
      }

      if (father_name !== undefined) {
        updates.push(`father_name = $${paramCount}`);
        values.push(father_name || null);
        paramCount++;
      }

      if (father_cnic !== undefined) {
        updates.push(`father_cnic = $${paramCount}`);
        values.push(father_cnic || null);
        paramCount++;
      }

      if (gender !== undefined) {
        updates.push(`gender = $${paramCount}`);
        values.push(gender || null);
        paramCount++;
      }

      if (updates.length === 0) {
        return ApiResponse.error(res, 'No fields to update', 400);
      }

      values.push(id);
      const result = await client.query(
        `UPDATE students SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Student updated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Set yearly package for a college student
   * POST /api/students/:id/yearly-package
   * Creates or updates the YEARLY_COLLEGE voucher
   */
  async setYearlyPackage(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { yearly_package_amount } = req.body;

      const schema = Joi.object({
        yearly_package_amount: Joi.number().positive().required()
      });
      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Get current enrollment
      const enrollmentResult = await client.query(
        `SELECT sch.id as enrollment_id, sch.class_id, c.class_type, s.is_active
         FROM student_class_history sch
         JOIN classes c ON sch.class_id = c.id
         JOIN students s ON sch.student_id = s.id
         WHERE sch.student_id = $1 AND sch.end_date IS NULL`,
        [id]
      );

      if (enrollmentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student is not currently enrolled', 404);
      }

      const enrollment = enrollmentResult.rows[0];

      if (!enrollment.is_active) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student is not active', 400);
      }

      // Check if a YEARLY_COLLEGE voucher already exists
      const existingVoucher = await client.query(
        `SELECT fv.id as voucher_id
         FROM fee_vouchers fv
         WHERE fv.student_class_history_id = $1 AND fv.voucher_type = 'YEARLY_COLLEGE'`,
        [enrollment.enrollment_id]
      );

      if (existingVoucher.rows.length > 0) {
        // Update existing voucher item amount
        await client.query(
          `UPDATE fee_voucher_items SET amount = $1
           WHERE voucher_id = $2 AND item_type = 'YEARLY_PACKAGE'`,
          [parseFloat(yearly_package_amount), existingVoucher.rows[0].voucher_id]
        );
        await client.query('COMMIT');
        return ApiResponse.success(res, { voucher_id: existingVoucher.rows[0].voucher_id }, 'Yearly package updated successfully');
      }

      // Create new YEARLY_COLLEGE voucher
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const voucherResult = await client.query(
        `INSERT INTO fee_vouchers (student_class_history_id, month, voucher_type)
         VALUES ($1, $2, 'YEARLY_COLLEGE')
         RETURNING *`,
        [enrollment.enrollment_id, month]
      );

      await client.query(
        `INSERT INTO fee_voucher_items (voucher_id, item_type, amount, description)
         VALUES ($1, 'YEARLY_PACKAGE', $2, 'Annual Fee Package')`,
        [voucherResult.rows[0].id, parseFloat(yearly_package_amount)]
      );

      await client.query('COMMIT');
      return ApiResponse.created(res, { voucher_id: voucherResult.rows[0].id }, 'Yearly package voucher created successfully');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update basic student information
   * PATCH /api/students/:id/basic-info
   */
  async updateBasicInfo(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { name, father_name, phone, individual_monthly_fee } = req.body;

      // Validate input
      const schema = Joi.object({
        name: Joi.string().optional(),
        father_name: Joi.string().optional().allow('', null),
        phone: Joi.string().optional().allow('', null),
        individual_monthly_fee: Joi.number().optional().allow(null)
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        values.push(name);
        paramCount++;
      }

      if (father_name !== undefined) {
        updates.push(`father_name = $${paramCount}`);
        values.push(father_name || null);
        paramCount++;
      }

      if (phone !== undefined) {
        updates.push(`phone = $${paramCount}`);
        values.push(phone || null);
        paramCount++;
      }

      if (individual_monthly_fee !== undefined) {
        updates.push(`individual_monthly_fee = $${paramCount}`);
        values.push(individual_monthly_fee);
        paramCount++;
      }

      if (updates.length === 0) {
        return ApiResponse.error(res, 'No fields to update', 400);
      }

      values.push(id);
      const result = await client.query(
        `UPDATE students SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Student information updated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Mark students as fee-free (bulk operation)
   * POST /api/students/mark-free
   */
  async markFree(req, res, next) {
    const client = await pool.connect();
    try {
      const { student_identifiers, class_id, section_id } = req.body;

      if (!student_identifiers || !Array.isArray(student_identifiers) || student_identifiers.length === 0) {
        return ApiResponse.error(res, 'student_identifiers array is required', 400);
      }

      const studentIds = [];
      
      // Find student IDs based on identifiers
      for (const identifier of student_identifiers) {
        const { name, roll_no, phone } = identifier;
        
        let query = `
          SELECT s.id 
          FROM students s
          LEFT JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
          WHERE s.name = $1
        `;
        const params = [name];
        let paramCount = 2;

        if (roll_no) {
          query += ` AND s.roll_no = $${paramCount}`;
          params.push(roll_no);
          paramCount++;
        }

        if (class_id) {
          query += ` AND sch.class_id = $${paramCount}`;
          params.push(class_id);
          paramCount++;
        }

        if (section_id) {
          query += ` AND sch.section_id = $${paramCount}`;
          params.push(section_id);
          paramCount++;
        }

        const result = await client.query(query, params);
        if (result.rows.length > 0) {
          studentIds.push(result.rows[0].id);
        }
      }

      if (studentIds.length === 0) {
        return ApiResponse.error(res, 'No matching students found', 404);
      }

      // Mark students as fee-free
      const updateResult = await client.query(
        `UPDATE students SET is_fee_free = true WHERE id = ANY($1) RETURNING id, name`,
        [studentIds]
      );

      return ApiResponse.success(res, {
        markedCount: updateResult.rows.length,
        students: updateResult.rows
      }, `Successfully marked ${updateResult.rows.length} student(s) as fee-free`);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Unmark students as fee-free (bulk operation)
   * POST /api/students/unmark-free
   */
  async unmarkFree(req, res, next) {
    const client = await pool.connect();
    try {
      const { student_identifiers, class_id, section_id } = req.body;

      if (!student_identifiers || !Array.isArray(student_identifiers) || student_identifiers.length === 0) {
        return ApiResponse.error(res, 'student_identifiers array is required', 400);
      }

      const studentIds = [];
      
      // Find student IDs based on identifiers
      for (const identifier of student_identifiers) {
        const { name, roll_no, phone } = identifier;
        
        let query = `
          SELECT s.id 
          FROM students s
          LEFT JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
          WHERE s.name = $1
        `;
        const params = [name];
        let paramCount = 2;

        if (roll_no) {
          query += ` AND s.roll_no = $${paramCount}`;
          params.push(roll_no);
          paramCount++;
        }

        if (class_id) {
          query += ` AND sch.class_id = $${paramCount}`;
          params.push(class_id);
          paramCount++;
        }

        if (section_id) {
          query += ` AND sch.section_id = $${paramCount}`;
          params.push(section_id);
          paramCount++;
        }

        const result = await client.query(query, params);
        if (result.rows.length > 0) {
          studentIds.push(result.rows[0].id);
        }
      }

      if (studentIds.length === 0) {
        return ApiResponse.error(res, 'No matching students found', 404);
      }

      // Unmark students as fee-free
      const updateResult = await client.query(
        `UPDATE students SET is_fee_free = false WHERE id = ANY($1) RETURNING id, name`,
        [studentIds]
      );

      return ApiResponse.success(res, {
        unmarkedCount: updateResult.rows.length,
        students: updateResult.rows
      }, `Successfully unmarked ${updateResult.rows.length} student(s) as fee-free`);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Enroll student in class/section
   * POST /api/students/:id/enroll
   */
  async enroll(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { class_id, section_id, start_date } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().required(),
        start_date: Joi.date().optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if student exists and is active
      const studentCheck = await client.query(
        'SELECT id, is_active, is_expelled FROM students WHERE id = $1',
        [id]
      );

      if (studentCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student not found', 404);
      }

      if (!studentCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot enroll inactive student', 400);
      }

      if (studentCheck.rows[0].is_expelled) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot enroll expelled student', 400);
      }

      // Check if student already has active enrollment
      const activeEnrollment = await client.query(
        'SELECT * FROM student_class_history WHERE student_id = $1 AND end_date IS NULL',
        [id]
      );

      if (activeEnrollment.rows.length > 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Student already has an active enrollment. Please withdraw from current class first.',
          400
        );
      }

      // Validate class and section
      const classCheck = await client.query(
        'SELECT id, is_active FROM classes WHERE id = $1',
        [class_id]
      );

      if (classCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Class not found', 404);
      }

      if (!classCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot enroll in inactive class', 400);
      }

      const sectionCheck = await client.query(
        'SELECT id FROM sections WHERE id = $1 AND class_id = $2',
        [section_id, class_id]
      );

      if (sectionCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Section not found or does not belong to the specified class',
          404
        );
      }

      // Create enrollment
      // Get next serial number for this section
      const serialNumber = await this.getNextSerialNumber(client, section_id);
      
      await client.query(
        `INSERT INTO student_class_history 
         (student_id, class_id, section_id, start_date, serial_number) 
         VALUES ($1, $2, $3, $4, $5)`,
        [id, class_id, section_id, start_date || new Date(), serialNumber]
      );

      await client.query('COMMIT');

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Student enrolled successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Withdraw student from current class
   * POST /api/students/:id/withdraw
   */
  async withdraw(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { end_date } = req.body;

      // Validate input
      const schema = Joi.object({
        end_date: Joi.date().optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if student has active enrollment
      const activeEnrollment = await client.query(
        'SELECT * FROM student_class_history WHERE student_id = $1 AND end_date IS NULL',
        [id]
      );

      if (activeEnrollment.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student has no active enrollment', 400);
      }

      // Update enrollment with end date
      await client.query(
        'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
        [end_date || new Date(), activeEnrollment.rows[0].id]
      );

      await client.query('COMMIT');

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Student withdrawn successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Deactivate student
   * POST /api/students/:id/deactivate
   */
  async deactivate(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'UPDATE students SET is_active = false WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Student deactivated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Activate student
   * POST /api/students/:id/activate
   */
  async activate(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Check if student is expelled
      const studentCheck = await client.query(
        'SELECT is_expelled FROM students WHERE id = $1',
        [id]
      );

      if (studentCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      if (studentCheck.rows[0].is_expelled) {
        return ApiResponse.error(
          res,
          'Cannot activate expelled student. Please clear expulsion first.',
          400
        );
      }

      const result = await client.query(
        'UPDATE students SET is_active = true WHERE id = $1 RETURNING *',
        [id]
      );

      return ApiResponse.success(res, result.rows[0], 'Student activated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Mark student as expelled
   * POST /api/students/:id/expel
   */
  async expel(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Withdraw from current class if enrolled
      const activeEnrollment = await client.query(
        'SELECT id FROM student_class_history WHERE student_id = $1 AND end_date IS NULL',
        [id]
      );

      if (activeEnrollment.rows.length > 0) {
        await client.query(
          'UPDATE student_class_history SET end_date = CURRENT_DATE WHERE id = $1',
          [activeEnrollment.rows[0].id]
        );
      }

      // Mark as expelled and inactive
      const result = await client.query(
        'UPDATE students SET is_expelled = true, is_active = false WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student not found', 404);
      }

      await client.query('COMMIT');

      return ApiResponse.success(res, result.rows[0], 'Student marked as expelled');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Clear expulsion status
   * POST /api/students/:id/clear-expulsion
   */
  async clearExpulsion(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'UPDATE students SET is_expelled = false WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      return ApiResponse.success(
        res,
        result.rows[0],
        'Expulsion cleared. Student can now be activated.'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Add guardian to student
   * POST /api/students/:id/guardians
   */
  async addGuardian(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { guardian_id, relation } = req.body;

      // Validate input
      const schema = Joi.object({
        guardian_id: Joi.number().integer().required(),
        relation: Joi.string().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if student exists
      const studentCheck = await client.query(
        'SELECT id FROM students WHERE id = $1',
        [id]
      );

      if (studentCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      // Check if guardian exists
      const guardianCheck = await client.query(
        'SELECT id FROM guardians WHERE id = $1',
        [guardian_id]
      );

      if (guardianCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Guardian not found', 404);
      }

      // Check if relationship already exists
      const relationCheck = await client.query(
        'SELECT * FROM student_guardians WHERE student_id = $1 AND guardian_id = $2',
        [id, guardian_id]
      );

      if (relationCheck.rows.length > 0) {
        return ApiResponse.error(res, 'Guardian already linked to this student', 409);
      }

      // Create relationship
      await client.query(
        'INSERT INTO student_guardians (student_id, guardian_id, relation) VALUES ($1, $2, $3)',
        [id, guardian_id, relation]
      );

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Guardian added successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Remove guardian from student
   * DELETE /api/students/:id/guardians/:guardianId
   */
  async removeGuardian(req, res, next) {
    const client = await pool.connect();
    try {
      const { id, guardianId } = req.params;

      const result = await client.query(
        'DELETE FROM student_guardians WHERE student_id = $1 AND guardian_id = $2 RETURNING *',
        [id, guardianId]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Guardian relationship not found', 404);
      }

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Guardian removed successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Transfer student to another class/section
   * POST /api/students/:id/transfer
   */
  async transfer(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { class_id, section_id, transfer_date } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().required(),
        transfer_date: Joi.date().optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // End current enrollment
      const activeEnrollment = await client.query(
        'SELECT * FROM student_class_history WHERE student_id = $1 AND end_date IS NULL',
        [id]
      );

      if (activeEnrollment.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student has no active enrollment to transfer from', 400);
      }

      // Transfer is within the same class only (different section)
      if (String(class_id) !== String(activeEnrollment.rows[0].class_id)) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Transfer is only allowed within the same class. Use Promote to move to a different class.', 400);
      }

      // Cannot transfer to the same section
      if (String(section_id) === String(activeEnrollment.rows[0].section_id)) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student is already in this section.', 400);
      }

      const transferDateValue = transfer_date ? new Date(transfer_date) : new Date();

      await client.query(
        'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
        [transferDateValue, activeEnrollment.rows[0].id]
      );

      // Validate new class and section
      const classCheck = await client.query(
        'SELECT id, is_active FROM classes WHERE id = $1',
        [class_id]
      );

      if (classCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Class not found', 404);
      }

      if (!classCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot transfer to inactive class', 400);
      }

      const sectionCheck = await client.query(
        'SELECT id FROM sections WHERE id = $1 AND class_id = $2',
        [section_id, class_id]
      );

      if (sectionCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Section not found or does not belong to the specified class',
          404
        );
      }

      // Create new enrollment
      // Get next serial number for new section
      const serialNumber = await this.getNextSerialNumber(client, section_id);
      
      await client.query(
        `INSERT INTO student_class_history 
         (student_id, class_id, section_id, start_date, serial_number) 
         VALUES ($1, $2, $3, $4, $5)`,
        [id, class_id, section_id, transferDateValue, serialNumber]
      );

      await client.query('COMMIT');

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Student transferred successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Promote student to next class (handles fee structure change)
   * POST /api/students/:id/promote
   */
  async promote(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { class_id, section_id, promotion_date, reset_discount, force = false } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().required(),
        promotion_date: Joi.date().optional(),
        reset_discount: Joi.boolean().default(true),
        force: Joi.boolean().default(false)
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Outstanding dues are carried forward automatically: when the first
      // voucher is generated in the new class, the voucher engine detects
      // unpaid amounts across ALL class history entries and adds them as ARREARS.

      // Get current enrollment
      const activeEnrollment = await client.query(
        `SELECT sch.*, c.id as current_class_id 
         FROM student_class_history sch
         JOIN classes c ON sch.class_id = c.id
         WHERE sch.student_id = $1 AND sch.end_date IS NULL`,
        [id]
      );

      if (activeEnrollment.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student has no active enrollment to promote from', 400);
      }

      const currentClassId = activeEnrollment.rows[0].current_class_id;
      const promotionDateValue = promotion_date ? new Date(promotion_date) : new Date();

      // Capture previous individual fee so zero-fee students remain zero after promotion.
      const studentFeeResult = await client.query(
        'SELECT individual_monthly_fee FROM students WHERE id = $1',
        [id]
      );
      const previousIndividualFee = studentFeeResult.rows[0]?.individual_monthly_fee;

      // Close current class session
      await client.query(
        'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
        [promotionDateValue, activeEnrollment.rows[0].id]
      );

      // Validate new class and section
      const classCheck = await client.query(
        'SELECT id, is_active FROM classes WHERE id = $1',
        [class_id]
      );

      if (classCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Class not found', 404);
      }

      if (!classCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot promote to inactive class', 400);
      }

      const sectionCheck = await client.query(
        'SELECT id FROM sections WHERE id = $1 AND class_id = $2',
        [section_id, class_id]
      );

      if (sectionCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Section not found or does not belong to the specified class',
          404
        );
      }

      // Create new enrollment
      // Get next serial number for new section
      const serialNumber = await this.getNextSerialNumber(client, section_id);
      
      await client.query(
        `INSERT INTO student_class_history 
         (student_id, class_id, section_id, start_date, serial_number) 
         VALUES ($1, $2, $3, $4, $5)`,
        [id, class_id, section_id, promotionDateValue, serialNumber]
      );

      // Fee behavior on promotion:
      // - If student fee is exactly 0, keep them fee-free.
      // - Otherwise clear individual fee so new class fee is applied.
      if (parseFloat(previousIndividualFee) === 0) {
        await client.query(
          'UPDATE students SET individual_monthly_fee = 0 WHERE id = $1',
          [id]
        );
      } else {
        await client.query(
          'UPDATE students SET individual_monthly_fee = NULL WHERE id = $1',
          [id]
        );
      }

      // Handle discount reset if requested
      if (reset_discount) {
        await client.query(
          'DELETE FROM student_discounts WHERE student_id = $1 AND class_id = $2',
          [id, currentClassId]
        );
      }

      await client.query('COMMIT');

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Student promoted successfully. Monthly fee updated to new class fee structure.');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Permanently delete a single student and all related records
   * DELETE /api/students/:id
   */
  async deleteOne(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Check student exists
      const check = await client.query(
        'SELECT id, name FROM students WHERE id = $1',
        [id]
      );
      if (check.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student not found', 404);
      }

      const studentName = check.rows[0].name;

      // Capture active enrollment section for strength update
      const enrollmentInfo = await client.query(
        `SELECT section_id, class_id FROM student_class_history
         WHERE student_id = $1 AND end_date IS NULL`,
        [id]
      );

      // Delete in foreign-key-safe order
      const steps = [
        { name: 'ex_class_students', query: 'DELETE FROM ex_class_students WHERE student_id = $1', optional: true },
        { name: 'promotion_run_students', query: 'DELETE FROM promotion_run_students WHERE student_id = $1', optional: true },
        {
          name: 'fee_payments',
          query: `DELETE FROM fee_payments WHERE voucher_id IN (
            SELECT fv.id FROM fee_vouchers fv
            WHERE fv.student_class_history_id IN (
              SELECT sch.id FROM student_class_history sch WHERE sch.student_id = $1
            )
          )`
        },
        {
          name: 'fee_voucher_items',
          query: `DELETE FROM fee_voucher_items WHERE voucher_id IN (
            SELECT fv.id FROM fee_vouchers fv
            WHERE fv.student_class_history_id IN (
              SELECT sch.id FROM student_class_history sch WHERE sch.student_id = $1
            )
          )`
        },
        {
          name: 'fee_vouchers',
          query: `DELETE FROM fee_vouchers WHERE student_class_history_id IN (
            SELECT sch.id FROM student_class_history sch WHERE sch.student_id = $1
          )`
        },
        { name: 'student_fee_overrides', query: 'DELETE FROM student_fee_overrides WHERE student_id = $1', optional: true },
        { name: 'student_discounts',     query: 'DELETE FROM student_discounts WHERE student_id = $1',     optional: true },
        { name: 'student_class_history', query: 'DELETE FROM student_class_history WHERE student_id = $1' },
      ];

      for (const step of steps) {
        try {
          await client.query(step.query, [id]);
        } catch (err) {
          if (!step.optional) throw err;
        }
      }

      // Delete the student record (cascades to student_guardians, student_documents)
      await client.query('DELETE FROM students WHERE id = $1', [id]);

      await client.query('COMMIT');

      return ApiResponse.success(
        res,
        { deletedId: id, name: studentName },
        `Student "${studentName}" permanently deleted`
      );
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Bulk create students with flexible field support
   * POST /api/students/bulk
   * 
   * Accepts CSV with 3 header rows (automatically skipped by frontend)
   * Core Required fields: Name, Father Name
   * Optional fields: Sr No, Contact No, Fee, and any other custom fields
   */
  async bulkCreate(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      console.log('📥 Received bulk create request:', {
        body: req.body,
        keys: Object.keys(req.body),
        bodyType: typeof req.body
      })

      // Handle both formats: {students: [...]} and direct array [...]
      let students = req.body;
      if (req.body && req.body.students && Array.isArray(req.body.students)) {
        students = req.body.students;
      }

      console.log('📊 Processing students:', {
        isArray: Array.isArray(students),
        count: Array.isArray(students) ? students.length : 0,
        firstStudent: Array.isArray(students) && students.length > 0 ? students[0] : null
      })

      // Validate input
      if (!Array.isArray(students) || students.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Invalid input: expected array of students', 400);
      }

      if (students.length > 1000) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Too many students: maximum 1000 allowed per batch', 400);
      }

      // Flexible validation - Updated for new CSV structure: Sr No, Name, Father Name, Father's Contact Number, Fee
      const schema = Joi.object({
        // Core fields from new CSV structure
        srNo: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow('', null),
        name: Joi.string().required(), // Required
        fatherName: Joi.string().optional().allow('', null), // Optional (may be blank)
        fatherContactNo: Joi.string().optional().allow('', null), // Father's contact number
        monthlyFee: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow('', null), // Individual monthly fee
        
        // System fields
        classId: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow('', null),
        sectionId: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow('', null),
        
        // Legacy/optional fields for compatibility
        contactNo: Joi.string().optional().allow('', null), // Fallback for contact
        fee: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow('', null), // Legacy fee field
        firstName: Joi.string().optional().allow('', null),
        lastName: Joi.string().optional().allow('', null),
        email: Joi.string().optional().allow('', null),
        phone: Joi.string().optional().allow('', null),
        rollNumber: Joi.string().optional().allow('', null),
        address: Joi.string().optional().allow('', null),
        dateOfBirth: Joi.alternatives().try(Joi.date(), Joi.string()).optional().allow('', null),
        
        // Raw data and other fields
        otherFields: Joi.string().optional().allow('', null),
        _rawData: Joi.object().optional().unknown(true),
        id: Joi.number().optional(), // Internal ID for grid
        
        // Allow any additional fields without validation
      }).unknown(true);

      const validatedStudents = [];
      const errors = [];
      const warnings = [];

      console.log('📥 Bulk create received', students.length, 'students');
      console.log('📋 First student received:', students[0]);

      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const { error, value } = schema.validate(student, { stripUnknown: false });
        
        if (error) {
          errors.push({
            row: i + 1,
            errors: error.details.map(d => d.message)
          });
          continue;
        }

        // Build student name - REQUIRED
        let studentName = value.name || '';
        if (!studentName && (value.firstName || value.lastName)) {
          studentName = `${value.firstName || ''} ${value.lastName || ''}`.trim();
        }
        
        if (!studentName) {
          errors.push({
            row: i + 1,
            errors: ['Name is required']
          });
          continue;
        }

        // Father name - extract from various possible fields
        const fatherName = value.fatherName || value.father_name || '';

        // Use provided class/section or defaults
        const classId = parseInt(value.classId) || 1; // Default class
        const sectionId = parseInt(value.sectionId) || 1; // Default section

        // Generate roll number from Sr No (CSV sequence) or auto-generate
        let rollNo = value.srNo || value.rollNumber || null;
        if (rollNo) {
          // Use Sr No from CSV as roll number to maintain sequence
          rollNo = String(rollNo).padStart(3, '0'); // Format as 001, 002, etc.
        } else {
          rollNo = `STD-${Date.now()}-${i}`; // Auto-generation fallback
          warnings.push({
            row: i + 1,
            message: 'Roll number auto-generated (Sr No not provided)'
          });
        }

        // Extract phone from new structure: fatherContactNo, then fallbacks
        const phone = value.fatherContactNo || value.contactNo || value.phone || null;
        
        // Extract individual monthly fee (can be different from class fee structure)
        const individualMonthlyFee = value.monthlyFee || value.fee || null;
        let monthlyFeeAmount = null;
        if (individualMonthlyFee) {
          monthlyFeeAmount = parseFloat(individualMonthlyFee) || null;
        }

        // Log first student for debugging
        if (i === 0) {
          console.log('🔍 First student RECEIVED from frontend:', {
            rawFields: Object.keys(value),
            name: value.name,
            fatherName: value.fatherName,
            fatherContactNo: value.fatherContactNo,
            monthlyFee: value.monthlyFee,
            srNo: value.srNo
          });
          console.log('🔍 First student EXTRACTED for database:', {
            name: studentName,
            father_name: fatherName,
            phone: phone,
            individual_monthly_fee: monthlyFeeAmount,
            roll_no: rollNo
          });
        }

        // Parse raw data for additional fields
        let additionalFields = {};
        if (value._rawData) {
          additionalFields = { ...value._rawData };
        }
        if (value.otherFields) {
          try {
            const parsed = JSON.parse(value.otherFields);
            additionalFields = { ...additionalFields, ...parsed };
          } catch (e) {
            // Ignore parse errors
          }
        }

        validatedStudents.push({
          name: studentName,
          father_name: fatherName,
          roll_no: String(rollNo),
          phone: phone,
          email: value.email || null,
          address: value.address || null,
          class_id: classId,
          section_id: sectionId,
          date_of_birth: value.dateOfBirth || null,
          individual_monthly_fee: monthlyFeeAmount, // Store individual monthly fee
          admission_date: value.admissionDate || new Date(),
          // Store any additional fields as JSON
          additional_info: Object.keys(additionalFields).length > 0 
            ? JSON.stringify(additionalFields) 
            : null
        });
      }

      if (errors.length > 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Validation failed', 400, { 
          validationErrors: errors,
          warnings: warnings
        });
      }

      // Skip all duplicate checks and validations - just proceed
      console.log('📝 Proceeding with validation-free import of', validatedStudents.length, 'students');
      
      // Use first student's class/section or defaults
      const targetClassId = validatedStudents[0].class_id || 1;
      const targetSectionId = validatedStudents[0].section_id || 1;

      // Auto-generate unique roll numbers for all students
      // Insert all students without validation - duplicates allowed
      const insertedStudents = [];

      for (let i = 0; i < validatedStudents.length; i++) {
        const student = validatedStudents[i];
        
        // Auto-generate roll_no if not provided
        if (!student.roll_no) {
          student.roll_no = `AUTO-${Date.now()}-${i}`;
        }

        // Log what we're about to insert (first student only)
        if (i === 0) {
          console.log('💾 Inserting first student into database:', {
            name: student.name,
            roll_no: student.roll_no,
            phone: student.phone,
            father_name: student.father_name,
            individual_monthly_fee: student.individual_monthly_fee
          });
        }

        const insertResult = await client.query(
          `INSERT INTO students (
            name, roll_no, phone, address, email, father_name,
            date_of_birth, bay_form, caste, previous_school, is_bulk_imported, individual_monthly_fee
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)
          RETURNING id, name, roll_no, phone, email, father_name, individual_monthly_fee`,
          [
            student.name,
            student.roll_no,
            student.phone,
            student.address,
            student.email,
            student.father_name,
            student.date_of_birth,
            student.bay_form,
            student.caste,
            student.previous_school,
            student.individual_monthly_fee // Individual monthly fee from CSV
          ]
        );
        
        // Verify phone was saved (first student only)
        if (i === 0) {
          console.log('✅ First student saved to database:', {
            id: insertResult.rows[0].id,
            name: insertResult.rows[0].name,
            phone: insertResult.rows[0].phone,
            father_name: insertResult.rows[0].father_name
          });
        }

        const newStudent = insertResult.rows[0];
        insertedStudents.push(newStudent);

        // Enroll in the target class with auto-assigned serial number
        // Get next serial number for this section
        const serialNumber = await this.getNextSerialNumber(client, targetSectionId);
        
        await client.query(
          `INSERT INTO student_class_history (student_id, class_id, section_id, start_date, serial_number)
           VALUES ($1, $2, $3, $4, $5)`,
          [newStudent.id, targetClassId, targetSectionId, student.admission_date || new Date(), serialNumber]
        );
      }

      await client.query('COMMIT');
      
      return ApiResponse.success(res, {
        successCount: insertedStudents.length,
        students: insertedStudents,
        classId: targetClassId,
        sectionId: targetSectionId,
        warnings: warnings.length > 0 ? warnings : undefined
      }, `Successfully imported ${insertedStudents.length} student(s)`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Bulk import error:', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Bulk update existing students with missing data (phone, fee, etc.)
   * POST /api/students/bulk-update
   * 
   * Matches students by name within a class/section and updates their data
   * CSV format: Sr No, Name, Father Name, Father's Contact Number, Fee
   */
  async bulkUpdate(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      console.log('📝 Bulk update request received:', {
        bodyKeys: Object.keys(req.body),
        hasStudents: !!req.body.students,
        studentsCount: Array.isArray(req.body.students) ? req.body.students.length : 0
      });

      // Handle both formats: { students: [...], class_id, section_id } and { students: [...] }
      let students = req.body.students || req.body;
      const classId = parseInt(req.body.class_id) || parseInt(req.body.classId);
      const sectionId = parseInt(req.body.section_id) || parseInt(req.body.sectionId);

      if (!Array.isArray(students) || students.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Invalid input: expected array of students', 400);
      }

      // Class ID is now optional - if not provided, search across all classes
      if (classId) {
        console.log(`📊 SMART UPDATE: Processing ${students.length} students. Searching across all classes, preferring class ${classId}${sectionId ? `, section ${sectionId}` : ''}`);
      } else {
        console.log(`📊 SMART UPDATE: Processing ${students.length} students. Searching across ALL classes and sections`);
      }

      const updatedStudents = [];
      const notFoundStudents = [];
      const errors = [];

      for (let i = 0; i < students.length; i++) {
        const studentData = students[i];
        const studentName = studentData.name || '';
        const srNo = studentData.srNo || studentData.roll_no || '';
        const fatherName = studentData.fatherName || studentData.father_name || '';
        const fatherContactNo = studentData.fatherContactNo || studentData.phone || '';
        const monthlyFee = parseFloat(studentData.monthlyFee || studentData.individual_monthly_fee || studentData.fee) || null;

        // Log first student to see what data is being extracted
        if (i === 0) {
          console.log('\ud83d\udce6 FIRST STUDENT DATA EXTRACTION:', {
            name: studentName,
            fatherName: fatherName,
            fatherContactNo: fatherContactNo,
            monthlyFee: monthlyFee,
            rawData: studentData
          });
        }

        if (!studentName) {
          errors.push({ row: i + 1, message: 'Missing student name' });
          continue;
        }

        // SMART SEARCH: Find student anywhere in the database by name
        // First try in specified class/section (if provided), then search everywhere
        let findQuery = `
          SELECT s.id, s.name, s.roll_no, s.phone, s.father_name, s.individual_monthly_fee,
                 sch.class_id, sch.section_id, c.name as class_name, sec.name as section_name
          FROM students s
          JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
          JOIN classes c ON sch.class_id = c.id
          JOIN sections sec ON sch.section_id = sec.id
          WHERE s.is_active = true
            AND LOWER(TRIM(s.name)) = LOWER(TRIM($1))
        `;
        let findParams = [studentName];

        // If class/section provided, prefer students in that class (but don't restrict to it)
        if (classId) {
          findQuery += ` ORDER BY CASE WHEN sch.class_id = $2 THEN 0 ELSE 1 END`;
          findParams.push(classId);
          if (sectionId) {
            findQuery += `, CASE WHEN sch.section_id = $3 THEN 0 ELSE 1 END`;
            findParams.push(sectionId);
          }
        }
        findQuery += ` LIMIT 1`;

        const findResult = await client.query(findQuery, findParams);

        if (findResult.rows.length === 0) {
          notFoundStudents.push({
            row: i + 1,
            name: studentName,
            srNo: srNo,
            fatherName: fatherName
          });
          continue;
        }

        const existingStudent = findResult.rows[0];

        // Build update query - only update fields that are provided AND different
        const updates = [];
        const updateParams = [];
        let paramIndex = 1;

        // Update father_name if provided and different
        if (fatherName && fatherName !== existingStudent.father_name) {
          updates.push(`father_name = $${paramIndex++}`);
          updateParams.push(fatherName);
        }

        // Update phone if provided and different
        if (fatherContactNo && fatherContactNo !== existingStudent.phone) {
          updates.push(`phone = $${paramIndex++}`);
          updateParams.push(fatherContactNo);
          if (i === 0) console.log(`\u260e\ufe0f Updating phone: "${existingStudent.phone}" \u2192 "${fatherContactNo}"`);
        }

        // Update individual_monthly_fee if provided and different
        if (monthlyFee !== null && monthlyFee !== parseFloat(existingStudent.individual_monthly_fee)) {
          updates.push(`individual_monthly_fee = $${paramIndex++}`);
          updateParams.push(monthlyFee);
          if (i === 0) console.log(`\ud83d\udcb5 Updating fee: "${existingStudent.individual_monthly_fee}" \u2192 "${monthlyFee}"`);
        }

        // Update roll_no if provided and different
        if (srNo && srNo !== existingStudent.roll_no) {
          // Format roll_no with leading zeros
          const formattedRollNo = String(srNo).padStart(3, '0');
          if (formattedRollNo !== existingStudent.roll_no) {
            updates.push(`roll_no = $${paramIndex++}`);
            updateParams.push(formattedRollNo);
          }
        }

        if (updates.length === 0) {
          // No updates needed, but still count as processed
          updatedStudents.push({
            id: existingStudent.id,
            name: existingStudent.name,
            class_name: existingStudent.class_name,
            section_name: existingStudent.section_name,
            status: 'no_changes'
          });
          continue;
        }

        // Perform the update
        updateParams.push(existingStudent.id);
        const updateQuery = `
          UPDATE students 
          SET ${updates.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING id, name, roll_no, phone, father_name, individual_monthly_fee
        `;

        const updateResult = await client.query(updateQuery, updateParams);
        
        if (i === 0 || i === students.length - 1) {
          console.log(`✅ Updated student ${existingStudent.name} in ${existingStudent.class_name} - ${existingStudent.section_name}:`, updateResult.rows[0]);
        }

        updatedStudents.push({
          id: updateResult.rows[0].id,
          name: updateResult.rows[0].name,
          roll_no: updateResult.rows[0].roll_no,
          phone: updateResult.rows[0].phone,
          father_name: updateResult.rows[0].father_name,
          individual_monthly_fee: updateResult.rows[0].individual_monthly_fee,
          class_name: existingStudent.class_name,
          section_name: existingStudent.section_name,
          status: 'updated'
        });
      }

      await client.query('COMMIT');

      const actuallyUpdated = updatedStudents.filter(s => s.status === 'updated').length;
      const noChanges = updatedStudents.filter(s => s.status === 'no_changes').length;

      console.log(`📊 Bulk update complete:`, {
        total: students.length,
        updated: actuallyUpdated,
        noChanges: noChanges,
        notFound: notFoundStudents.length,
        errors: errors.length
      });

      return ApiResponse.success(res, {
        totalProcessed: students.length,
        updatedCount: actuallyUpdated,
        noChangesCount: noChanges,
        notFoundCount: notFoundStudents.length,
        errorCount: errors.length,
        updatedStudents: updatedStudents.filter(s => s.status === 'updated'),
        notFoundStudents: notFoundStudents,
        errors: errors.length > 0 ? errors : undefined
      }, `Successfully updated ${actuallyUpdated} student(s). ${notFoundStudents.length} not found.`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Bulk update error:', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Bulk deactivate all students (clear admission list)
   * POST /api/students/bulk-deactivate
   */
  async bulkDeactivate(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get count of currently active students
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM students WHERE is_active = true'
      );
      const activeCount = parseInt(countResult.rows[0].count);

      if (activeCount === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.success(res, {
          deactivatedCount: 0,
          message: 'No active students found to deactivate'
        }, 'No students were deactivated');
      }

      // Deactivate all active students
      const result = await client.query(
        `UPDATE students 
         SET is_active = false
         WHERE is_active = true 
         RETURNING id, name`
      );

      await client.query('COMMIT');

      return ApiResponse.success(res, {
        deactivatedCount: result.rows.length,
        deactivatedStudents: result.rows
      }, `Successfully deactivated ${result.rows.length} student(s) from admission list`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Bulk deactivate error:', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Bulk delete students permanently from database with full power
   * POST /api/students/bulk-delete
   * Body: { student_ids: [1, 2, 3, ...] }
   * Handles all edge cases - from single table to full multi-table students
   */
  async bulkDelete(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      console.log('🗑️ Starting bulk delete operation...');

      const { student_identifiers, class_id, section_id } = req.body;

      // Validate input
      if (!Array.isArray(student_identifiers) || student_identifiers.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'student_identifiers must be a non-empty array', 400);
      }

      if (!class_id) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'class_id is required for context validation', 400);
      }

      console.log('🔍 Processing deletion for students in class:', class_id, 'section:', section_id);
      console.log('📋 Student identifiers:', student_identifiers);

      // Build query to find students by name/roll_no in the specific class/section
      let studentQuery = `
        SELECT DISTINCT s.id, s.name, s.roll_no, s.phone,
               sch.class_id, sch.section_id,
               c.name as class_name, sec.name as section_name
        FROM students s
        JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
        LEFT JOIN classes c ON sch.class_id = c.id
        LEFT JOIN sections sec ON sch.section_id = sec.id
        WHERE sch.class_id = $1`;

      let queryParams = [class_id];
      let paramIndex = 2;

      // Add section filter if provided
      if (section_id) {
        studentQuery += ` AND sch.section_id = $${paramIndex}`;
        queryParams.push(section_id);
        paramIndex++;
      }

      // Add condition to match student identifiers
      const identifierConditions = student_identifiers.map((_, index) => {
        const nameParam = paramIndex++;
        const rollParam = paramIndex++;
        const phoneParam = paramIndex++;
        return `(s.name = $${nameParam} AND COALESCE(s.roll_no, '') = COALESCE($${rollParam}, '') AND COALESCE(s.phone, '') = COALESCE($${phoneParam}, ''))`;
      });

      if (identifierConditions.length > 0) {
        studentQuery += ` AND (${identifierConditions.join(' OR ')})`;
        
        // Add parameters for each student identifier
        student_identifiers.forEach(identifier => {
          queryParams.push(identifier.name, identifier.roll_no || '', identifier.phone || '');
        });
      }

      // Get student details that match the criteria
      const studentsToDelete = await client.query(studentQuery, queryParams);

      const existingStudentIds = studentsToDelete.rows.map(s => s.id);
      console.log(`📊 Found ${existingStudentIds.length} matching students out of ${student_identifiers.length} requested`);

      if (existingStudentIds.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.success(res, {
          deletedCount: 0,
          message: 'No students found matching the provided identifiers in this class/section'
        }, 'No students were deleted');
      }

      // Log what we found for verification
      studentsToDelete.rows.forEach(student => {
        console.log(`✅ Found: ${student.name} (Roll: ${student.roll_no}) in ${student.class_name}-${student.section_name}`);
      });

      // Group students by class and section for strength updates
      const classUpdates = {};
      studentsToDelete.rows.forEach(student => {
        if (student.class_id && student.section_id) {
          const key = `${student.class_id}-${student.section_id}`;
          if (!classUpdates[key]) {
            classUpdates[key] = {
              class_id: student.class_id,
              section_id: student.section_id,
              count: 0
            };
          }
          classUpdates[key].count++;
        }
      });

      console.log('📋 Class updates to perform:', classUpdates);

      // PHASE 1: Delete from all possible related tables
      // Order matters for foreign key constraints
      const deletionSteps = [
        {
          name: 'ex_class_students',
          query: 'DELETE FROM ex_class_students WHERE student_id = ANY($1::int[])',
          optional: true
        },
        {
          name: 'promotion_run_students',
          query: 'DELETE FROM promotion_run_students WHERE student_id = ANY($1::int[])',
          optional: true
        },
        {
          name: 'fee_payments (via fee_vouchers)',
          query: `DELETE FROM fee_payments WHERE voucher_id IN (
            SELECT fv.id FROM fee_vouchers fv 
            WHERE fv.student_class_history_id IN (
              SELECT sch.id FROM student_class_history sch WHERE sch.student_id = ANY($1::int[])
            )
          )`
        },
        {
          name: 'fee_voucher_items',
          query: `DELETE FROM fee_voucher_items WHERE voucher_id IN (
            SELECT fv.id FROM fee_vouchers fv 
            WHERE fv.student_class_history_id IN (
              SELECT sch.id FROM student_class_history sch WHERE sch.student_id = ANY($1::int[])
            )
          )`
        },
        {
          name: 'fee_vouchers',
          query: `DELETE FROM fee_vouchers WHERE student_class_history_id IN (
            SELECT sch.id FROM student_class_history sch WHERE sch.student_id = ANY($1::int[])
          )`
        },
        {
          name: 'salary_payments (if student-related)',
          query: `DELETE FROM salary_payments WHERE faculty_id IN (
            SELECT f.id FROM faculty f WHERE f.student_id = ANY($1::int[])
          )`,
          optional: true
        },
        {
          name: 'student_documents',
          query: 'DELETE FROM student_documents WHERE student_id = ANY($1::int[])',
          optional: true
        },
        {
          name: 'student_fee_overrides',
          query: 'DELETE FROM student_fee_overrides WHERE student_id = ANY($1::int[])'
        },
        {
          name: 'student_discounts',
          query: 'DELETE FROM student_discounts WHERE student_id = ANY($1::int[])'
        },
        {
          name: 'student_guardians',
          query: 'DELETE FROM student_guardians WHERE student_id = ANY($1::int[])'
        },
        {
          name: 'student_class_history',
          query: 'DELETE FROM student_class_history WHERE student_id = ANY($1::int[])'
        },
        {
          name: 'attendance_records',
          query: 'DELETE FROM attendance_records WHERE student_id = ANY($1::int[])',
          optional: true
        },
        {
          name: 'exam_results',
          query: 'DELETE FROM exam_results WHERE student_id = ANY($1::int[])',
          optional: true
        },
        {
          name: 'student_assignments',
          query: 'DELETE FROM student_assignments WHERE student_id = ANY($1::int[])',
          optional: true
        },
        {
          name: 'library_records',
          query: 'DELETE FROM library_records WHERE student_id = ANY($1::int[])',
          optional: true
        }
      ];

      // Execute all deletion steps
      for (const step of deletionSteps) {
        try {
          const result = await client.query(step.query, [existingStudentIds]);
          console.log(`✅ ${step.name}: Deleted ${result.rowCount || 0} records`);
        } catch (error) {
          if (step.optional) {
            console.log(`⚠️  ${step.name}: Table may not exist or no records (${error.message})`);
          } else {
            console.error(`❌ ${step.name}: Failed -`, error.message);
            throw error; // Re-throw non-optional errors
          }
        }
      }

      // PHASE 2: Delete the main student records
      console.log('🎯 Deleting main student records...');
      const deleteResult = await client.query(
        'DELETE FROM students WHERE id = ANY($1::int[]) RETURNING id, name, roll_no',
        [existingStudentIds]
      );

      console.log(`✅ Deleted ${deleteResult.rows.length} student records`);

      // PHASE 3: Update class strength for affected sections
      console.log('📊 Updating class strengths...');
      for (const update of Object.values(classUpdates)) {
        try {
          const strengthResult = await client.query(
            `UPDATE sections 
             SET current_strength = GREATEST(0, current_strength - $1)
             WHERE id = $2 AND class_id = $3
             RETURNING current_strength`,
            [update.count, update.section_id, update.class_id]
          );
          
          if (strengthResult.rows.length > 0) {
            console.log(`📉 Updated section ${update.section_id} strength: -${update.count} (new: ${strengthResult.rows[0].current_strength})`);
          }
        } catch (error) {
          console.error(`⚠️  Failed to update strength for section ${update.section_id}:`, error.message);
          // Don't fail the whole operation for strength update issues
        }
      }

      await client.query('COMMIT');
      console.log('✅ Bulk delete completed successfully');

      return ApiResponse.success(res, {
        deletedCount: deleteResult.rows.length,
        deletedStudents: deleteResult.rows,
        classUpdates: Object.values(classUpdates),
        matchedStudents: studentsToDelete.rows.length,
        requestedCount: student_identifiers.length
      }, `Successfully deleted ${deleteResult.rows.length} student(s) from class/section and updated class strength`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Bulk delete error:', {
        message: error.message,
        stack: error.stack,
        requestBody: req.body
      });
      
      // Return detailed error for debugging
      return ApiResponse.error(res, 
        `Deletion failed: ${error.message}`, 
        500,
        { 
          error: error.message,
          requestedIdentifiers: req.body.student_identifiers,
          context: { class_id, section_id },
          hint: 'Check server logs for detailed error information'
        }
      );
    } finally {
      client.release();
    }
  }
}

module.exports = new StudentsController();
