import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeaveImpactOperations1803000000000 implements MigrationInterface {
  name = 'CreateLeaveImpactOperations1803000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass(current_schema() || '.leave_requests') IS NULL THEN
          RAISE EXCEPTION 'WP07_DAILY_OPS_REQUIRES_LEAVE_REQUESTS';
        END IF;
        IF to_regclass(current_schema() || '.schedule_events') IS NULL THEN
          RAISE EXCEPTION 'WP07_DAILY_OPS_REQUIRES_SCHEDULE_EVENTS';
        END IF;
        IF to_regclass(current_schema() || '.schedule_versions') IS NULL THEN
          RAISE EXCEPTION 'WP07_DAILY_OPS_REQUIRES_SCHEDULE_VERSIONS';
        END IF;
        IF to_regclass(current_schema() || '.teachers') IS NULL THEN
          RAISE EXCEPTION 'WP07_DAILY_OPS_REQUIRES_TEACHERS';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE leave_substitution_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        leave_request_id uuid NOT NULL,
        schedule_version_id uuid NOT NULL,
        schedule_event_id uuid NOT NULL,
        substitute_teacher_id uuid NOT NULL,
        course_id uuid NOT NULL,
        state varchar(16) NOT NULL DEFAULT 'assigned' CHECK (state IN ('assigned','cleared')),
        version integer NOT NULL DEFAULT 1,
        created_by_user_id uuid NOT NULL,
        cleared_by_user_id uuid NULL,
        cleared_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_leave_substitution_leave
          FOREIGN KEY (leave_request_id)
          REFERENCES leave_requests(id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_leave_substitution_branch
          FOREIGN KEY (tenant_id, branch_id)
          REFERENCES branches(tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_leave_substitution_schedule_version
          FOREIGN KEY (schedule_version_id)
          REFERENCES schedule_versions(id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_leave_substitution_schedule_event
          FOREIGN KEY (schedule_event_id)
          REFERENCES schedule_events(id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_leave_substitution_teacher
          FOREIGN KEY (tenant_id, substitute_teacher_id)
          REFERENCES teachers(tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_leave_substitution_course
          FOREIGN KEY (tenant_id, course_id)
          REFERENCES courses(tenant_id, id)
          ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_leave_substitution_one_active
      ON leave_substitution_assignments(tenant_id, leave_request_id, schedule_event_id)
      WHERE state = 'assigned'
    `);
    await queryRunner.query(`
      CREATE INDEX idx_leave_substitution_leave_state
      ON leave_substitution_assignments(tenant_id, leave_request_id, state)
    `);
    await queryRunner.query(`
      CREATE TABLE daily_operation_lessons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        projection_key varchar(220) NOT NULL UNIQUE,
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        leave_request_id uuid NOT NULL,
        schedule_version_id uuid NOT NULL,
        schedule_event_id uuid NOT NULL,
        state varchar(16) NOT NULL CHECK (state IN ('open','resolved')),
        coverage_status varchar(32) NOT NULL CHECK (coverage_status IN ('not_required','unresolved','partially_covered','covered')),
        substitute_assignment_id uuid NULL,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_daily_operation_lesson_leave
          FOREIGN KEY (leave_request_id)
          REFERENCES leave_requests(id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_daily_operation_lesson_branch
          FOREIGN KEY (tenant_id, branch_id)
          REFERENCES branches(tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_daily_operation_lesson_schedule_version
          FOREIGN KEY (schedule_version_id)
          REFERENCES schedule_versions(id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_daily_operation_lesson_schedule_event
          FOREIGN KEY (schedule_event_id)
          REFERENCES schedule_events(id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_daily_operation_lesson_assignment
          FOREIGN KEY (substitute_assignment_id)
          REFERENCES leave_substitution_assignments(id)
          ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_daily_operation_lessons_queue
      ON daily_operation_lessons(tenant_id, branch_id, state, updated_at)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_daily_operation_lessons_leave
      ON daily_operation_lessons(tenant_id, leave_request_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_daily_operation_lessons_leave`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_daily_operation_lessons_queue`);
    await queryRunner.query(`DROP TABLE IF EXISTS daily_operation_lessons`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_leave_substitution_leave_state`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_leave_substitution_one_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS leave_substitution_assignments`);
  }
}
