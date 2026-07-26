import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeaveRequestRuntime1784740000000 implements MigrationInterface {
  name = 'CreateLeaveRequestRuntime1784740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.teachers') IS NULL THEN
          RAISE EXCEPTION 'WP07_LEAVE_REQUIRES_ISSUE_141_TEACHERS_TABLE';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE leave_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
        requester_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        duration_type varchar(16) NOT NULL CHECK (duration_type IN ('hourly','full_day','multi_day')),
        reason_code varchar(32) NOT NULL CHECK (reason_code IN ('annual_leave','administrative','health','other')),
        decision_status varchar(16) NOT NULL DEFAULT 'pending' CHECK (decision_status IN ('pending','approved','rejected')),
        coverage_status varchar(32) NOT NULL DEFAULT 'not_required' CHECK (coverage_status IN ('not_required','unresolved','partially_covered','covered')),
        starts_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL,
        decided_by_user_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
        decided_at timestamptz NULL,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_leave_requests_range CHECK (starts_at < ends_at)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_leave_requests_tenant_branch_status_start ON leave_requests (tenant_id, branch_id, decision_status, starts_at)`);
    await queryRunner.query(`CREATE INDEX idx_leave_requests_tenant_teacher_status ON leave_requests (tenant_id, teacher_id, decision_status)`);
    await queryRunner.query(`
      CREATE TABLE leave_outbox_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_key varchar(160) NOT NULL UNIQUE,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        leave_request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE RESTRICT,
        event_name varchar(80) NOT NULL,
        payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_leave_outbox_events_status_created ON leave_outbox_events (status, created_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS leave_outbox_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS leave_requests`);
  }
}
