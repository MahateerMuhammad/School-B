const pool = require('../config/db');
const Joi = require('joi');
const ApiResponse = require('../utils/response');
const { sortSchoolClasses, sortCollegeClasses } = require('../utils/classSequence');

class PromotionsController {
  constructor() {
    this.fullSchoolPromotion = this.fullSchoolPromotion.bind(this);
    this.fullCollegePromotion = this.fullCollegePromotion.bind(this);
    this.classPromotion = this.classPromotion.bind(this);
    this.history = this.history.bind(this);
    this.undo = this.undo.bind(this);
    this.listExClasses = this.listExClasses.bind(this);
    this.getExClassBatch = this.getExClassBatch.bind(this);
  }

  async getNextSerialNumber(client, sectionId) {
    const result = await client.query(
      `SELECT COALESCE(MAX(serial_number), 0) + 1 as next_serial
       FROM student_class_history
       WHERE section_id = $1 AND end_date IS NULL`,
      [sectionId]
    );
    return parseInt(result.rows[0].next_serial, 10);
  }

  async getActiveClasses(client) {
    const result = await client.query(
      `SELECT id, name, class_type
       FROM classes
       WHERE is_active = true
       ORDER BY class_type, name`
    );
    return result.rows;
  }

  async getSectionByName(client, classId, sectionName) {
    const result = await client.query(
      `SELECT id, name, class_id, is_archived
       FROM sections
       WHERE class_id = $1 AND lower(name) = lower($2) AND is_archived = false
       LIMIT 1`,
      [classId, sectionName]
    );
    return result.rows[0] || null;
  }

  async ensureTargetSection(client, classId, sectionName) {
    const existing = await this.getSectionByName(client, classId, sectionName);
    if (existing) {
      return {
        ...existing,
        created: false,
      };
    }

    const created = await client.query(
      `INSERT INTO sections (class_id, name, is_archived)
       VALUES ($1, $2, false)
       RETURNING id, name, class_id, is_archived`,
      [classId, sectionName]
    );
    return {
      ...created.rows[0],
      created: true,
    };
  }

  async archiveSectionIfEmpty(client, sectionId) {
    const activeCount = await client.query(
      `SELECT COUNT(*)::int as count
       FROM student_class_history
       WHERE section_id = $1 AND end_date IS NULL`,
      [sectionId]
    );

    if (activeCount.rows[0].count !== 0) {
      return;
    }

    const sectionResult = await client.query(
      `SELECT id, name, class_id, is_archived
       FROM sections
       WHERE id = $1 AND is_archived = false`,
      [sectionId]
    );

    if (sectionResult.rows.length === 0) {
      return;
    }

    const current = sectionResult.rows[0];
    const archivedName = `ARCHIVED_${current.id}_${current.name}`.slice(0, 200);

    await client.query(
      `UPDATE sections
       SET is_archived = true, name = $2
       WHERE id = $1`,
      [sectionId, archivedName]
    );

    return {
      id: current.id,
      class_id: current.class_id,
      previous_name: current.name,
      archived_name: archivedName,
    };
  }

  async appendRunMetadata(client, runId, metadataPatch) {
    await client.query(
      `UPDATE promotion_runs
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [runId, JSON.stringify(metadataPatch || {})]
    );
  }

  deriveRestoredSectionName(sectionId, currentName, fallbackName = null) {
    if (fallbackName && String(fallbackName).trim()) {
      return String(fallbackName).trim();
    }

    const archivedPrefix = `ARCHIVED_${sectionId}_`;
    if (String(currentName || '').startsWith(archivedPrefix)) {
      return String(currentName).slice(archivedPrefix.length).trim();
    }

    return String(currentName || '').trim();
  }

  async getUniqueSectionName(client, classId, preferredName, sectionIdToIgnore = null) {
    const baseName = String(preferredName || '').trim().slice(0, 200) || `Section ${sectionIdToIgnore || ''}`.trim();
    let candidate = baseName;
    let suffix = 1;

    while (true) {
      const params = [classId, candidate];
      let query =
        `SELECT id
         FROM sections
         WHERE class_id = $1 AND lower(name) = lower($2)`;

      if (sectionIdToIgnore !== null && sectionIdToIgnore !== undefined) {
        params.push(sectionIdToIgnore);
        query += ` AND id <> $3`;
      }

      query += ` LIMIT 1`;

      const conflict = await client.query(query, params);
      if (conflict.rows.length === 0) {
        return candidate;
      }

      suffix += 1;
      const label = ` (Restored ${suffix})`;
      candidate = `${baseName.slice(0, Math.max(0, 200 - label.length))}${label}`;
    }
  }

  async restoreSectionFromArchive(client, sectionId, preferredPreviousName = null) {
    const sectionResult = await client.query(
      `SELECT id, class_id, name, is_archived
       FROM sections
       WHERE id = $1
       LIMIT 1`,
      [sectionId]
    );

    if (sectionResult.rows.length === 0) {
      return null;
    }

    const section = sectionResult.rows[0];
    const restoredBaseName = this.deriveRestoredSectionName(section.id, section.name, preferredPreviousName);
    const safeName = await this.getUniqueSectionName(client, section.class_id, restoredBaseName, section.id);

    await client.query(
      `UPDATE sections
       SET is_archived = false, name = $2
       WHERE id = $1`,
      [section.id, safeName]
    );

    return {
      id: section.id,
      class_id: section.class_id,
      restored_name: safeName,
      was_archived: section.is_archived,
    };
  }

  async createRunHeader(client, { promotionType, promotionDate, initiatedBy, metadata }) {
    const runResult = await client.query(
      `INSERT INTO promotion_runs (promotion_type, promotion_date, initiated_by, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [promotionType, promotionDate, initiatedBy || null, metadata || {}]
    );
    return runResult.rows[0];
  }

  async finalizeRunSummary(client, runId, summary) {
    await client.query(
      `UPDATE promotion_runs
       SET summary = $2
       WHERE id = $1`,
      [runId, summary]
    );
  }

  async getActiveEnrollmentsByClass(client, classId, sectionIds = null) {
    const params = [classId];
    let query = `
      SELECT
        sch.id as enrollment_id,
        sch.student_id,
        sch.class_id as old_class_id,
        sch.section_id as old_section_id,
        sec.name as old_section_name,
        s.name as student_name,
        s.father_name,
        s.roll_no,
        s.phone,
        s.individual_monthly_fee
      FROM student_class_history sch
      JOIN students s ON s.id = sch.student_id
      JOIN sections sec ON sec.id = sch.section_id
      WHERE sch.class_id = $1
        AND sch.end_date IS NULL
        AND s.is_active = true
        AND s.is_expelled = false
    `;

    if (Array.isArray(sectionIds) && sectionIds.length > 0) {
      params.push(sectionIds);
      query += ` AND sch.section_id = ANY($2::bigint[])`;
    }

    query += ` ORDER BY sch.section_id, sch.student_id`;
    const result = await client.query(query, params);
    return result.rows;
  }

  async insertRunStudent(client, payload) {
    await client.query(
      `INSERT INTO promotion_run_students (
         promotion_run_id, student_id, old_enrollment_id, new_enrollment_id,
         action_type, old_class_id, old_section_id, new_class_id, new_section_id,
         previous_individual_monthly_fee
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        payload.promotion_run_id,
        payload.student_id,
        payload.old_enrollment_id,
        payload.new_enrollment_id || null,
        payload.action_type,
        payload.old_class_id,
        payload.old_section_id,
        payload.new_class_id || null,
        payload.new_section_id || null,
        payload.previous_individual_monthly_fee,
      ]
    );
  }

  async createExBatch(client, payload) {
    const batchResult = await client.query(
      `INSERT INTO ex_class_batches (
         promotion_run_id, class_id, section_id, class_name, section_name, batch_month, batch_year, locked
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       RETURNING id`,
      [
        payload.promotion_run_id,
        payload.class_id,
        payload.section_id,
        payload.class_name,
        payload.section_name,
        payload.batch_month,
        payload.batch_year,
      ]
    );
    return batchResult.rows[0].id;
  }

  async appendExStudent(client, batchId, student) {
    await client.query(
      `INSERT INTO ex_class_students (
         ex_class_batch_id, student_id, student_name, father_name, roll_no, phone
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (ex_class_batch_id, student_id) DO NOTHING`,
      [batchId, student.student_id, student.student_name, student.father_name, student.roll_no, student.phone]
    );
  }

  async fullSchoolPromotion(req, res, next) {
    const client = await pool.connect();
    try {
      const schema = Joi.object({
        promotion_date: Joi.date().optional(),
      });
      const { error, value } = schema.validate(req.body || {});
      if (error) return ApiResponse.error(res, error.details[0].message, 400);

      const promotionDate = value.promotion_date ? new Date(value.promotion_date) : new Date();
      const batchMonth = promotionDate.getMonth() + 1;
      const batchYear = promotionDate.getFullYear();

      await client.query('BEGIN');

      const classes = await this.getActiveClasses(client);
      const schoolClasses = sortSchoolClasses(classes.filter((c) => c.class_type === 'SCHOOL'));

      if (schoolClasses.length < 2) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'At least two active school classes are required for full school promotion.', 400);
      }

      const run = await this.createRunHeader(client, {
        promotionType: 'FULL_SCHOOL',
        promotionDate,
        initiatedBy: req.user?.id,
        metadata: {
          trigger: 'full_school',
          class_chain: schoolClasses.map((c) => ({ id: c.id, name: c.name })),
        },
      });

      let promotedCount = 0;
      let archivedCount = 0;
      let sectionArchivedCount = 0;
      const terminalClass = schoolClasses[schoolClasses.length - 1];
      const createdTargetSections = new Map();
      const archivedSourceSections = new Map();

      const exBatchMap = new Map();

      for (let i = 0; i < schoolClasses.length; i++) {
        const sourceClass = schoolClasses[i];
        const enrollments = await this.getActiveEnrollmentsByClass(client, sourceClass.id);
        if (enrollments.length === 0) continue;

        const sourceSections = new Set();

        if (i === schoolClasses.length - 1) {
          for (const student of enrollments) {
            sourceSections.add(student.old_section_id);

            await client.query(
              'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
              [promotionDate, student.enrollment_id]
            );

            await this.insertRunStudent(client, {
              promotion_run_id: run.id,
              student_id: student.student_id,
              old_enrollment_id: student.enrollment_id,
              new_enrollment_id: null,
              action_type: 'ARCHIVED',
              old_class_id: student.old_class_id,
              old_section_id: student.old_section_id,
              previous_individual_monthly_fee: student.individual_monthly_fee,
            });

            const exKey = `${student.old_class_id}:${student.old_section_id}`;
            if (!exBatchMap.has(exKey)) {
              const batchId = await this.createExBatch(client, {
                promotion_run_id: run.id,
                class_id: student.old_class_id,
                section_id: student.old_section_id,
                class_name: sourceClass.name,
                section_name: student.old_section_name,
                batch_month: batchMonth,
                batch_year: batchYear,
              });
              exBatchMap.set(exKey, batchId);
            }

            await this.appendExStudent(client, exBatchMap.get(exKey), student);
            archivedCount += 1;
          }
        } else {
          const targetClass = schoolClasses[i + 1];

          for (const student of enrollments) {
            sourceSections.add(student.old_section_id);

            const targetSection = await this.ensureTargetSection(client, targetClass.id, student.old_section_name);
            if (targetSection.created && !createdTargetSections.has(targetSection.id)) {
              createdTargetSections.set(targetSection.id, {
                id: targetSection.id,
                class_id: targetSection.class_id,
                name: targetSection.name,
              });
            }

            await client.query(
              'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
              [promotionDate, student.enrollment_id]
            );

            const serial = await this.getNextSerialNumber(client, targetSection.id);
            const newEnrollment = await client.query(
              `INSERT INTO student_class_history (student_id, class_id, section_id, start_date, serial_number)
               VALUES ($1,$2,$3,$4,$5)
               RETURNING id`,
              [student.student_id, targetClass.id, targetSection.id, promotionDate, serial]
            );

            if (parseFloat(student.individual_monthly_fee) === 0) {
              await client.query('UPDATE students SET individual_monthly_fee = 0 WHERE id = $1', [student.student_id]);
            } else {
              await client.query('UPDATE students SET individual_monthly_fee = NULL WHERE id = $1', [student.student_id]);
            }

            await this.insertRunStudent(client, {
              promotion_run_id: run.id,
              student_id: student.student_id,
              old_enrollment_id: student.enrollment_id,
              new_enrollment_id: newEnrollment.rows[0].id,
              action_type: 'PROMOTED',
              old_class_id: student.old_class_id,
              old_section_id: student.old_section_id,
              new_class_id: targetClass.id,
              new_section_id: targetSection.id,
              previous_individual_monthly_fee: student.individual_monthly_fee,
            });

            promotedCount += 1;
          }
        }

        for (const sourceSectionId of sourceSections) {
          const archivedSnapshot = await this.archiveSectionIfEmpty(client, sourceSectionId);
          if (archivedSnapshot) {
            sectionArchivedCount += 1;
            archivedSourceSections.set(sourceSectionId, archivedSnapshot);
          }
        }
      }

      await this.appendRunMetadata(client, run.id, {
        section_state: {
          created_target_sections: [...createdTargetSections.values()],
          archived_source_sections: [...archivedSourceSections.values()],
        },
      });

      await this.finalizeRunSummary(client, run.id, {
        promoted_students: promotedCount,
        archived_students: archivedCount,
        archived_sections: sectionArchivedCount,
        terminal_class: terminalClass?.name || null,
      });

      await client.query('COMMIT');

      return ApiResponse.success(res, {
        run_id: run.id,
        promoted_students: promotedCount,
        archived_students: archivedCount,
        archived_sections: sectionArchivedCount,
      }, 'Full school promotion completed successfully');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  }

  async fullCollegePromotion(req, res, next) {
    const client = await pool.connect();
    try {
      const schema = Joi.object({
        promotion_date: Joi.date().optional(),
      });
      const { error, value } = schema.validate(req.body || {});
      if (error) return ApiResponse.error(res, error.details[0].message, 400);

      const promotionDate = value.promotion_date ? new Date(value.promotion_date) : new Date();
      const batchMonth = promotionDate.getMonth() + 1;
      const batchYear = promotionDate.getFullYear();

      await client.query('BEGIN');

      const classes = await this.getActiveClasses(client);
      const collegeClasses = sortCollegeClasses(classes.filter((c) => c.class_type === 'COLLEGE'));

      const firstYear = collegeClasses.find((c) => c.__rank === 1);
      const secondYear = collegeClasses.find((c) => c.__rank === 2);

      if (!firstYear || !secondYear) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Both 1st Year and 2nd Year classes must exist and be active.', 400);
      }

      const run = await this.createRunHeader(client, {
        promotionType: 'FULL_COLLEGE',
        promotionDate,
        initiatedBy: req.user?.id,
        metadata: {
          trigger: 'full_college',
          first_year: { id: firstYear.id, name: firstYear.name },
          second_year: { id: secondYear.id, name: secondYear.name },
        },
      });

      let promotedCount = 0;
      let archivedCount = 0;
      let sectionArchivedCount = 0;
      const exBatchMap = new Map();
      const createdTargetSections = new Map();
      const archivedSourceSections = new Map();

      const secondYearEnrollments = await this.getActiveEnrollmentsByClass(client, secondYear.id);
      const firstYearEnrollments = await this.getActiveEnrollmentsByClass(client, firstYear.id);

      const touchedSections = new Set();

      for (const student of secondYearEnrollments) {
        touchedSections.add(student.old_section_id);

        await client.query(
          'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
          [promotionDate, student.enrollment_id]
        );

        await this.insertRunStudent(client, {
          promotion_run_id: run.id,
          student_id: student.student_id,
          old_enrollment_id: student.enrollment_id,
          new_enrollment_id: null,
          action_type: 'ARCHIVED',
          old_class_id: student.old_class_id,
          old_section_id: student.old_section_id,
          previous_individual_monthly_fee: student.individual_monthly_fee,
        });

        const exKey = `${student.old_class_id}:${student.old_section_id}`;
        if (!exBatchMap.has(exKey)) {
          const batchId = await this.createExBatch(client, {
            promotion_run_id: run.id,
            class_id: student.old_class_id,
            section_id: student.old_section_id,
            class_name: secondYear.name,
            section_name: student.old_section_name,
            batch_month: batchMonth,
            batch_year: batchYear,
          });
          exBatchMap.set(exKey, batchId);
        }

        await this.appendExStudent(client, exBatchMap.get(exKey), student);
        archivedCount += 1;
      }

      for (const student of firstYearEnrollments) {
        touchedSections.add(student.old_section_id);

        const targetSection = await this.ensureTargetSection(client, secondYear.id, student.old_section_name);
        if (targetSection.created && !createdTargetSections.has(targetSection.id)) {
          createdTargetSections.set(targetSection.id, {
            id: targetSection.id,
            class_id: targetSection.class_id,
            name: targetSection.name,
          });
        }

        await client.query(
          'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
          [promotionDate, student.enrollment_id]
        );

        const serial = await this.getNextSerialNumber(client, targetSection.id);
        const newEnrollment = await client.query(
          `INSERT INTO student_class_history (student_id, class_id, section_id, start_date, serial_number)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id`,
          [student.student_id, secondYear.id, targetSection.id, promotionDate, serial]
        );

        if (parseFloat(student.individual_monthly_fee) === 0) {
          await client.query('UPDATE students SET individual_monthly_fee = 0 WHERE id = $1', [student.student_id]);
        } else {
          await client.query('UPDATE students SET individual_monthly_fee = NULL WHERE id = $1', [student.student_id]);
        }

        await this.insertRunStudent(client, {
          promotion_run_id: run.id,
          student_id: student.student_id,
          old_enrollment_id: student.enrollment_id,
          new_enrollment_id: newEnrollment.rows[0].id,
          action_type: 'PROMOTED',
          old_class_id: student.old_class_id,
          old_section_id: student.old_section_id,
          new_class_id: secondYear.id,
          new_section_id: targetSection.id,
          previous_individual_monthly_fee: student.individual_monthly_fee,
        });

        promotedCount += 1;
      }

      for (const sourceSectionId of touchedSections) {
        const archivedSnapshot = await this.archiveSectionIfEmpty(client, sourceSectionId);
        if (archivedSnapshot) {
          sectionArchivedCount += 1;
          archivedSourceSections.set(sourceSectionId, archivedSnapshot);
        }
      }

      await this.appendRunMetadata(client, run.id, {
        section_state: {
          created_target_sections: [...createdTargetSections.values()],
          archived_source_sections: [...archivedSourceSections.values()],
        },
      });

      await this.finalizeRunSummary(client, run.id, {
        promoted_students: promotedCount,
        archived_students: archivedCount,
        archived_sections: sectionArchivedCount,
      });

      await client.query('COMMIT');

      return ApiResponse.success(res, {
        run_id: run.id,
        promoted_students: promotedCount,
        archived_students: archivedCount,
        archived_sections: sectionArchivedCount,
      }, 'Full college promotion completed successfully');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  }

  async classPromotion(req, res, next) {
    const client = await pool.connect();
    try {
      const schema = Joi.object({
        source_class_id: Joi.number().integer().required(),
        target_class_id: Joi.number().integer().required(),
        promotion_date: Joi.date().optional(),
        section_ids: Joi.array().items(Joi.number().integer()).optional(),
        section_rename_map: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
      });

      const { error, value } = schema.validate(req.body || {});
      if (error) return ApiResponse.error(res, error.details[0].message, 400);

      const sourceClassId = value.source_class_id;
      const targetClassId = value.target_class_id;
      const sectionIds = value.section_ids || [];
      const sectionRenameMap = value.section_rename_map || {};
      const promotionDate = value.promotion_date ? new Date(value.promotion_date) : new Date();

      if (String(sourceClassId) === String(targetClassId)) {
        return ApiResponse.error(res, 'Source and target class must be different.', 400);
      }

      await client.query('BEGIN');

      const classResult = await client.query(
        `SELECT id, name, class_type, is_active
         FROM classes
         WHERE id = ANY($1::bigint[])`,
        [[sourceClassId, targetClassId]]
      );

      if (classResult.rows.length !== 2) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Source or target class not found.', 404);
      }

      const sourceClass = classResult.rows.find((c) => String(c.id) === String(sourceClassId));
      const targetClass = classResult.rows.find((c) => String(c.id) === String(targetClassId));

      if (!targetClass.is_active) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot promote to inactive target class.', 400);
      }

      const enrollments = await this.getActiveEnrollmentsByClass(client, sourceClassId, sectionIds);
      if (enrollments.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'No active students found in selected class/sections.', 400);
      }

      const sourceSections = [...new Set(enrollments.map((e) => e.old_section_name))];
      const targetSectionsResult = await client.query(
        `SELECT id, name
         FROM sections
         WHERE class_id = $1 AND is_archived = false`,
        [targetClassId]
      );
      const targetNames = new Set(targetSectionsResult.rows.map((s) => s.name.toLowerCase()));

      const conflicts = sourceSections.filter((name) => {
        const rename = sectionRenameMap[name];
        if (rename) return false;
        return targetNames.has(String(name).toLowerCase());
      });

      if (conflicts.length > 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Section name conflicts detected. Provide section_rename_map for conflicting sections.',
          400,
          { conflicts }
        );
      }

      const run = await this.createRunHeader(client, {
        promotionType: 'CLASS',
        promotionDate,
        initiatedBy: req.user?.id,
        metadata: {
          trigger: 'class',
          source_class: { id: sourceClass.id, name: sourceClass.name },
          target_class: { id: targetClass.id, name: targetClass.name },
          sections: sectionIds,
          section_rename_map: sectionRenameMap,
        },
      });

      let promotedCount = 0;
      let sectionArchivedCount = 0;
      const touchedSections = new Set();
      const createdTargetSections = new Map();
      const archivedSourceSections = new Map();

      for (const student of enrollments) {
        touchedSections.add(student.old_section_id);

        const requestedName = sectionRenameMap[student.old_section_name] || student.old_section_name;
        const targetSection = await this.ensureTargetSection(client, targetClassId, requestedName);
        if (targetSection.created && !createdTargetSections.has(targetSection.id)) {
          createdTargetSections.set(targetSection.id, {
            id: targetSection.id,
            class_id: targetSection.class_id,
            name: targetSection.name,
          });
        }

        await client.query(
          'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
          [promotionDate, student.enrollment_id]
        );

        const serial = await this.getNextSerialNumber(client, targetSection.id);
        const newEnrollment = await client.query(
          `INSERT INTO student_class_history (student_id, class_id, section_id, start_date, serial_number)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id`,
          [student.student_id, targetClassId, targetSection.id, promotionDate, serial]
        );

        if (parseFloat(student.individual_monthly_fee) === 0) {
          await client.query('UPDATE students SET individual_monthly_fee = 0 WHERE id = $1', [student.student_id]);
        } else {
          await client.query('UPDATE students SET individual_monthly_fee = NULL WHERE id = $1', [student.student_id]);
        }

        await this.insertRunStudent(client, {
          promotion_run_id: run.id,
          student_id: student.student_id,
          old_enrollment_id: student.enrollment_id,
          new_enrollment_id: newEnrollment.rows[0].id,
          action_type: 'PROMOTED',
          old_class_id: student.old_class_id,
          old_section_id: student.old_section_id,
          new_class_id: targetClassId,
          new_section_id: targetSection.id,
          previous_individual_monthly_fee: student.individual_monthly_fee,
        });

        promotedCount += 1;
      }

      for (const sourceSectionId of touchedSections) {
        const archivedSnapshot = await this.archiveSectionIfEmpty(client, sourceSectionId);
        if (archivedSnapshot) {
          sectionArchivedCount += 1;
          archivedSourceSections.set(sourceSectionId, archivedSnapshot);
        }
      }

      await this.appendRunMetadata(client, run.id, {
        section_state: {
          created_target_sections: [...createdTargetSections.values()],
          archived_source_sections: [...archivedSourceSections.values()],
        },
      });

      await this.finalizeRunSummary(client, run.id, {
        promoted_students: promotedCount,
        archived_students: 0,
        archived_sections: sectionArchivedCount,
      });

      await client.query('COMMIT');

      return ApiResponse.success(res, {
        run_id: run.id,
        promoted_students: promotedCount,
        archived_sections: sectionArchivedCount,
      }, 'Class promotion completed successfully');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  }

  async history(req, res, next) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT
           pr.id,
           pr.promotion_type,
           pr.status,
           pr.promotion_date,
           pr.promoted_at,
           pr.undone_at,
           pr.summary,
           pr.metadata,
           u.email as initiated_by_email
         FROM promotion_runs pr
         LEFT JOIN users u ON u.id = pr.initiated_by
         ORDER BY pr.promoted_at DESC
         LIMIT 200`
      );

      return ApiResponse.success(res, result.rows, 'Promotion history retrieved successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  async undo(req, res, next) {
    const client = await pool.connect();
    try {
      const runId = parseInt(req.params.id, 10);
      if (!runId) return ApiResponse.error(res, 'Invalid promotion run id.', 400);

      await client.query('BEGIN');

      const runResult = await client.query(
        `SELECT * FROM promotion_runs WHERE id = $1 FOR UPDATE`,
        [runId]
      );

      if (runResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Promotion run not found.', 404);
      }

      const run = runResult.rows[0];
      if (run.status === 'UNDONE') {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'This promotion run is already undone.', 400);
      }

      const rowsResult = await client.query(
        `SELECT *
         FROM promotion_run_students
         WHERE promotion_run_id = $1
         ORDER BY id DESC`,
        [runId]
      );

      const touchedSourceSectionIds = new Set();
      const touchedTargetSectionIds = new Set();

      let revertedPromoted = 0;
      let revertedArchived = 0;

      for (const row of rowsResult.rows) {
        if (row.old_section_id) touchedSourceSectionIds.add(row.old_section_id);
        if (row.new_section_id) touchedTargetSectionIds.add(row.new_section_id);

        const activeEnrollment = await client.query(
          `SELECT id
           FROM student_class_history
           WHERE student_id = $1 AND end_date IS NULL
           LIMIT 1`,
          [row.student_id]
        );

        if (row.action_type === 'PROMOTED') {
          if (activeEnrollment.rows.length === 0 || String(activeEnrollment.rows[0].id) !== String(row.new_enrollment_id)) {
            await client.query('ROLLBACK');
            return ApiResponse.error(
              res,
              `Undo blocked: student ${row.student_id} has changed enrollment after this promotion.`,
              409
            );
          }

          await client.query(
            'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
            [new Date(), row.new_enrollment_id]
          );
          await client.query(
            'UPDATE student_class_history SET end_date = NULL WHERE id = $1',
            [row.old_enrollment_id]
          );

          await client.query(
            'UPDATE students SET individual_monthly_fee = $2 WHERE id = $1',
            [row.student_id, row.previous_individual_monthly_fee]
          );

          revertedPromoted += 1;
        }

        if (row.action_type === 'ARCHIVED') {
          if (activeEnrollment.rows.length > 0) {
            await client.query('ROLLBACK');
            return ApiResponse.error(
              res,
              `Undo blocked: archived student ${row.student_id} is already re-enrolled.`,
              409
            );
          }

          await client.query(
            'UPDATE student_class_history SET end_date = NULL WHERE id = $1',
            [row.old_enrollment_id]
          );

          await client.query(
            'UPDATE students SET individual_monthly_fee = $2 WHERE id = $1',
            [row.student_id, row.previous_individual_monthly_fee]
          );

          revertedArchived += 1;
        }
      }

      const sectionState = run.metadata?.section_state || {};
      const archivedSourceSectionsMeta = Array.isArray(sectionState.archived_source_sections)
        ? sectionState.archived_source_sections
        : [];
      const createdTargetSectionsMeta = Array.isArray(sectionState.created_target_sections)
        ? sectionState.created_target_sections
        : [];

      const archivedSourceMap = new Map();
      for (const item of archivedSourceSectionsMeta) {
        if (!item || !item.id) continue;
        archivedSourceMap.set(Number(item.id), item);
      }

      // Backward compatibility: older runs did not store section snapshots in metadata.
      for (const sectionId of touchedSourceSectionIds) {
        const meta = archivedSourceMap.get(Number(sectionId));
        const preferredName = meta?.previous_name || null;
        await this.restoreSectionFromArchive(client, sectionId, preferredName);
      }

      const createdTargetSectionIds = new Set(
        createdTargetSectionsMeta
          .map((item) => Number(item?.id))
          .filter((id) => Number.isFinite(id) && id > 0)
      );

      // Backward compatibility: for old runs, infer temporary target sections from movement rows.
      if (createdTargetSectionIds.size === 0) {
        for (const sectionId of touchedTargetSectionIds) {
          if (!touchedSourceSectionIds.has(sectionId)) {
            createdTargetSectionIds.add(Number(sectionId));
          }
        }
      }

      let cleanedTemporarySections = 0;
      for (const sectionId of createdTargetSectionIds) {
        const archivedSnapshot = await this.archiveSectionIfEmpty(client, sectionId);
        if (archivedSnapshot) {
          cleanedTemporarySections += 1;
        }
      }

      await client.query('DELETE FROM ex_class_batches WHERE promotion_run_id = $1', [runId]);

      await client.query(
        `UPDATE promotion_runs
         SET status = 'UNDONE', undone_at = now(),
             summary = COALESCE(summary, '{}'::jsonb) || $2::jsonb
         WHERE id = $1`,
        [
          runId,
          JSON.stringify({
            undo: {
              reverted_promoted_students: revertedPromoted,
              reverted_archived_students: revertedArchived,
              cleaned_temporary_sections: cleanedTemporarySections,
            },
          }),
        ]
      );

      await client.query('COMMIT');

      return ApiResponse.success(res, {
        run_id: runId,
        reverted_promoted_students: revertedPromoted,
        reverted_archived_students: revertedArchived,
        cleaned_temporary_sections: cleanedTemporarySections,
      }, 'Promotion undo completed successfully');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  }

  async listExClasses(req, res, next) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT
           b.id,
           b.promotion_run_id,
           b.class_id,
           b.section_id,
           b.class_name,
           b.section_name,
           b.batch_month,
           b.batch_year,
           b.locked,
           b.created_at,
           (SELECT COUNT(*)::int FROM ex_class_students es WHERE es.ex_class_batch_id = b.id) as student_count
         FROM ex_class_batches b
         JOIN promotion_runs pr ON pr.id = b.promotion_run_id
         WHERE pr.status = 'COMPLETED'
         ORDER BY b.batch_year DESC, b.batch_month DESC, b.class_name, b.section_name`
      );

      return ApiResponse.success(res, result.rows, 'Ex classes retrieved successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  async getExClassBatch(req, res, next) {
    const client = await pool.connect();
    try {
      const batchId = parseInt(req.params.batchId, 10);
      if (!batchId) return ApiResponse.error(res, 'Invalid ex class batch id.', 400);

      const batchResult = await client.query(
        `SELECT b.*
         FROM ex_class_batches b
         JOIN promotion_runs pr ON pr.id = b.promotion_run_id
         WHERE b.id = $1 AND pr.status = 'COMPLETED'`,
        [batchId]
      );

      if (batchResult.rows.length === 0) {
        return ApiResponse.error(res, 'Ex class batch not found.', 404);
      }

      const studentsResult = await client.query(
        `SELECT student_id, student_name, father_name, roll_no, phone, archived_at
         FROM ex_class_students
         WHERE ex_class_batch_id = $1
         ORDER BY student_name`,
        [batchId]
      );

      return ApiResponse.success(res, {
        batch: batchResult.rows[0],
        students: studentsResult.rows,
      }, 'Ex class batch details retrieved successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new PromotionsController();
