import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #461 F4 — eski olay-düzeyi yedek satırlarının `occurrence_date` backfill'i.
 *
 * 1900000000000 kolonu ekledi; o tarihte var olan satırlar NULL kaldı
 * (operasyonel assign/clear olay-düzeyi yazmaya devam eder). Uygulamada
 * `NULL` satır olayın TÜM occurrence'larını kapsar
 * (`findCoveringAssignment`); buna karşılık unique index
 * `uq_leave_substitution_one_active` NULL'ları ayırt edemediği için aynı
 * olaya yinelenen satır veritabanı tarafından engellenemez.
 *
 * Bu follow-up backfill, `daily_operation_lessons.substitute_assignment_id`
 * ile BAĞLI tek bir farklı occurrence date'i varsa satırı o tarihle
 * kesinleştirir (index koruması devreye girer). Birden fazla tarih varsa
 * satır gerçekten olay-düzeyi demektir ve NULL kalır — uygulama NULL'u tüm
 * occurrence'ları kapsayacak şekilde yorumlar. Koşul yalnız
 * `occurrence_date IS NULL` satırlara uygulanır; tekrar çalıştırılabilir
 * (idempotent).
 *
 * Immutable kural §6: mevcut migration'lar değiştirilmez; bu yeni bir
 * FOLLOW-UP migration'dır.
 */
export class BackfillLeaveSubstitutionOccurrenceDate1910000000000
  implements MigrationInterface
{
  name = 'BackfillLeaveSubstitutionOccurrenceDate1910000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL UPDATE ... FROM çoklu eşleşmede belirsiz satır seçer;
    // yalnız TEK farklı tarihli bağlantı varsa backfill yapılır (HAVING).
    // Eşleşmeyen (çok tarihli veya ders bağlantısı olmayan) satırlar NULL
    // kalır ve uygulama tarafı olay-düzeyi kapsama olarak yorumlanır.
    await queryRunner.query(
      `UPDATE leave_substitution_assignments AS assignment SET occurrence_date = source.occurrence_date
         FROM (
           SELECT lesson.substitute_assignment_id AS assignment_id,
                  MIN(lesson.occurrence_date) AS occurrence_date
             FROM daily_operation_lessons AS lesson
            WHERE lesson.substitute_assignment_id IS NOT NULL
              AND lesson.occurrence_date IS NOT NULL
            GROUP BY lesson.substitute_assignment_id HAVING COUNT(DISTINCT lesson.occurrence_date) = 1
         ) AS source WHERE assignment.occurrence_date IS NULL
          AND assignment.id = source.assignment_id`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Veri backfill'i geri alınamaz: hangi satırın backfill ile
    // doldurulduğu kayıt altında değildir ve geri alma, F4 akışının
    // meşru tarihli satırlarını da NULL'a çevirirdi. Kolon düşürme
    // 1900000000000 down()'ına aittir; uygulama NULL'u olay-düzeyi
    // kapsama olarak yorumlamaya devam eder.
  }
}
