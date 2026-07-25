import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateScheduleMinimumPublish1784700000000 implements MigrationInterface {
  name = 'CreateScheduleMinimumPublish1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      branch_id uuid NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'draft',
      revision integer NOT NULL DEFAULT 1,
      effective_from date NOT NULL,
      effective_to date,
      active_version_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT fk_schedules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_schedules_branch_same_tenant FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT chk_schedules_status CHECK (status IN ('draft', 'published', 'unpublished')),
      CONSTRAINT chk_schedules_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS schedule_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      branch_id uuid NOT NULL,
      schedule_id uuid NOT NULL,
      version_no integer NOT NULL,
      status varchar(16) NOT NULL,
      validation_mode varchar(16),
      validation_fingerprint varchar(128),
      validated_revision integer,
      snapshot jsonb NOT NULL,
      published_at timestamptz,
      unpublished_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT fk_schedule_versions_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
      CONSTRAINT fk_schedule_versions_branch_same_tenant FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT chk_schedule_versions_status CHECK (status IN ('draft', 'published', 'unpublished')),
      CONSTRAINT chk_schedule_versions_mode CHECK (validation_mode IS NULL OR validation_mode IN ('FULL', 'INCREMENTAL')),
      CONSTRAINT chk_schedule_versions_snapshot_object CHECK (jsonb_typeof(snapshot) = 'object'),
      CONSTRAINT uq_schedule_versions_no UNIQUE (schedule_id, version_no)
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS schedule_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      branch_id uuid NOT NULL,
      schedule_id uuid NOT NULL,
      version_id uuid NOT NULL,
      teacher_id uuid NOT NULL,
      teacher_branch_id uuid NOT NULL,
      student_group_id uuid NOT NULL,
      course_id uuid NOT NULL,
      room_id uuid NOT NULL,
      time_slot_id uuid NOT NULL,
      day_of_week smallint NOT NULL,
      start_time time NOT NULL,
      end_time time NOT NULL,
      time_slot_snapshot jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT fk_schedule_events_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
      CONSTRAINT fk_schedule_events_version FOREIGN KEY (version_id) REFERENCES schedule_versions(id) ON DELETE CASCADE,
      CONSTRAINT fk_schedule_events_branch_same_tenant FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_events_time_slot FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE RESTRICT,
      CONSTRAINT chk_schedule_events_time_order CHECK (end_time > start_time),
      CONSTRAINT chk_schedule_events_day CHECK (day_of_week BETWEEN 1 AND 7),
      CONSTRAINT chk_schedule_events_snapshot_object CHECK (jsonb_typeof(time_slot_snapshot) = 'object')
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_published_period ON schedule_versions (tenant_id, branch_id, schedule_id) WHERE status = 'published'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_schedule_events_read_port ON schedule_events (tenant_id, branch_id, teacher_id, day_of_week, start_time)`);
    await queryRunner.query(`ALTER TABLE schedules ADD CONSTRAINT fk_schedules_active_version FOREIGN KEY (active_version_id) REFERENCES schedule_versions(id) ON DELETE SET NULL`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass(current_schema() || '.uq_time_slots_tenant_branch_id') IS NOT NULL THEN
          ALTER TABLE schedule_events ADD CONSTRAINT fk_schedule_events_time_slot_same_branch
          FOREIGN KEY (tenant_id, branch_id, time_slot_id) REFERENCES time_slots(tenant_id, branch_id, id) ON DELETE RESTRICT;
        END IF;
        IF to_regclass(current_schema() || '.teacher_branches') IS NOT NULL THEN
          ALTER TABLE schedule_events ADD CONSTRAINT fk_schedule_events_teacher_branch_same_tenant
          FOREIGN KEY (tenant_id, teacher_branch_id) REFERENCES teacher_branches(tenant_id, id) ON DELETE RESTRICT;
        END IF;
        IF to_regclass(current_schema() || '.student_groups') IS NOT NULL THEN
          ALTER TABLE schedule_events ADD CONSTRAINT fk_schedule_events_group_same_tenant
          FOREIGN KEY (tenant_id, student_group_id) REFERENCES student_groups(tenant_id, id) ON DELETE RESTRICT;
        END IF;
        IF to_regclass(current_schema() || '.uq_courses_tenant_id') IS NOT NULL THEN
          ALTER TABLE schedule_events ADD CONSTRAINT fk_schedule_events_course_same_tenant
          FOREIGN KEY (tenant_id, course_id) REFERENCES courses(tenant_id, id) ON DELETE RESTRICT;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE schedules DROP CONSTRAINT IF EXISTS fk_schedules_active_version`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_schedule_events_read_port`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_published_period`);
    await queryRunner.query(`DROP TABLE IF EXISTS schedule_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS schedule_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS schedules`);
  }
}
