import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKvkkConsents1700000000010 implements MigrationInterface {
  name = 'CreateKvkkConsents1700000000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kvkk_consent_subjects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        subject_type varchar(30) NOT NULL,
        subject_ref_id uuid NULL,
        full_name varchar(255) NULL,
        contact_phone_masked varchar(40) NULL,
        contact_email_masked varchar(255) NULL,
        status varchar(30) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT chk_kvkk_consent_subjects_subject_type CHECK (subject_type IN ('student', 'parent', 'teacher', 'user', 'other')),
        CONSTRAINT chk_kvkk_consent_subjects_status CHECK (status IN ('active', 'inactive', 'deleted')),
        CONSTRAINT uq_kvkk_consent_subjects_tenant_id_id UNIQUE (tenant_id, id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kvkk_consents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        subject_id uuid NOT NULL REFERENCES kvkk_consent_subjects(id),
        consent_type varchar(60) NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'pending',
        channel varchar(30) NULL,
        source varchar(60) NULL,
        granted_at timestamptz NULL,
        revoked_at timestamptz NULL,
        expires_at timestamptz NULL,
        evidence_ref text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_kvkk_consents_consent_type CHECK (consent_type IN ('general_processing', 'attendance_tracking', 'parent_notification', 'sms_notification', 'whatsapp_notification', 'email_notification')),
        CONSTRAINT chk_kvkk_consents_status CHECK (status IN ('pending', 'approved', 'rejected', 'revoked', 'expired')),
        CONSTRAINT chk_kvkk_consents_channel CHECK (channel IS NULL OR channel IN ('manual', 'sms', 'whatsapp', 'email', 'paper', 'web')),
        CONSTRAINT uq_kvkk_consents_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT fk_kvkk_consents_subject_same_tenant FOREIGN KEY (tenant_id, subject_id) REFERENCES kvkk_consent_subjects(tenant_id, id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kvkk_consent_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        consent_id uuid NOT NULL REFERENCES kvkk_consents(id),
        actor_user_id uuid NULL REFERENCES users(id),
        event_type varchar(40) NOT NULL,
        event_at timestamptz NOT NULL DEFAULT now(),
        metadata_json jsonb NULL,
        request_id varchar(120) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_kvkk_consent_events_event_type CHECK (event_type IN ('created', 'approved', 'rejected', 'revoked', 'expired', 'evidence_updated')),
        CONSTRAINT fk_kvkk_consent_events_consent_same_tenant FOREIGN KEY (tenant_id, consent_id) REFERENCES kvkk_consents(tenant_id, id)
      )
    `);
    await queryRunner.query(`COMMENT ON TABLE kvkk_consent_subjects IS 'KVKK data minimization: store masked contact values only; raw contact data belongs in future tenant-scoped domain tables.'`);
    await queryRunner.query(`COMMENT ON TABLE kvkk_consents IS 'Stores consent status and evidence references with data minimization. Raw contact data must remain in tenant-scoped domain tables.'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_subjects_tenant_id ON kvkk_consent_subjects(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_subjects_type ON kvkk_consent_subjects(subject_type)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_subjects_ref ON kvkk_consent_subjects(subject_ref_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_consents_tenant_id ON kvkk_consents(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_consents_subject_id ON kvkk_consents(subject_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_consents_type_status ON kvkk_consents(consent_type, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_consents_active_approved ON kvkk_consents(tenant_id, subject_id, consent_type) WHERE status = 'approved'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_consent_events_tenant_id ON kvkk_consent_events(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_consent_events_consent_id ON kvkk_consent_events(consent_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_consent_events_event_type ON kvkk_consent_events(event_type)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_consent_events_event_at ON kvkk_consent_events(event_at)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS kvkk_consent_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS kvkk_consents`);
    await queryRunner.query(`DROP TABLE IF EXISTS kvkk_consent_subjects`);
  }
}
