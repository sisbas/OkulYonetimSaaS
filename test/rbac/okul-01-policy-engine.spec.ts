import { RbacPolicyService } from '../../src/rbac/rbac-policy.service';
import {
  OKUL01_PERMISSION_MATRIX,
  OKUL01_EXTENDED_ROLES,
  isKvkkSubjectRole,
  KVKK_SUBJECT_ROLES,
} from '../../src/rbac/roles.extended';
import { SystemRole } from '../../src/rbac/roles.extended';

describe('OKUL-01 RbacPolicyService — karar motoru', () => {
  const policy = new RbacPolicyService();

  const actor = (over: Partial<{ roleIds: SystemRole[]; permissions: string[]; tenantId: string }> = {}) => ({
    roleIds: over.roleIds ?? ['student'],
    permissions: over.permissions ?? ['student:read'],
    tenantId: over.tenantId ?? 'tenant-a',
  });

  it('öğrenci rolüne student:read izni verir', () => {
    const decision = policy.decide({
      roleIds: ['student'],
      permissions: ['student:read'],
      actorTenantId: 'tenant-a',
      permission: 'student:read',
      resource: 'student',
    });
    expect(decision.allowed).toBe(true);
    expect(decision.statusCode).toBe(200);
    expect(decision.reasonCode).toBeNull();
  });

  it('öğrencinin veli iletişimini görmeye ÇALIŞMASINI açık deny ile engeller (KVKK)', () => {
    const decision = policy.decide({
      roleIds: ['student'],
      permissions: ['student:parent_contact:read'],
      actorTenantId: 'tenant-a',
      permission: 'student:parent_contact:read',
      resource: 'student.parent_contact',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('explicit_deny');
    expect(decision.denyState).toBe('forbidden_403');
    expect(decision.auditRequired).toBe(true);
  });

  it('öğretmen yardımcının leave onay/red yetkisi yoktur (explicit deny)', () => {
    for (const permission of ['leave:approve', 'leave:reject']) {
      const decision = policy.decide({
        roleIds: ['teacher_assistant'],
        permissions: [permission],
        actorTenantId: 'tenant-a',
        permission,
        resource: 'leave_request',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('explicit_deny');
      expect(decision.statusCode).toBe(403);
    }
  });

  it('öğretmen yardımcının veli iletişimine erişememesini KVKK ile engeller', () => {
    const decision = policy.decide({
      roleIds: ['teacher_assistant'],
      permissions: ['student:parent_contact:read'],
      actorTenantId: 'tenant-a',
      permission: 'student:parent_contact:read',
      resource: 'student.parent_contact',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('explicit_deny');
  });

  it('velinin hassas rapor kaynağına (report.student) erişimini KVKK ile engeller', () => {
    const decision = policy.decide({
      roleIds: ['parent'],
      permissions: ['report:student:read'],
      actorTenantId: 'tenant-a',
      permission: 'report:student:read',
      resource: 'report.student',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('kvkk_pii_protected');
    expect(decision.denyState).toBe('blocked_kvkk');
  });

  it('velinin kendi çocuğunun veli iletişimini okumasına izin verir (açık allow)', () => {
    const decision = policy.decide({
      roleIds: ['parent'],
      permissions: ['student:parent_contact:read'],
      actorTenantId: 'tenant-a',
      permission: 'student:parent_contact:read',
      resource: 'student.parent_contact',
    });
    expect(decision.allowed).toBe(true);
    expect(decision.auditRequired).toBe(true);
  });

  it('tenant izolasyonu ihlalinde 403 döner (tenant_isolation_breach)', () => {
    const decision = policy.decide({
      roleIds: ['tenant_admin'],
      permissions: ['student:read'],
      actorTenantId: 'tenant-a',
      targetTenantId: 'tenant-b',
      permission: 'student:read',
      resource: 'student',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('tenant_isolation_breach');
    expect(decision.denyState).toBe('forbidden_403');
  });

  it('tenant içi erişimde tenant izolasyonu engellemez', () => {
    const decision = policy.decide({
      roleIds: ['operations_manager'],
      permissions: ['student:read'],
      actorTenantId: 'tenant-a',
      targetTenantId: 'tenant-a',
      permission: 'student:read',
      resource: 'student',
    });
    expect(decision.allowed).toBe(true);
  });

  it('efektif izin kümesinde olmayan izin için missing_permission ile reddeder', () => {
    const decision = policy.decide({
      roleIds: ['student'],
      permissions: ['student:read'],
      actorTenantId: 'tenant-a',
      permission: 'role:permission:update',
      resource: 'role.permission',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('missing_permission');
  });

  it('fail-closed: belirsiz kaynak/izinde varsayılan ret', () => {
    const decision = policy.decide({
      roleIds: ['student'],
      permissions: [],
      actorTenantId: 'tenant-a',
      permission: 'unknown:thing',
      resource: 'unknown.thing',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.statusCode).toBe(403);
  });

  it('resolveEffectivePermissions yeni rolleri doğru çözümler', () => {
    const studentPerms = policy.resolveEffectivePermissions(['student']);
    expect(studentPerms).toContain('student:read');
    expect(studentPerms).not.toContain('student:parent_contact:read'); // deny dışlandı

    const assistantPerms = policy.resolveEffectivePermissions(['teacher_assistant']);
    expect(assistantPerms).toContain('attendance:own:submit');
    expect(assistantPerms).not.toContain('leave:approve'); // deny dışlandı
  });

  it('listExtendedRoles OKUL-01 rollerini döndürür', () => {
    const roles = policy.listExtendedRoles();
    for (const role of OKUL01_EXTENDED_ROLES) {
      expect(roles).toContain(role);
    }
  });

  it('matrix yalnızca OKUL-01 rollerini ve seed\'li izinleri kullanır', () => {
    for (const mapping of OKUL01_PERMISSION_MATRIX) {
      expect(OKUL01_EXTENDED_ROLES).toContain(mapping.role);
      expect(typeof mapping.permission).toBe('string');
      expect(['allow', 'deny']).toContain(mapping.effect);
    }
  });

  it('KVKK öznesi roller yalnızca student ve parent içerir', () => {
    expect(KVKK_SUBJECT_ROLES).toEqual(['student', 'parent']);
    expect(isKvkkSubjectRole('student')).toBe(true);
    expect(isKvkkSubjectRole('teacher')).toBe(false);
    expect(isKvkkSubjectRole('teacher_assistant')).toBe(false);
  });

  it('her yeni rol için en az bir allow kuralı vardır', () => {
    for (const role of OKUL01_EXTENDED_ROLES) {
      const allows = OKUL01_PERMISSION_MATRIX.filter((m) => m.role === role && m.effect === 'allow');
      expect(allows.length).toBeGreaterThan(0);
    }
  });
});
