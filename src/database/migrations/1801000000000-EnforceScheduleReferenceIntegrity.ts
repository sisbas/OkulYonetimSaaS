import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceScheduleReferenceIntegrity1801000000000 implements MigrationInterface {
  name = 'EnforceScheduleReferenceIntegrity1801000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass(current_schema() || '.courses') IS NULL THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REPAIR_REQUIRES_COURSES_TABLE';
        END IF;
        IF to_regclass(current_schema() || '.time_slots') IS NULL THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REPAIR_REQUIRES_TIME_SLOTS_TABLE';
        END IF;
        IF to_regclass(current_schema() || '.teachers') IS NULL THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REPAIR_REQUIRES_ISSUE_141_TEACHERS_TABLE';
        END IF;
        IF to_regclass(current_schema() || '.teacher_branches') IS NULL THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REPAIR_REQUIRES_ISSUE_141_TEACHER_BRANCHES_TABLE';
        END IF;
        IF to_regclass(current_schema() || '.student_groups') IS NULL THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REPAIR_REQUIRES_STUDENT_GROUPS_TABLE';
        END IF;
      END $$
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_schedules_owner ON schedules (tenant_id, branch_id, id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_versions_owner ON schedule_versions (tenant_id, branch_id, schedule_id, id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_courses_tenant_id ON courses (tenant_id, id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_time_slots_branch_id ON time_slots (tenant_id, branch_id, id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_teachers_tenant_id ON teachers (tenant_id, id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_teacher_branches_owner ON teacher_branches (tenant_id, branch_id, teacher_id, id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_student_groups_branch_id ON student_groups (tenant_id, branch_id, id)`);

    await queryRunner.query(`
      DO $$
      DECLARE invalid_count integer;
      BEGIN
        SELECT COUNT(*) INTO invalid_count
        FROM schedule_versions version
        LEFT JOIN schedules schedule
          ON schedule.id = version.schedule_id
         AND schedule.tenant_id = version.tenant_id
         AND schedule.branch_id = version.branch_id
        WHERE schedule.id IS NULL;
        IF invalid_count > 0 THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REFERENCE_PREFLIGHT_HOLD: schedule_versions owner mismatch count=%', invalid_count;
        END IF;

        SELECT COUNT(*) INTO invalid_count
        FROM schedules schedule
        LEFT JOIN schedule_versions version
          ON version.id = schedule.active_version_id
         AND version.tenant_id = schedule.tenant_id
         AND version.branch_id = schedule.branch_id
         AND version.schedule_id = schedule.id
        WHERE schedule.active_version_id IS NOT NULL
          AND version.id IS NULL;
        IF invalid_count > 0 THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REFERENCE_PREFLIGHT_HOLD: active_version owner mismatch count=%', invalid_count;
        END IF;

        SELECT COUNT(*) INTO invalid_count
        FROM schedule_events event
        LEFT JOIN schedules schedule
          ON schedule.id = event.schedule_id
         AND schedule.tenant_id = event.tenant_id
         AND schedule.branch_id = event.branch_id
        WHERE schedule.id IS NULL;
        IF invalid_count > 0 THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REFERENCE_PREFLIGHT_HOLD: schedule_event schedule owner mismatch count=%', invalid_count;
        END IF;

        SELECT COUNT(*) INTO invalid_count
        FROM schedule_events event
        LEFT JOIN schedule_versions version
          ON version.id = event.version_id
         AND version.tenant_id = event.tenant_id
         AND version.branch_id = event.branch_id
         AND version.schedule_id = event.schedule_id
        WHERE version.id IS NULL;
        IF invalid_count > 0 THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REFERENCE_PREFLIGHT_HOLD: schedule_event version owner mismatch count=%', invalid_count;
        END IF;

        SELECT COUNT(*) INTO invalid_count
        FROM schedule_events event
        LEFT JOIN courses course
          ON course.id = event.course_id
         AND course.tenant_id = event.tenant_id
        WHERE course.id IS NULL;
        IF invalid_count > 0 THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REFERENCE_PREFLIGHT_HOLD: course tenant mismatch count=%', invalid_count;
        END IF;

        SELECT COUNT(*) INTO invalid_count
        FROM schedule_events event
        LEFT JOIN time_slots slot
          ON slot.id = event.time_slot_id
         AND slot.tenant_id = event.tenant_id
         AND slot.branch_id = event.branch_id
        WHERE slot.id IS NULL;
        IF invalid_count > 0 THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REFERENCE_PREFLIGHT_HOLD: time_slot owner mismatch count=%', invalid_count;
        END IF;

        SELECT COUNT(*) INTO invalid_count
        FROM schedule_events event
        LEFT JOIN teachers teacher
          ON teacher.id = event.teacher_id
         AND teacher.tenant_id = event.tenant_id
        WHERE teacher.id IS NULL;
        IF invalid_count > 0 THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REFERENCE_PREFLIGHT_HOLD: teacher tenant mismatch count=%', invalid_count;
        END IF;

        SELECT COUNT(*) INTO invalid_count
        FROM schedule_events event
        LEFT JOIN teacher_branches teacher_branch
          ON teacher_branch.id = event.teacher_branch_id
         AND teacher_branch.tenant_id = event.tenant_id
         AND teacher_branch.branch_id = event.branch_id
         AND teacher_branch.teacher_id = event.teacher_id
        WHERE teacher_branch.id IS NULL;
        IF invalid_count > 0 THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REFERENCE_PREFLIGHT_HOLD: teacher_branch ownership mismatch count=%', invalid_count;
        END IF;

        SELECT COUNT(*) INTO invalid_count
        FROM schedule_events event
        LEFT JOIN student_groups student_group
          ON student_group.id = event.student_group_id
         AND student_group.tenant_id = event.tenant_id
         AND student_group.branch_id = event.branch_id
        WHERE student_group.id IS NULL;
        IF invalid_count > 0 THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_REFERENCE_PREFLIGHT_HOLD: student_group owner mismatch count=%', invalid_count;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE schedule_versions
      ADD CONSTRAINT fk_schedule_versions_schedule_owner
      FOREIGN KEY (tenant_id, branch_id, schedule_id)
      REFERENCES schedules (tenant_id, branch_id, id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE schedules
      ADD CONSTRAINT fk_schedules_active_version_owner
      FOREIGN KEY (tenant_id, branch_id, id, active_version_id)
      REFERENCES schedule_versions (tenant_id, branch_id, schedule_id, id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_events
      ADD CONSTRAINT fk_schedule_events_schedule_owner
      FOREIGN KEY (tenant_id, branch_id, schedule_id)
      REFERENCES schedules (tenant_id, branch_id, id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_events
      ADD CONSTRAINT fk_schedule_events_version_owner
      FOREIGN KEY (tenant_id, branch_id, schedule_id, version_id)
      REFERENCES schedule_versions (tenant_id, branch_id, schedule_id, id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_events
      ADD CONSTRAINT fk_schedule_events_course_tenant
      FOREIGN KEY (tenant_id, course_id)
      REFERENCES courses (tenant_id, id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_events
      ADD CONSTRAINT fk_schedule_events_time_slot_branch
      FOREIGN KEY (tenant_id, branch_id, time_slot_id)
      REFERENCES time_slots (tenant_id, branch_id, id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_events
      ADD CONSTRAINT fk_schedule_events_teacher_tenant
      FOREIGN KEY (tenant_id, teacher_id)
      REFERENCES teachers (tenant_id, id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_events
      ADD CONSTRAINT fk_schedule_events_teacher_branch_owner
      FOREIGN KEY (tenant_id, branch_id, teacher_id, teacher_branch_id)
      REFERENCES teacher_branches (tenant_id, branch_id, teacher_id, id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_events
      ADD CONSTRAINT fk_schedule_events_student_group_branch
      FOREIGN KEY (tenant_id, branch_id, student_group_id)
      REFERENCES student_groups (tenant_id, branch_id, id)
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION schedule_repair_prevent_published_snapshot_mutation()
      RETURNS trigger AS $$
      BEGIN
        IF OLD.status = 'published' AND (
          NEW.snapshot IS DISTINCT FROM OLD.snapshot OR
          NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
          NEW.branch_id IS DISTINCT FROM OLD.branch_id OR
          NEW.schedule_id IS DISTINCT FROM OLD.schedule_id OR
          NEW.version_no IS DISTINCT FROM OLD.version_no OR
          NEW.published_at IS DISTINCT FROM OLD.published_at
        ) THEN
          RAISE EXCEPTION 'WP07_SCHEDULE_PUBLISHED_SNAPSHOT_IMMUTABLE';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_schedule_repair_published_snapshot_immutable
      BEFORE UPDATE OF snapshot, tenant_id, branch_id, schedule_id, version_no, published_at
      ON schedule_versions
      FOR EACH ROW
      EXECUTE FUNCTION schedule_repair_prevent_published_snapshot_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_schedule_repair_published_snapshot_immutable ON schedule_versions`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS schedule_repair_prevent_published_snapshot_mutation`);
    await queryRunner.query(`ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_student_group_branch`);
    await queryRunner.query(`ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_teacher_branch_owner`);
    await queryRunner.query(`ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_teacher_tenant`);
    await queryRunner.query(`ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_time_slot_branch`);
    await queryRunner.query(`ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_course_tenant`);
    await queryRunner.query(`ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_version_owner`);
    await queryRunner.query(`ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_schedule_owner`);
    await queryRunner.query(`ALTER TABLE schedules DROP CONSTRAINT IF EXISTS fk_schedules_active_version_owner`);
    await queryRunner.query(`ALTER TABLE schedule_versions DROP CONSTRAINT IF EXISTS fk_schedule_versions_schedule_owner`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_repair_student_groups_branch_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_repair_teacher_branches_owner`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_repair_teachers_tenant_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_repair_time_slots_branch_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_repair_courses_tenant_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_repair_versions_owner`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_repair_schedules_owner`);
  }
}
