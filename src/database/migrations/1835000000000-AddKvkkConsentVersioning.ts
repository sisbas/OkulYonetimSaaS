import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #266 R5 — Granüler + versioned + withdrawable consent modeli.
 *
 * `kvkk_consents` bugüne kadar yalnız (tenant, subject, consent_type, status,
 * revoked_at, expires_at) taşıyordu; **sürüm izi yoktu**. Bu migration:
 *
 * - `version` kolonu ekler (mevcut satırlar `1` olarak yorumlanır — geriye dönük
 *   uyumlu), CHECK ile `version >= 1` garanti edilir,
 * - "yöneten sürüm" (en yüksek version) sorgusu için index ekler.
 *
 * Bilinçli olarak **eklenmeyen** kısıt: (tenant, subject, type, version) UNIQUE.
 * Legacy satırlarda aynı tipin birden fazla kaydı bulunabildiği için (ör. onaylı
 * + iptal edilmiş eski kayıt) bu kısıt gerçek veride migration'ı kırabilirdi;
 * sürüm monotonluğu yazan yolun (grant: max+1, withdraw: mevcut satırı yerinde
 * iptal) sorumluluğundadır ve `chk_kvkk_consents_version_positive` ile
 * desteklenir. Sürüm çakışması okuma yolunda fail-closed karşılanır
 * (bkz. `src/kvkk/consent-versioning.ts`).
 *
 * Immutable kural §6: yeni FOLLOW-UP migration; DDL idempotenttir.
 */
export class AddKvkkConsentVersioning1835000000000 implements MigrationInterface {
  name = 'AddKvkkConsentVersioning1835000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kvkk_consents" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'chk_kvkk_consents_version_positive'
             AND conrelid = 'kvkk_consents'::regclass
        ) THEN
          ALTER TABLE "kvkk_consents"
            ADD CONSTRAINT "chk_kvkk_consents_version_positive" CHECK ("version" >= 1);
        END IF;
      END $$;
    `);

    // Yöneten (en yüksek) sürümü bulma yolu: bildirim kapısı her karar için
    // tip başına en yüksek version'ı okur.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_kvkk_consents_governing"
         ON "kvkk_consents" ("tenant_id", "subject_id", "consent_type", "version" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_kvkk_consents_governing"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'chk_kvkk_consents_version_positive'
             AND conrelid = 'kvkk_consents'::regclass
        ) THEN
          ALTER TABLE "kvkk_consents"
            DROP CONSTRAINT "chk_kvkk_consents_version_positive";
        END IF;
      END $$;
    `);
    await queryRunner.query(`ALTER TABLE "kvkk_consents" DROP COLUMN IF EXISTS "version"`);
  }
}
