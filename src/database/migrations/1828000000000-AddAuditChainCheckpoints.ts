import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #259 — Audit retention için GLOBAL zincir checkpoint tablosu.
 *
 * Zincir globaldir (tenant'lar arası tek sıra). Saklama süresi dolan kayıtlar
 * silinmeden ÖNCE buraya bir checkpoint yazılır: kırpılan son `sequence`, o
 * satırın `entry_hash`'i (`head_hash`) ve bu özetin HMAC imzası. Böylece
 * kalan zincir genesis'e değil checkpoint'in `head_hash`'ine bağlanır ve
 * kırpılan geçmişin bütünlüğü kanıtlanabilir kalır
 * (`verifyAuditChain({ startPrevHash })`).
 *
 * Immutable kural §6: yeni FOLLOW-UP migration; DDL idempotenttir.
 */
export class AddAuditChainCheckpoints1828000000000 implements MigrationInterface {
  name = 'AddAuditChainCheckpoints1828000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_chain_checkpoints" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "up_to_sequence" bigint NOT NULL,
        "head_hash" varchar(64) NOT NULL,
        "signature" varchar(64) NOT NULL,
        "signature_key_id" varchar(40) NOT NULL,
        "reason" varchar(60) NOT NULL,
        "pruned_row_count" integer NOT NULL DEFAULT 0,
        "created_by_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_audit_chain_checkpoints_sequence"
          UNIQUE ("up_to_sequence")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_chain_checkpoints_sequence"
        ON "audit_chain_checkpoints" ("up_to_sequence" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_chain_checkpoints_sequence"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_chain_checkpoints"`);
  }
}
