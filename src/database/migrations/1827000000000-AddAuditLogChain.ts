import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #259 P1B-02 — Durable, tamper-evident audit zinciri kolonları.
 *
 * `audit_logs` artık her kaydı bir öncekine bağlar:
 *   seq (bigserial, monotonic sıra) → zincir/verification sırası
 *   prev_hash (varchar 64)          → önceki kaydın entry_hash'i (ilk kayıt: genesis)
 *   entry_hash (varchar 64)         → sha256(prev_hash + canonical payload)
 *   signature (varchar 64)          → HMAC-SHA256(entry_hash)
 *   signature_key_id (varchar 40)   → imza anahtarı rotasyon kimliği
 *
 * Legacy (zincir öncesi) satırlarda bu kolonlar NULL olur; `verifyAuditChain`
 * bunları `unchained-entry` olarak raporlar (sessizce geçerli saymaz).
 *
 * Immutable kural §6: mevcut migration değiştirilmez; tüm DDL idempotenttir.
 */
export class AddAuditLogChain1827000000000 implements MigrationInterface {
  name = 'AddAuditLogChain1827000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "seq" bigserial`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "prev_hash" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "entry_hash" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "signature" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "signature_key_id" varchar(40)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_audit_logs_seq" ON "audit_logs" ("seq")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_logs_entry_hash" ON "audit_logs" ("entry_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_entry_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_audit_logs_seq"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "signature_key_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "signature"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "entry_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "prev_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "seq"`,
    );
  }
}
