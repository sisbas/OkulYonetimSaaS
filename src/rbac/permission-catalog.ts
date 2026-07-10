export type Phase1Role = 'tenant_admin' | 'operations_manager' | 'teacher';

export type PermissionEffect = 'allow' | 'deny';

export type PermissionDenyState = 'none' | 'forbidden_403' | 'masked' | 'blocked_kvkk';

export interface PermissionCatalogEntry {
  key: string;
  role: Phase1Role;
  route: string;
  action: string;
  resource: string;
  permission: string;
  effect: PermissionEffect;
  audit_required: boolean;
  deny_state: PermissionDenyState;
}

export const PHASE_1_PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = [
  {
    key: 'teacher.schedule.own.read',
    role: 'teacher',
    route: '/schedule/me',
    action: 'read',
    resource: 'schedule.own',
    permission: 'schedule:own:read',
    effect: 'allow',
    audit_required: false,
    deny_state: 'none',
  },
  {
    key: 'teacher.attendance.own.submit',
    role: 'teacher',
    route: '/attendance/sessions/:sessionId/submit',
    action: 'submit',
    resource: 'attendance.own',
    permission: 'attendance:own:submit',
    effect: 'allow',
    audit_required: true,
    deny_state: 'none',
  },
  {
    key: 'teacher.student.group.read',
    role: 'teacher',
    route: '/student-groups/:groupId/students',
    action: 'read',
    resource: 'student.group_students',
    permission: 'student:group_students:read',
    effect: 'allow',
    audit_required: false,
    deny_state: 'masked',
  },
  {
    key: 'teacher.student.parent_contact.read.deny',
    role: 'teacher',
    route: '/students/:studentId/parent-contact',
    action: 'read',
    resource: 'student.parent_contact',
    permission: 'student:parent_contact:read',
    effect: 'deny',
    audit_required: true,
    deny_state: 'forbidden_403',
  },
  {
    key: 'operations.student.parent_contact.read',
    role: 'operations_manager',
    route: '/students/:studentId/parent-contact',
    action: 'read',
    resource: 'student.parent_contact',
    permission: 'student:parent_contact:read',
    effect: 'allow',
    audit_required: true,
    deny_state: 'none',
  },
  {
    key: 'operations.parent_notification.approve',
    role: 'operations_manager',
    route: '/parent-notifications/:notificationId/approve',
    action: 'approve',
    resource: 'parent_notification',
    permission: 'parent_notification:approve',
    effect: 'allow',
    audit_required: true,
    deny_state: 'none',
  },
  {
    key: 'operations.parent_notification.send.blocked_kvkk',
    role: 'operations_manager',
    route: '/parent-notifications/:notificationId/send',
    action: 'send',
    resource: 'parent_notification',
    permission: 'parent_notification:send',
    effect: 'allow',
    audit_required: true,
    deny_state: 'blocked_kvkk',
  },
  {
    key: 'tenant_admin.role.permission.update',
    role: 'tenant_admin',
    route: '/roles/:roleId/permissions',
    action: 'update',
    resource: 'role.permission',
    permission: 'role:permission:update',
    effect: 'allow',
    audit_required: true,
    deny_state: 'none',
  },
] as const;

export function getPermissionCatalogForRole(role: Phase1Role): PermissionCatalogEntry[] {
  return PHASE_1_PERMISSION_CATALOG.filter((entry) => entry.role === role);
}

export function findPermissionCatalogEntry(input: {
  role: Phase1Role;
  route: string;
  action: string;
  resource: string;
}): PermissionCatalogEntry | undefined {
  return PHASE_1_PERMISSION_CATALOG.find(
    (entry) =>
      entry.role === input.role &&
      entry.route === input.route &&
      entry.action === input.action &&
      entry.resource === input.resource,
  );
}
