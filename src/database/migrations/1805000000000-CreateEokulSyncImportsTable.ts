import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * e-okul / MEB senkronizasyon hazırlık (staging) tablosu.
 *
 * MEB kaynak kayıtları doğrudan üretim tablolarına yazılmaz; önce tenant
 * kapsamlı bir staging tablosuna idempotent upsert edilir. PII alanları
 * uygulama katmanında (EokulSyncService) redakte edildikten sonra yazılır,
 * böylece veritabanında ham öğrenci/veli PII tutulmaz (KVKK).
 *
 * `source_id` + `tenant_id` benzersiz kısıtı idempotency'yi garanti eder:
 * aynı MEB kaydı tekrar geldiğinde upsert güncelleme yapar, yinelenmez.
 */
export class CreateEokulSyncImportsTable1805000000000 implements MigrationInterface {
  name = 'CreateEokulSyncImportsTable1805000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS eokul_sync_imports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        kind varchar(16) NOT NULL,
        source_id varchar(128) NOT NULL,
        payload_json jsonb NOT NULL,
        source_updated_at timestamptz NULL,
        sync_state varchar(24) NOT NULL DEFAULT 'pending',
        last_error text NULL,
        last_synced_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // NOTE: PostgreSQL does not support `ALTER TABLE ... ADD CONSTRAINT IF NOT
    // EXISTS` (syntax error). Use a named UNIQUE INDEX for idempotent
    // enforcement of the (tenant_id, kind, source_id) idempotency key.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_eokul_sync_imports_tenant_source
        ON eokul_sync_imports (tenant_id, kind, source_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eokul_sync_imports_tenant_kind
        ON eokul_sync_imports (tenant_id, kind);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eokul_sync_imports_tenant_state
        ON eokul_sync_imports (tenant_id, sync_state);
    `);

    await queryRunner.query(`
      COMMENT ON TABLE eokul_sync_imports IS
        'MEB e-okul kaynak kayıtları (redakte edilmiş PII ile) tenant-kapsamlı staging tablosu. Idempotent upsert hedefi.';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS eokul_sync_imports;`);
  }
}
