import { GLOBAL_TABLES, TENANT_SCOPED_TABLES } from '../../src/database/repositories/base-tenant.repository';

describe('tenant repository scope registry', () => {
  it('keeps global users and permissions outside tenant-scoped repository guard list', () => {
    expect(TENANT_SCOPED_TABLES).not.toContain('users');
    expect(TENANT_SCOPED_TABLES).not.toContain('permissions');
    expect(GLOBAL_TABLES).toEqual(expect.arrayContaining(['users', 'permissions', 'migrations']));
  });

  it('covers Sprint 0 and P0 tenant-scoped tables', () => {
    expect(TENANT_SCOPED_TABLES).toEqual(expect.arrayContaining([
      'tenant_settings',
      'branches',
      'tenant_memberships',
      'roles',
      'user_roles',
      'user_sessions',
      'audit_logs',
      'kvkk_consent_subjects',
      'kvkk_consents',
      'kvkk_consent_events',
    ]));
  });
});
