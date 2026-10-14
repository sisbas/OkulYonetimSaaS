import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PR #414 review kararları (Q3 + Q6).
 *
 * Q3 — `kvkk_consents` hukuki zemin + saklama süresi kolonları:
 * - `legal_basis`: onayın hukuki dayanağı (map'ten consent-time yazılır; bkz.
 *   `CONSENT_TYPE_METADATA` in consent-authority.ts).
 * - `retention_days`: onay kaydının saklama süresi (gün).
 * - Mevcut satırlar NULL kalır (geriye dönük uyum); yeni yazım map'ten gelir.
 *
 * Q6 — `delivered` durumu: simüle sağlayıcı, accept modunda denemeyi kabul
 * ettiğinde satır artık yalnız `dispatched` (gönderildi) değil `delivered`
 * (teslim edildi) durumuna geçer. `provider_delivered` outcome'u receipt'e
 * dayanıklı olarak yazılır. `simulated = true` CHECK'i DEĞİŞMEZ: gerçek dış
 * teslimat yine imkânsızdır (fail-closed korunur).
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
