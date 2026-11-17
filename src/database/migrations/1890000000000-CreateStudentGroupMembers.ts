import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #461 F1: öğrenci–grup üyeliği (roster) foundation.
 *
 * `students` ve `student_groups` zaten aynı tenant/branch'i composite FK ile
 * bağlıyor. Üyelik tablosu bu iki kaynağı da aynı branch'e bağlar; böylece
 * bir öğrenci başka bir şubenin grubuna sessizce eklenemez.
 *
 * Yıkıcı değişiklik yoktur: yalnız yeni tablo + index'ler ve `students`
 * üzerinde composite FK için gereken ek unique index gelir.
 */
export class CreateStudentGroupMembers1890000000000 implements MigrationInterface {
  name = 'CreateStudentGroupMembers1890000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // Composite FK (`tenant_id, branch_id, student_id`) için gerekli hedef.
    // `id` zaten PK olduğundan bu index yalnız kanıtlanmış branch tutarlılığını
    // verir; veri kaybı veya yeniden yazım üretmez.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_students_branch_id"
        ON "students" ("tenant_id", "branch_id", "id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student_group_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "student_group_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "fk_student_group_members_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_student_group_members_branch_same_tenant"
          FOREIGN KEY ("tenant_id", "branch_id")
          REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "fk_student_group_members_group_same_branch"
          FOREIGN KEY ("tenant_id", "branch_id", "student_group_id")
          REFERENCES "student_groups"("tenant_id", "branch_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "fk_student_group_members_student_same_branch"
          FOREIGN KEY ("tenant_id", "branch_id", "student_id")
          REFERENCES "students"("tenant_id", "branch_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "chk_student_group_members_status"
          CHECK ("status" IN ('active', 'inactive'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_group_members_tenant_id"
        ON "student_group_members" ("tenant_id", "id")
    `);
    // Aynı öğrenci aynı grupta en fazla bir kez aktif üye olabilir.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_group_members_active"
        ON "student_group_members" ("tenant_id", "student_group_id", "student_id")
        WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_student_group_members_tenant_group_status"
        ON "student_group_members" ("tenant_id", "branch_id", "student_group_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_student_group_members_tenant_student"
        ON "student_group_members" ("tenant_id", "student_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_student_group_members_tenant_student"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_student_group_members_tenant_group_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_student_group_members_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_student_group_members_tenant_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "student_group_members"`);
    // Yalnız bu migration tarafından eklenen hedef index geri alınır.
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_students_branch_id"`);
  }
}
