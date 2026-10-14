import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKvkkConsentVersion1850000000000 implements MigrationInterface {
  name = 'AddKvkkConsentVersion1850000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kvkk_consents
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_kvkk_consents_subject_type_version
        ON kvkk_consents(tenant_id, subject_id, consent_type, version DESC, created_at DESC)
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kvkk_consents.version IS
        'Consent lineage version: a newer decision row carries a higher version; the authoritative resolver picks the max-version row per (subject, consent_type, channel).'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_kvkk_consents_subject_type_version`,
    );
    await queryRunner.query(
      `ALTER TABLE kvkk_consents DROP COLUMN IF EXISTS version`,
    );
  }
}
