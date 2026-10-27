import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * K-17 tek kaynağının (`CONSENT_TYPE_METADATA`) dondurulmuş anlık görüntüsü.
 *
 * Migration'lar uygulama kodunu import etmez: uygulanmış bir migration'ın
 * anlamı, kaynak kod sonradan değiştiğinde sessizce değişmemelidir. Eşitlik
 * `test/database/consent-legal-basis.migration.spec.ts` ile CI'da sabitlenir.
 */
const CONSENT_TYPE_METADATA_ROWS: ReadonlyArray<readonly [string, string, number]> = [
  ['parent_notification', 'consent', 3650],
  ['sms_notification', 'consent', 3650],
  ['whatsapp_notification', 'consent', 3650],
  ['email_notification', 'consent', 3650],
];

/**
 * PR #414 review kararları (Q3 + Q6).
 *
 * Q3 — `kvkk_consents` hukuki zemini + saklama süresi kolonları:
 * - `legal_basis`: onayın hukuki dayanağı.
 * - `retention_days`: onay kaydının saklama süresi (gün).
 * - Değerlerin tek kaynağı `CONSENT_TYPE_METADATA`'dır (K-17); bu migration,
 *   K-22 gereği grant endpoint'i/UI'ı olmayan bu PR'da o tek kaynağı mevcut
 *   satırlara uygular (geri yazım). Böylece kolonlar NULL kalmaz ve K-25'in
 *   consent kartı yüzeyi dolu çalışır. Listede olmayan consent_type için
 *   değer UYDURULMAZ — satır NULL kalır.
 *
 * Q6 — `delivered` durumu: simüle sağlayıcı, accept modunda denemeyi kabul
 *   ettiğinde satır artık yalnız `dispatched` (gönderildi) değil `delivered`
 *   (teslim edildi) durumuna geçer. `provider_delivered` outcome'u receipt'e
 *   dayanıklı olarak yazılır. `simulated = true` CHECK'i DEĞİŞMEZ: gerçek dış
 *   teslimat yine imkânsızdır (fail-closed korunur).
 *
 * CHECK değişiklikleri DROP + ADD ile yapılır (bkz. 1870000000000-AddNotificationDispatch).
 */
export class AddConsentLegalBasisAndDeliveredStatus1880000000000
  implements MigrationInterface
{
  name = 'AddConsentLegalBasisAndDeliveredStatus1880000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kvkk_consents" ADD COLUMN IF NOT EXISTS "legal_basis" varchar(32) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "kvkk_consents" ADD COLUMN IF NOT EXISTS "retention_days" integer NULL`,
    );

    await this.backfillConsentLegalBasis(queryRunner);

    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP CONSTRAINT IF EXISTS "chk_notification_outbox_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD CONSTRAINT "chk_notification_outbox_status"
         CHECK ("status" IN ('pending', 'blocked_consent', 'dispatched', 'delivered', 'failed',
                             'approved', 'closed', 'dead_lettered', 'uncertain', 'cancelled'))`,
    );

    await queryRunner.query(
      `ALTER TABLE "notification_dispatch_receipts" DROP CONSTRAINT IF EXISTS "chk_notification_dispatch_receipt_outcome"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_dispatch_receipts" ADD CONSTRAINT "chk_notification_dispatch_receipt_outcome"
         CHECK ("outcome" IN ('provider_accepted', 'provider_delivered', 'provider_rejected', 'uncertain'))`,
    );
  }

  /**
   * K-17 tek kaynak geri yazımı: her consent_type için `legal_basis` ve
   * `retention_days` yazılır.
   *
   * Değerler migration'a **gömülü** tutulur (migration dondurulmuş bir
   * anlık görüntüdür; uygulama kodunu import etmez). `CONSENT_TYPE_METADATA`
   * ile eşitliği `test/database/consent-legal-basis.migration.spec.ts`
   * tarafından sabitlenir — map değişirse CI kırmızıya döner.
   *
   * İdempotentlik: `COALESCE` yalnız NULL kolonları doldurur, dolu kolonu
   * ASLA ezmaz; ikinci çalıştırma hiçbir satırı değiştirmez. Listede
   * bulunmayan consent_type için değer uydurulmaz (satır NULL kalır).
   *
   * Cast notu: `(VALUES ...)` sütunları bilinmeyen tipten (`text`) gelir;
   * `retention_days` `integer` olduğu için atama açıkça `::integer`'a
   * çevrilir (aksi halde Postgres 42804 hatası verir).
   */
  private async backfillConsentLegalBasis(queryRunner: QueryRunner): Promise<void> {
    const entries = CONSENT_TYPE_METADATA_ROWS;
    if (entries.length === 0) return;

    const params: unknown[] = [];
    const values = entries.map((_row, index) => {
      const base = index * 3 + 1;
      return `($${base}::text, $${base + 1}::text, $${base + 2}::int)`;
    });
    for (const [consentType, legalBasis, retentionDays] of entries) {
      params.push(consentType, legalBasis, retentionDays);
    }

    await queryRunner.query(
      `UPDATE kvkk_consents AS c
          SET legal_basis = COALESCE(c.legal_basis, m.legal_basis),
              retention_days = COALESCE(c.retention_days, m.retention_days::int)
         FROM (VALUES ${values.join(', ')}) AS m(consent_type, legal_basis, retention_days)
        WHERE c.consent_type = m.consent_type
          AND (c.legal_basis IS NULL OR c.retention_days IS NULL)`,
      params,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_dispatch_receipts" DROP CONSTRAINT IF EXISTS "chk_notification_dispatch_receipt_outcome"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_dispatch_receipts" ADD CONSTRAINT "chk_notification_dispatch_receipt_outcome"
         CHECK ("outcome" IN ('provider_accepted', 'provider_rejected', 'uncertain'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP CONSTRAINT IF EXISTS "chk_notification_outbox_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD CONSTRAINT "chk_notification_outbox_status"
         CHECK ("status" IN ('pending', 'blocked_consent', 'dispatched', 'failed',
                             'approved', 'closed', 'dead_lettered', 'uncertain', 'cancelled'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "kvkk_consents" DROP COLUMN IF EXISTS "retention_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "kvkk_consents" DROP COLUMN IF EXISTS "legal_basis"`,
    );
  }
}
