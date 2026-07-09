import { readFileSync } from 'fs';
import { join } from 'path';
import { ROLE_PERMISSION_SEED } from '../../src/database/seeds/permissions.seed';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Gate 1 KVKK acceptance checks', () => {
  it('keeps parent contact and broad student/audit access out of the teacher role', () => {
    const teacherPermissions = new Set<string>(ROLE_PERMISSION_SEED.teacher);
    const forbiddenTeacherPermissions = [
      'student:parent_contact:read',
      'student:read',
      'student:detail:read',
      'student:kvkk:read',
      'attendance:read',
      'attendance:absence:read',
      'audit_log:read',
      'audit_log:operations:read',
      'audit_log:security:read',
      'parent_notification:send',
      'parent_notification:approve',
    ];

    for (const permission of forbiddenTeacherPermissions) {
      expect(teacherPermissions.has(permission)).toBe(false);
    }
  });

  it('requires KVKK consent schema to support parent notification consent without raw contact duplication', () => {
    const migration = readRepoFile('src/database/migrations/1700000000010-CreateKvkkConsents.ts');

    expect(migration).toContain('parent_notification');
    expect(migration).toContain('sms_notification');
    expect(migration).toContain('whatsapp_notification');
    expect(migration).toContain('email_notification');
    expect(migration).toContain('contact_phone_masked');
    expect(migration).toContain('contact_email_masked');
    expect(migration).not.toMatch(/\bcontact_phone\s+varchar/i);
    expect(migration).not.toMatch(/\bcontact_email\s+varchar/i);
    expect(migration).toContain('Raw contact data must remain in tenant-scoped domain tables');
  });

  it('redacts credential, token, phone, email, parent contact and sensitive guidance keys from audit logs', () => {
    const auditInterceptor = readRepoFile('src/common/interceptors/audit.interceptor.ts');
    const requiredSensitivePatterns = [
      'password',
      'credential',
      'secret',
      'refreshtoken',
      'accesstoken',
      'token',
      'email',
      'phone',
      'parentphone',
      'guardianphone',
      'parentcontact',
      'guardiancontact',
      'counselingnote',
      'guidancenote',
    ];

    for (const pattern of requiredSensitivePatterns) {
      expect(auditInterceptor).toContain(`'${pattern}'`);
    }

    expect(auditInterceptor).toContain('[REDACTED]');
    expect(auditInterceptor).toContain('normalizeKey');
  });
});
