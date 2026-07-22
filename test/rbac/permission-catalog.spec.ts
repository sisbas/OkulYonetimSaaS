import {
  PHASE_1_PERMISSION_CATALOG,
  findPermissionCatalogEntry,
  getPermissionCatalogForRole,
} from '../../src/rbac/permission-catalog';

describe('Phase 1 permission catalog v1', () => {
  it('defines the required contract fields for every mapping', () => {
    for (const entry of PHASE_1_PERMISSION_CATALOG) {
      expect(entry.role).toBeTruthy();
      expect(entry.route).toBeTruthy();
      expect(entry.action).toBeTruthy();
      expect(entry.resource).toBeTruthy();
      expect(entry.permission).toBeTruthy();
      expect(typeof entry.audit_required).toBe('boolean');
      expect(entry.deny_state).toBeTruthy();
    }
  });

  it('maps role to route, action and resource for teacher attendance submit', () => {
    expect(findPermissionCatalogEntry({
      role: 'teacher',
      route: '/attendance/sessions/:sessionId/submit',
      action: 'submit',
      resource: 'attendance.own',
    })).toMatchObject({
      permission: 'attendance:own:submit',
      effect: 'allow',
      audit_required: true,
      deny_state: 'none',
    });
  });

  it('keeps parent contact hidden from teacher role through explicit 403 deny mapping', () => {
    expect(findPermissionCatalogEntry({
      role: 'teacher',
      route: '/students/:studentId/parent-contact',
      action: 'read',
      resource: 'student.parent_contact',
    })).toMatchObject({
      permission: 'student:parent_contact:read',
      effect: 'deny',
      audit_required: true,
      deny_state: 'forbidden_403',
    });
  });

  it('marks notification send as audit required and KVKK-blockable', () => {
    expect(findPermissionCatalogEntry({
      role: 'operations_manager',
      route: '/parent-notifications/:notificationId/send',
      action: 'send',
      resource: 'parent_notification',
    })).toMatchObject({
      permission: 'parent_notification:send',
      audit_required: true,
      deny_state: 'blocked_kvkk',
    });
  });

  it('returns only mappings for the requested role', () => {
    const teacherMappings = getPermissionCatalogForRole('teacher');
    expect(teacherMappings.length).toBeGreaterThan(0);
    expect(teacherMappings.every((entry) => entry.role === 'teacher')).toBe(true);
  });

  it('allows teachers to create and read only their own leave requests', () => {
    expect(findPermissionCatalogEntry({
      role: 'teacher',
      route: '/leave-requests',
      action: 'create',
      resource: 'leave_request.own',
    })).toMatchObject({
      permission: 'leave:create',
      effect: 'allow',
      audit_required: true,
    });
    expect(findPermissionCatalogEntry({
      role: 'teacher',
      route: '/leave-requests/me',
      action: 'read',
      resource: 'leave_request.own',
    })).toMatchObject({
      permission: 'leave:own:read',
      effect: 'allow',
    });
  });

  it('keeps manager leave decisions explicit and audit-required', () => {
    expect(findPermissionCatalogEntry({
      role: 'operations_manager',
      route: '/leave-requests/:requestId/approve',
      action: 'approve',
      resource: 'leave_request',
    })).toMatchObject({
      permission: 'leave:approve',
      effect: 'allow',
      audit_required: true,
      deny_state: 'masked',
    });
    expect(findPermissionCatalogEntry({
      role: 'operations_manager',
      route: '/leave-requests/:requestId/reject',
      action: 'reject',
      resource: 'leave_request',
    })).toMatchObject({
      permission: 'leave:reject',
      effect: 'allow',
      audit_required: true,
      deny_state: 'masked',
    });
  });

  it('does not grant the teacher role a manager decision mapping', () => {
    expect(findPermissionCatalogEntry({
      role: 'teacher',
      route: '/leave-requests/:requestId/approve',
      action: 'approve',
      resource: 'leave_request',
    })).toBeUndefined();
  });
});
