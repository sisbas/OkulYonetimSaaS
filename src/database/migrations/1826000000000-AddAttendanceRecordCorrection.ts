import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #265 AC-4 — Kontrollü düzeltme (controlled correction) kolonları.
 *
 * Kilitli bir yoklama oturumunda yapılan kayıt düzeltmesi denetlenebilir
 * olmalıdır: kapalı sözlükten gerekçe kodu, sunucu atamalı aktör, zaman
 * damgası ve düzeltme sayacı.
 *
 * Immutable kural §6: mevcut migration'lar değiştirilmez; bu yeni bir
 * FOLLOW-UP migration'dır ve tüm DDL idempotenttir (ADD/DROP COLUMN IF
 * [NOT] EXISTS + DROP CONSTRAINT IF EXISTS).
 *
 * Not: `correction_reason_code` CHECK'i uygulama katmanındaki
 * `ATTENDANCE_CORRECTION_REASON_CODES` sözlüğünü DB seviyesinde de kilitler.
 */
export class AddAttendanceRecordCorrection1826000000000
  implements MigrationInterface
{
  name = 'AddAttendanceRecordCorrection1826000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "correction_reason_code" varchar(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "corrected_by_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "corrected_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "correction_count" integer NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(
      `ALTER TABLE "attendance_records" DROP CONSTRAINT IF EXISTS "chk_attendance_records_correction_reason_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ADD CONSTRAINT "chk_attendance_records_correction_reason_code"
        CHECK ("correction_reason_code" IS NULL OR "correction_reason_code" IN ('mis_selection', 'late_arrival_update', 'excused_document', 'manager_review'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendance_records" DROP CONSTRAINT IF EXISTS "chk_attendance_records_correction_reason_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" DROP COLUMN IF EXISTS "correction_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" DROP COLUMN IF EXISTS "corrected_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" DROP COLUMN IF EXISTS "corrected_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" DROP COLUMN IF EXISTS "correction_reason_code"`,
    );
  }
}
