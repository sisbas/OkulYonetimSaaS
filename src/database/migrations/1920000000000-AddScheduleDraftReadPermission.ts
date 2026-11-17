import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #448 — yönetim draft-read izin anahtarı (`schedule:draft:read`).
 *
 * Sözleşme (docs/m3/schedule-contract-v1.md "Permission and visibility matrix"):
 * Draft list/detail read yalnız tenant_admin ve operations_manager'a açıktır;
 * teacher ve viewer keşif yapamaz (non-enumerating).
 *
 * Mevcut tenant'lara (seed yalnız system-seed tenant'ı çalıştırır; prod/pilot
 * tenant'ları bu satırı beklemeyebilir) anahtarı ve grants'i dağıtır.
 * Idempotent: tekrar çalıştırmada satır/grant çoğaltmaz.
 */
export class AddScheduleDraftReadPermission1920000000000 implements MigrationInterface {
  name = 'AddScheduleDraftReadPermission1920000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO permissions (code, description)
       VALUES ('schedule:draft:read', 'schedule:draft:read')
       ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
    );
    // Yalnızca rol adıyla eşleşen tenant_admin/operations_manager grant'ları;
    // teacher/viewer/student/parent/teacher_assistant grant'ları bu migration
    // tarafından ÜRETİLMEZ (sözleşme: Hidden).
    await queryRunner.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id
         FROM roles r
         CROSS JOIN permissions p
        WHERE p.code = 'schedule:draft:read'
          AND r.name IN ('tenant_admin', 'operations_manager')
          AND r.deleted_at IS NULL
       ON CONFLICT DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM role_permissions rp
        USING roles r, permissions p
        WHERE rp.role_id = r.id AND rp.permission_id = p.id AND p.code = 'schedule:draft:read'`,
    );
    await queryRunner.query(
      `DELETE FROM permissions WHERE code = 'schedule:draft:read'`,
    );
  }
}
