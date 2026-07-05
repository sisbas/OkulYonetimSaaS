import { PERMISSION_SEED, ROLE_PERMISSION_SEED } from '../../src/database/seeds/permissions.seed';

describe('permission seed', () => {
  const permissionCodes = PERMISSION_SEED.map((permission) => permission.code);
  const permissionSet = new Set(permissionCodes);
  const teacherForbidden = [
    'student:read',
    'student:detail:read',
    'student:parent_contact:read',
    'student:kvkk:read',
    'parent_notification:read',
    'parent_notification:send',
    'parent_notification:approve',
    'tenant:update',
    'tenant:settings:update',
    'role:assign',
    'role:remove',
    'audit_log:read',
    'audit_log:security:read',
    'schedule:publish',
    'attendance:generate',
    'attendance:lock',
    'attendance:unlock',
  ];
  const operationsManagerForbidden = [
    'tenant:update',
    'tenant:settings:update',
    'tenant:branch:create',
    'tenant:branch:update',
    'user:create',
    'user:deactivate',
    'role:assign',
    'role:remove',
    'audit_log:security:read',
    'attendance:unlock',
  ];

  it('contains exactly 115 unique permissions', () => {
    expect(permissionCodes).toHaveLength(115);
    expect(permissionSet.size).toBe(115);
  });

  it('uses colon-delimited seeded permission keys', () => {
    expect(permissionCodes.every((permission) => permission.includes(':'))).toBe(true);
    expect(permissionCodes.every((permission) => !permission.includes('.'))).toBe(true);
  });

  it('is idempotent by key list and role mapping uniqueness', () => {
    expect(new Set([...permissionCodes, ...permissionCodes]).size).toBe(permissionCodes.length);
    for (const permissions of Object.values(ROLE_PERMISSION_SEED)) {
      expect(new Set(permissions).size).toBe(permissions.length);
    }
  });

  it('maps every role permission to a seeded permission', () => {
    for (const permissions of Object.values(ROLE_PERMISSION_SEED)) {
      for (const permission of permissions) expect(permissionSet.has(permission)).toBe(true);
    }
  });

  it('assigns all permissions to tenant_admin', () => {
    expect(ROLE_PERMISSION_SEED.tenant_admin).toHaveLength(permissionCodes.length);
    expect(new Set(ROLE_PERMISSION_SEED.tenant_admin)).toEqual(permissionSet);
  });

  it.each(operationsManagerForbidden)('does not assign %s to operations_manager', (permission) => {
    expect(ROLE_PERMISSION_SEED.operations_manager).not.toContain(permission);
  });

  it.each(teacherForbidden)('does not assign %s to teacher', (permission) => {
    expect(ROLE_PERMISSION_SEED.teacher).not.toContain(permission);
  });

  it('assigns only own or limited context permissions to teacher', () => {
    expect(ROLE_PERMISSION_SEED.teacher).toEqual([
      'dashboard:teacher_own_summary:read',
      'daily_operations:own:read',
      'schedule:own:read',
      'leave:create',
      'leave:own:read',
      'attendance:own:read',
      'attendance:own:submit',
      'attendance:record:update',
      'student:group_students:read',
      'teacher:own:read',
      'teacher:availability:read',
      'course:read',
      'room:read',
      'time_slot:read',
    ]);
  });
});
