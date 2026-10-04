import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #266 N1a [P1B-FINAL][KVKK] — Create parent contact / contact point /
 * student-link encrypted foundation (immutable follow-up migration).
 *
 * Sözleşme:
 * - `parent_contacts`: kiracıya bağlı yetkili recipient/guardian
 *   referansı. Lifecycle + optimistic `version`. Serbest metin/
 *   gereksiz kişisel alan YOK; isim/telefon varlığından guardian
 *   ya da consent authority çıkarılmaz.
 * - `contact_points`: parent_contact ile SAME-TENANT ilişki. Destek-
 *   lenen kanal; **encrypted** normalize contact value (JSON envelope);
 *   masked display projection; verification state + trusted evidence
 *   reference; lifecycle + version. `verified` client flag'i authoritative
 *   verification DEĞİLDİR — yalnız `verification_status` + evidence ref.
 * - `student_parent_contacts`: same-tenant öğrenci↔contact ilişkisi.
 *   effective-date/lifecycle/version sözleşmesi. Başka tenant'a
 *   association yapılamaz (composite FK + tenant predicate).
 *   Revoked/inactive/out-of-date ilişki uygun recipient sayılmaz.
 *
 * KVKK data minimization: ham contact değeri hiçbir zaman plaintext
 * sütunda saklanmaz; yalnız `encrypted_value` (AES-256-GCM envelope)
 * ve `masked_display` (maskelenmiş projeksiyon) vardır.
 *
 * Immutable kural §6: yeni FOLLOW-UP migration; DDL idempotenttir.
 * Timestamp 1830000000000, son allocated blok (1829000000000)'den
 * sonradır — körlemesine tekrar kullanılmaz.
 */
export class CreateParentContactFoundation1830000000000
  implements MigrationInterface
{
  name = 'CreateParentContactFoundation1830000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parent_contacts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL
          REFERENCES "tenants"("id") ON DELETE RESTRICT,
        "guardian_ref_id" uuid NULL,
        "status" varchar(30) NOT NULL DEFAULT 'active',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "chk_parent_contacts_status"
          CHECK ("status" IN ('active', 'inactive', 'revoked')),
        CONSTRAINT "uq_parent_contacts_tenant_id"
          UNIQUE ("tenant_id", "id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_points" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "parent_contact_id" uuid NOT NULL,
        "channel" varchar(30) NOT NULL,
        "encrypted_value" text NOT NULL,
        "masked_display" varchar(64) NOT NULL,
        "blind_index" varchar(64) NULL,
        "verification_status" varchar(30) NOT NULL DEFAULT 'unverified',
        "verification_evidence_ref" text NULL,
        "status" varchar(30) NOT NULL DEFAULT 'active',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_contact_points_channel"
          CHECK ("channel" IN ('sms', 'whatsapp', 'email')),
        CONSTRAINT "chk_contact_points_verification"
          CHECK ("verification_status" IN ('unverified', 'verified', 'expired', 'revoked')),
        CONSTRAINT "chk_contact_points_status"
          CHECK ("status" IN ('active', 'inactive', 'revoked')),
        CONSTRAINT "uq_contact_points_tenant_id"
          UNIQUE ("tenant_id", "id"),
        CONSTRAINT "fk_contact_points_parent_same_tenant"
          FOREIGN KEY ("tenant_id", "parent_contact_id")
          REFERENCES "parent_contacts"("tenant_id", "id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student_parent_contacts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "parent_contact_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL
          REFERENCES "branches"("id") ON DELETE RESTRICT,
        "effective_from" timestamptz NOT NULL DEFAULT now(),
        "effective_to" timestamptz NULL,
        "status" varchar(30) NOT NULL DEFAULT 'active',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_student_parent_contacts_status"
          CHECK ("status" IN ('active', 'inactive', 'revoked')),
        CONSTRAINT "uq_student_parent_contacts_tenant_id"
          UNIQUE ("tenant_id", "id"),
        CONSTRAINT "uq_student_parent_contacts_link"
          UNIQUE ("tenant_id", "student_id", "parent_contact_id", "branch_id"),
        CONSTRAINT "fk_student_parent_contact_same_tenant"
          FOREIGN KEY ("tenant_id", "parent_contact_id")
          REFERENCES "parent_contacts"("tenant_id", "id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_parent_contacts_tenant_id"
        ON "parent_contacts" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_parent_contacts_guardian_ref"
        ON "parent_contacts" ("tenant_id", "guardian_ref_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contact_points_tenant_id"
        ON "contact_points" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contact_points_parent"
        ON "contact_points" ("tenant_id", "parent_contact_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contact_points_blind"
        ON "contact_points" ("tenant_id", "blind_index")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_student_parent_contacts_tenant_id"
        ON "student_parent_contacts" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_student_parent_contacts_student"
        ON "student_parent_contacts" ("tenant_id", "student_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_student_parent_contacts_branch"
        ON "student_parent_contacts" ("tenant_id", "branch_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_student_parent_contacts_effective"
        ON "student_parent_contacts" ("tenant_id", "student_id", "effective_from", "effective_to")`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "parent_contacts" IS 'KVKK N1a: tenant-bound authorized recipient/guardian reference; lifecycle + optimistic version; no free-text PII.'`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "contact_points" IS 'KVKK N1a: same-tenant contact point; AES-256-GCM encrypted value envelope + masked display; verification state + evidence ref; never plaintext.'`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "student_parent_contacts" IS 'KVKK N1a: same-tenant student<->contact link; effective-date/lifecycle/version; cross-tenant association impossible.'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_student_parent_contacts_effective"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_student_parent_contacts_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_student_parent_contacts_student"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_student_parent_contacts_tenant_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contact_points_blind"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contact_points_parent"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contact_points_tenant_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_parent_contacts_guardian_ref"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_parent_contacts_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "student_parent_contacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_points"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parent_contacts"`);
  }
}
