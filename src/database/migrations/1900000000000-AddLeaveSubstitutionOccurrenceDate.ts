import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #461 F4 — yedek ataması occurrence-düzeyi kimlik.
 *
 * Haftalık tekrar eden bir ders birden fazla occurrence'a genişler; hepsi
 * AYNI `schedule_event_id`'yi taşır. Karar anındaki karşılama (`applyApprovalCoverage`)
 * open occurrence başına BİR assignment satırı yazar; bu yüzden satır,
 * kapsadığı occurrence'ın tarihini taşımalıdır.
 *
 * Kolon nullable kalır: operasyonel yedek/kaldırma akışı (`assign`/`clear`)
 * olay-düzeyi satır yazmaya devam eder; eski satırlar için `NULL` geçerlidir.
 *
 * Immutable kural §6: mevcut migration'lar değiştirilmez; bu yeni bir
 * FOLLOW-UP migration'dır ve DDL idempotenttir.
 */
export class AddLeaveSubstitutionOccurrenceDate1900000000000
  implements MigrationInterface
{
  name = 'AddLeaveSubstitutionOccurrenceDate1900000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leave_substitution_assignments" ADD COLUMN IF NOT EXISTS "occurrence_date" date NULL`,
    );
    // Eski olay-düzeyi unique index, occurrence-düzeyi satırları engeller
    // (aynı `schedule_event_id`'ten birden fazla aktif satır artık
    // tasarım gereğidir); kapsama kimliği occurrence ile genişletilir.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_leave_substitution_one_active"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_leave_substitution_one_active"
       ON leave_substitution_assignments(tenant_id, leave_request_id, schedule_event_id, occurrence_date)
       WHERE state = 'assigned'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_leave_substitution_one_active"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_leave_substitution_one_active"
       ON leave_substitution_assignments(tenant_id, leave_request_id, schedule_event_id)
       WHERE state = 'assigned'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_substitution_assignments" DROP COLUMN IF EXISTS "occurrence_date"`,
    );
  }
}
