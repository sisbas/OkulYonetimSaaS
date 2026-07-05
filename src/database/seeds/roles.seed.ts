export const ROLE_SEED = [
  { code: 'tenant_admin', permissions: ['tenant.read', 'tenant.update', 'user.read', 'user.create', 'user.update', 'user.delete', 'rbac.read', 'rbac.assign', 'audit.read'] },
  { code: 'school_admin', permissions: ['tenant.read', 'user.read', 'user.create', 'user.update', 'rbac.read'] },
  { code: 'teacher', permissions: ['tenant.read', 'user.read'] },
] as const;
