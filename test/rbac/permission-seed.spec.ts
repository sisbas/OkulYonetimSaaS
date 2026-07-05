import { PERMISSION_SEED, ROLE_PERMISSION_SEED } from '../../src/database/seeds/permissions.seed';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('permission seed', () => {
  const permissionCodes = PERMISSION_SEED.map((permission) => permission.code);
  const permissionSet = new Set(permissionCodes);

  it('contains exactly 115 unique permissions', () => {
    expect(permissionCodes).toHaveLength(115);
    expect(permissionSet.size).toBe(115);
  });

  it('is idempotent by key list uniqueness', () => {
    expect(new Set([...permissionCodes, ...permissionCodes]).size).toBe(permissionCodes.length);
  });

  it('assigns all permissions to tenant_admin', () => {
    expect(ROLE_PERMISSION_SEED.tenant_admin).toHaveLength(115);
    expect(new Set(ROLE_PERMISSION_SEED.tenant_admin)).toEqual(permissionSet);
  });

  it.each(['role:assign', 'tenant:update', 'attendance:unlock'])('does not assign %s to operations_manager', (permission) => {
    expect(ROLE_PERMISSION_SEED.operations_manager).not.toContain(permission);
  });

  it.each(['student:parent_contact:read', 'parent_notification:read', 'schedule:publish'])('does not assign %s to teacher', (permission) => {
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

  it('covers all route decorator permissions and uses colon-delimited keys', () => {
    const files = ['src/users/users.controller.ts', 'src/tenants/tenants.controller.ts', 'src/rbac/rbac.controller.ts'];
    const used = files.flatMap((file) => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      return [...source.matchAll(/@Permissions\(([^)]*)\)/g)].flatMap((match) =>
        [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((permission) => permission[1]),
      );
    });
    expect(used.length).toBeGreaterThan(0);
    for (const permission of used) {
      expect(permission).not.toContain('.');
      expect(permissionSet.has(permission)).toBe(true);
    }
  });
});
