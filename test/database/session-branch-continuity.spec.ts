import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, AccessTokenPayload } from '../../src/auth/auth.service';
import { BranchScopeService } from '../../src/rbac/branch-scope.service';
import { ContextCatalogService } from '../../src/rbac/context-catalog.service';
import { PermissionGuard } from '../../src/common/guards/permission.guard';
import { SecurityAuditService } from '../../src/common/audit/security-audit.service';
import { RequestUser, RequestWithContext } from '../../src/common/context/request-context';
import { PERMISSIONS_KEY } from '../../src/common/decorators/permissions.decorator';
import { AddSessionBranchSelection1841000000000 } from '../../src/database/migrations/1841000000000-AddSessionBranchSelection';
import { Room } from '../../src/rooms/room.entity';
import { RoomRepository } from '../../src/rooms/room.repository';
import { RoomController } from '../../src/rooms/room.controller';
import { TimeSlot } from '../../src/time-slots/time-slot.entity';
import { TimeSlotRepository } from '../../src/time-slots/time-slot.repository';
import { TimeSlotController } from '../../src/time-slots/time-slot.controller';

const url = process.env.TEST_DATABASE_URL;
const postgres = url ? describe : describe.skip;
const tenant = '10000000-0000-4000-8000-000000000362';
const otherTenant = '10000000-0000-4000-8000-000000000363';
const userId = '20000000-0000-4000-8000-000000000362';
const otherUser = '20000000-0000-4000-8000-000000000363';
const sessionId = '30000000-0000-4000-8000-000000000362';
const otherSession = '30000000-0000-4000-8000-000000000363';
const branchA = '40000000-0000-4000-8000-000000000362';
const branchB = '40000000-0000-4000-8000-000000000363';
const roleId = '50000000-0000-4000-8000-000000000362';
const actor: RequestUser = { userId, tenantId: tenant, sessionId, authorizationVersion: 1,
  roleIds: ['tenant_admin'], permissions: ['user:read'] };
const payload: AccessTokenPayload = { sub: userId, tenant_id: tenant, session_id: sessionId,
  jti: sessionId, authorization_version: 1 };

// Real PostgreSQL SQL + transactional/session tests, not browser acceptance.
// Isolated reference tables keep fixtures independent of concurrent suites.
postgres('session-bound branch continuity and PostgreSQL migration rollback', () => {
  let ds: DataSource;
  let admin: DataSource;
  let scope: BranchScopeService;
  let auth: AuthService;
  const schema = `branch_362_${randomUUID().replace(/-/g, '')}`;
  const migration = new AddSessionBranchSelection1841000000000();

  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url, entities: [], synchronize: false }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = await new DataSource({ type: 'postgres', url, entities: [Room, TimeSlot], synchronize: false,
      extra: { options: `-c search_path=${schema},public` } }).initialize();
    await ds.query(`
      CREATE TABLE tenants (id uuid PRIMARY KEY, name text, status text, deleted_at timestamptz);
      CREATE TABLE users (id uuid PRIMARY KEY, token_version integer, status text, deleted_at timestamptz);
      CREATE TABLE tenant_memberships (user_id uuid, tenant_id uuid, status text, deleted_at timestamptz);
      CREATE TABLE branches (id uuid PRIMARY KEY, tenant_id uuid, name text, code text, status text,
        deleted_at timestamptz, UNIQUE(tenant_id, id), UNIQUE(tenant_id, code));
      CREATE TABLE user_sessions (id uuid PRIMARY KEY, tenant_id uuid, user_id uuid, refresh_secret_hash text,
        status text, expires_at timestamptz, revoked_at timestamptz);
      CREATE TABLE roles (id uuid PRIMARY KEY, tenant_id uuid, name text, deleted_at timestamptz);
      CREATE TABLE user_roles (user_id uuid, tenant_id uuid, role_id uuid);
      CREATE TABLE permissions (id uuid PRIMARY KEY, code text);
      CREATE TABLE role_permissions (role_id uuid, permission_id uuid);
      CREATE TABLE teachers (id uuid, tenant_id uuid, user_id uuid, status text, deleted_at timestamptz);
      CREATE TABLE teacher_branches (teacher_id uuid, tenant_id uuid, branch_id uuid, status text,
        deleted_at timestamptz, deactivated_at timestamptz, effective_from date, effective_to date);
      -- Read-only SQL scope fixtures derived from reference rows, not domain outcomes.
      CREATE VIEW leave_requests AS SELECT id, tenant_id, id AS branch_id FROM branches;
      CREATE VIEW schedule_events AS SELECT id, tenant_id, id AS branch_id FROM branches;
      CREATE VIEW schedules AS SELECT id, tenant_id, id AS branch_id FROM branches;
      CREATE VIEW attendance_sessions AS SELECT id, tenant_id, id AS branch_id FROM branches;
      CREATE TABLE rooms (id uuid PRIMARY KEY, tenant_id uuid, branch_id uuid, name text, code text,
        capacity integer, description text, status text, created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(), deactivated_at timestamptz);
      CREATE TABLE time_slots (id uuid PRIMARY KEY, tenant_id uuid, branch_id uuid, name text,
        day_of_week smallint, start_time time, end_time time, order_index integer, status text,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), archived_at timestamptz);
    `);
    const runner = ds.createQueryRunner();
    try { await migration.up(runner); } finally { await runner.release(); }
    scope = new BranchScopeService(ds);
    auth = new AuthService({} as JwtService, ds);
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  beforeEach(async () => {
    await ds.query(`TRUNCATE user_sessions, user_roles, role_permissions, roles, permissions,
      teachers, teacher_branches, branches, tenant_memberships, users, tenants, rooms, time_slots CASCADE`);
    await ds.query(`INSERT INTO tenants VALUES ($1, 'Okul', 'active', NULL), ($2, 'Diğer', 'active', NULL)`, [tenant, otherTenant]);
    await ds.query(`INSERT INTO users VALUES ($1, 1, 'active', NULL), ($2, 1, 'active', NULL)`, [userId, otherUser]);
    await ds.query(`INSERT INTO tenant_memberships VALUES ($1, $2, 'active', NULL)`, [userId, tenant]);
    await ds.query(`INSERT INTO branches VALUES ($1, $3, 'Merkez', 'ANKARA', 'active', NULL),
      ($2, $3, 'Merkez', 'IZMIR', 'active', NULL)`, [branchA, branchB, tenant]);
    await ds.query(`INSERT INTO user_sessions (id, tenant_id, user_id, refresh_secret_hash, status, expires_at)
      VALUES ($1, $3, $4, 'hash-preserved', 'active', now() + interval '1 day'),
        ($2, $3, $4, 'other-hash', 'active', now() + interval '1 day')`, [sessionId, otherSession, tenant, userId]);
    await ds.query(`INSERT INTO roles VALUES ($1, $2, 'tenant_admin', NULL);
    `, [roleId, tenant]);
    await ds.query(`INSERT INTO user_roles VALUES ($1, $2, $3)`, [userId, tenant, roleId]);
    await ds.query(`INSERT INTO permissions VALUES ($1, 'user:read')`, [roleId]);
    await ds.query(`INSERT INTO role_permissions VALUES ($1, $1)`, [roleId]);
    await ds.query(`INSERT INTO rooms (id, tenant_id, branch_id, name, code, status)
      VALUES ($1, $3, $1, 'Room A', 'A', 'active'), ($2, $3, $2, 'Room B', 'B', 'active')`, [branchA, branchB, tenant]);
    await ds.query(`INSERT INTO time_slots (id, tenant_id, branch_id, name, day_of_week, start_time, end_time, status)
      VALUES ($1, $3, $1, 'Slot A', 1, '09:00', '10:00', 'active'),
      ($2, $3, $2, 'Slot B', 1, '09:00', '10:00', 'active')`, [branchA, branchB, tenant]);
  });

  const select = () => scope.sessionContext(actor, { selection: { branchName: 'Merkez', branchCode: 'IZMIR' } });

  function request(permission = 'user:read', headerCode?: string, params = {}, controller: { name: string } = class Probe {}) {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => key === PERMISSIONS_KEY ? [permission] : false);
    const guard = new PermissionGuard(reflector,
      { emitAuthorizationDenied: jest.fn() } as unknown as SecurityAuditService, undefined, scope);
    const req = { user: actor, query: { branchId: 'IZMIR' }, body: {}, params,
      header: (name: string) => name === 'x-branch-code' ? headerCode : undefined } as unknown as RequestWithContext;
    const context = { getHandler: () => function protectedRoute() {}, getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    return { guard, req, context };
  }

  it('persists one session, restores GET catalog, and forwards the choice into the next protected request', async () => {
    await expect(scope.sessionContext(actor, { requireSelection: true })).rejects.toThrow('unauthorized_branch');
    await select();
    const authenticated = await auth.validateAccessTokenSession(payload);
    const catalog = new ContextCatalogService(ds, scope);
    const result = await catalog.build({ requestId: 'test', tenantId: tenant, user: authenticated });
    expect(result.activeBranch).toEqual({ name: 'Merkez', code: 'IZMIR' });
    expect(JSON.stringify(result)).not.toContain(branchB);
    const next = request('user:read', 'IZMIR');
    await expect(next.guard.canActivate(next.context)).resolves.toBe(true);
    expect(next.req.context?.branchId).toBe(branchB);
    expect(next.req.query.branchId).toBe(branchB);
    await expect(scope.sessionContext({ ...actor, sessionId: otherSession }, { requireSelection: true }))
      .rejects.toThrow('unauthorized_branch');
  });

  it.each([
    { ...actor, tenantId: otherTenant },
    { ...actor, userId: otherUser },
    { ...actor, sessionId: randomUUID() },
    { ...actor, authorizationVersion: 0 },
  ])('rejects invalid binding or token version %j on both reads and writes', async (invalid) => {
    await expect(scope.sessionContext(invalid)).rejects.toThrow();
    await expect(scope.sessionContext(invalid, { selection: { branchName: 'Merkez', branchCode: 'IZMIR' } })).rejects.toThrow();
  });

  it.each([
    `UPDATE tenant_memberships SET status = 'inactive'`,
    `UPDATE user_sessions SET status = 'revoked', revoked_at = now()`,
    `UPDATE user_sessions SET expires_at = now() - interval '1 second'`,
    `UPDATE users SET token_version = 2`,
  ])('rejects current membership/session invalidation in auth and context: %s', async (sql) => {
    await select();
    await ds.query(sql);
    await expect(auth.validateAccessTokenSession(payload)).rejects.toMatchObject({ status: 401 });
    const next = request();
    await expect(next.guard.canActivate(next.context)).rejects.toMatchObject({ status: 401 });
    await expect(select()).rejects.toThrow();
  });

  it('rejects a revoked selected branch rather than falling back to the only remaining branch', async () => {
    await select();
    await ds.query(`UPDATE branches SET status = 'inactive' WHERE id = $1`, [branchB]);
    const next = request();
    await expect(next.guard.canActivate(next.context)).rejects.toMatchObject({ status: 404 });
    await expect(scope.sessionContext(actor)).rejects.toThrow('unauthorized_branch');
  });

  it('ignores cached/claimed admin role after downgrade, including changed branch assignments', async () => {
    await select();
    await ds.query(`UPDATE roles SET name = 'teacher'`);
    await ds.query(`INSERT INTO teachers VALUES ($1, $2, $3, 'active', NULL)`, [roleId, tenant, userId]);
    await ds.query(`INSERT INTO teacher_branches VALUES ($1, $2, $3, 'active', NULL, NULL, CURRENT_DATE, NULL)`, [roleId, tenant, branchA]);
    const next = request();
    await expect(next.guard.canActivate(next.context)).rejects.toMatchObject({ status: 404 });
  });

  it('rechecks permissions without token-version/cache invalidation', async () => {
    await select();
    await ds.query(`DELETE FROM role_permissions`);
    const next = request();
    await expect(next.guard.canActivate(next.context)).resolves.toBe(false);
  });

  it('rejects readable request/header tampering and ambiguous names without changing persistence', async () => {
    await select();
    await expect(scope.sessionContext(actor, { selection: { branchName: 'Merkez' } })).rejects.toThrow('unauthorized_branch');
    const next = request('user:read', 'ANKARA');
    await expect(next.guard.canActivate(next.context)).rejects.toMatchObject({ status: 404 });
    const altered = request();
    altered.req.query.branchId = branchA;
    await expect(altered.guard.canActivate(altered.context)).rejects.toMatchObject({ status: 404 });
    expect((await scope.sessionContext(actor)).branch?.branchId).toBe(branchB);
  });

  it('rejects stale selection version even when a new token version is supplied', async () => {
    await select();
    await ds.query(`UPDATE users SET token_version = 2`);
    await expect(scope.sessionContext({ ...actor, authorizationVersion: 2 }))
      .rejects.toThrow('stale_authorization_version');
  });

  it.each(['leave:impact:read', 'daily_operations:update'])('rejects cross-branch ID-addressed read/mutation despite valid selected header: %s', async (permission) => {
    await select();
    await ds.query(`INSERT INTO permissions VALUES ($1, $2)`, [branchA, permission]);
    await ds.query(`INSERT INTO role_permissions VALUES ($1, $2)`, [roleId, branchA]);
    class DailyOperationsController {}
    const crossBranch = request(permission, 'IZMIR', { leaveId: branchA, scheduleEventId: branchB }, DailyOperationsController);
    await expect(crossBranch.guard.canActivate(crossBranch.context)).rejects.toMatchObject({ status: 404 });
    const sameBranch = request(permission, 'IZMIR', { leaveId: branchB, scheduleEventId: branchB }, DailyOperationsController);
    await expect(sameBranch.guard.canActivate(sameBranch.context)).resolves.toBe(true);
    const crossEvent = request(permission, 'IZMIR', { leaveId: branchB, scheduleEventId: branchA }, DailyOperationsController);
    await expect(crossEvent.guard.canActivate(crossEvent.context)).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    { controller: class LeaveController {}, table: 'leave_requests' },
    { controller: class ScheduleController {}, table: 'schedules' },
    { controller: class AttendanceSessionController {}, table: 'attendance_sessions' },
  ])('narrows ID-addressed $table to the persisted branch (read-only SQL fixture)', async ({ controller }) => {
    await select();
    const denied = request('user:read', 'IZMIR', { id: branchA }, controller);
    await expect(denied.guard.canActivate(denied.context)).rejects.toMatchObject({ status: 404 });
    const allowed = request('user:read', 'IZMIR', { id: branchB }, controller);
    await expect(allowed.guard.canActivate(allowed.context)).resolves.toBe(true);
  });

  it('does not save selection after concurrent session revocation wins the row lock', async () => {
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    let pending: Promise<unknown> | undefined;
    try {
      await runner.query(`UPDATE user_sessions SET status = 'revoked', revoked_at = now() WHERE id = $1`, [sessionId]);
      // Observe the actual lock wait instead of relying on an arbitrary sleep.
      pending = select().then(() => ({ allowed: true }), (error: unknown) => ({ error }));
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const rows = await admin.query(`SELECT 1 FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE OF s%'`);
        if (rows.length) { blocked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await runner.commitTransaction();
      const outcome = await pending;
      expect(outcome).toHaveProperty('error');
      expect(outcome).not.toHaveProperty('allowed');
      const rows = await ds.query(`SELECT selected_branch_id FROM user_sessions WHERE id = $1`, [sessionId]);
      expect(rows[0].selected_branch_id).toBeNull();
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
      if (pending) await pending;
    }
  });

  async function grant(permission: string) {
    const id = randomUUID();
    await ds.query(`INSERT INTO permissions VALUES ($1, $2)`, [id, permission]);
    await ds.query(`INSERT INTO role_permissions VALUES ($1, $2)`, [roleId, id]);
  }

  const branchOwnedActions = [
    { controller: RoomController, permission: 'room:read', method: 'GET', action: 'read' },
    { controller: RoomController, permission: 'room:update', method: 'PATCH', action: 'update' },
    { controller: RoomController, permission: 'room:archive', method: 'POST', action: 'archive' },
    { controller: RoomController, permission: 'room:archive', method: 'POST', action: 'reactivate' },
    { controller: TimeSlotController, permission: 'time_slot:read', method: 'GET', action: 'read' },
    { controller: TimeSlotController, permission: 'time_slot:update', method: 'PATCH', action: 'update' },
    { controller: TimeSlotController, permission: 'time_slot:delete', method: 'POST', action: 'archive' },
    { controller: TimeSlotController, permission: 'time_slot:update', method: 'POST', action: 'reactivate' },
  ];

  it.each(branchOwnedActions)('selected A denies other-branch $permission / $action before read or mutation', async ({ controller, permission, method, action }) => {
    await scope.sessionContext(actor, { selection: { branchName: 'Merkez', branchCode: 'ANKARA' } });
    await grant(permission);
    if (action === 'reactivate') {
      await ds.query(`UPDATE rooms SET status = 'inactive' WHERE id = $1`, [branchB]);
      await ds.query(`UPDATE time_slots SET status = 'inactive' WHERE id = $1`, [branchB]);
    }
    const denied = request(permission, 'ANKARA', { id: branchB }, controller);
    denied.req.query = {};
    denied.req.method = method;
    await expect(denied.guard.canActivate(denied.context)).rejects.toMatchObject({ status: 404 });
    const allowed = request(permission, 'ANKARA', { id: branchA }, controller);
    allowed.req.query = {};
    allowed.req.method = method;
    await expect(allowed.guard.canActivate(allowed.context)).resolves.toBe(true);
  });

  it.each([
    { controller: RoomController, permission: 'room:read', kind: 'room' },
    { controller: TimeSlotController, permission: 'time_slot:read', kind: 'slot' },
    { controller: TimeSlotController, permission: 'time_slot:calendar:read', kind: 'calendar' },
  ])('GET $kind list receives selected A scope and repository returns only A rows', async ({ controller, permission, kind }) => {
    await scope.sessionContext(actor, { selection: { branchName: 'Merkez', branchCode: 'ANKARA' } });
    await grant(permission);
    const next = request(permission, 'ANKARA', {}, controller);
    next.req.method = 'GET';
    next.req.query = {};
    await expect(next.guard.canActivate(next.context)).resolves.toBe(true);
    expect(next.req.query.branchId).toBe(branchA);
    const rows = kind === 'room'
      ? (await new RoomRepository(ds.getRepository(Room)).list(next.req.context!, { branchId: next.req.query.branchId as string })).data
      : kind === 'calendar'
        ? await new TimeSlotRepository(ds.getRepository(TimeSlot)).calendar(next.req.context!, next.req.query.branchId as string)
        : (await new TimeSlotRepository(ds.getRepository(TimeSlot)).list(next.req.context!, { branchId: next.req.query.branchId as string })).data;
    expect(rows.map((row) => row.id)).toEqual([branchA]);
    const tampered = request(permission, 'ANKARA', {}, controller);
    tampered.req.method = 'GET';
    tampered.req.query = { branchId: branchB };
    await expect(tampered.guard.canActivate(tampered.context)).rejects.toMatchObject({ status: 404 });
  });

  it.each(['body', 'query'] as const)('assignment removal cannot authorize a supplied same-tenant UUID through %s with no selected branch', async (input) => {
    await grant('room:create');
    await ds.query(`UPDATE roles SET name = 'teacher'`);
    await ds.query(`INSERT INTO teachers VALUES ($1, $2, $3, 'active', NULL)`, [roleId, tenant, userId]);
    await ds.query(`INSERT INTO teacher_branches VALUES ($1, $2, $3, 'active', NULL, NULL, CURRENT_DATE, NULL)`, [roleId, tenant, branchA]);
    const before = request('room:create', undefined, {}, RoomController);
    before.req.query = {};
    before.req.body = { branchId: branchA };
    await expect(before.guard.canActivate(before.context)).resolves.toBe(true);
    await ds.query(`DELETE FROM teacher_branches WHERE teacher_id = $1`, [roleId]);
    const next = request('room:create', undefined, {}, RoomController);
    next.req.query = {};
    next.req.body = {};
    next.req[input] = { branchId: branchA };
    await expect(next.guard.canActivate(next.context)).rejects.toMatchObject({ status: 404 });
    const global = request('user:read');
    global.req.query = {};
    await expect(global.guard.canActivate(global.context)).resolves.toBe(true);
    const globalSelector = request('user:read');
    globalSelector.req.query = { branchId: branchA };
    await expect(globalSelector.guard.canActivate(globalSelector.context)).rejects.toMatchObject({ status: 404 });
  });

  it('fails closed for a newly introduced branch-permission controller omitted from the scope map', async () => {
    await select();
    await grant('room:read');
    class FutureRoomController {}
    const omitted = request('room:read', 'IZMIR', {}, FutureRoomController);
    await expect(omitted.guard.canActivate(omitted.context)).rejects.toMatchObject({ status: 401 });
  });

  it('keeps a truly tenant-wide route accessible without branch selection, while room lists fail closed', async () => {
    const global = request('user:read');
    global.req.query = {};
    await expect(global.guard.canActivate(global.context)).resolves.toBe(true);
    await grant('room:read');
    const scoped = request('room:read', undefined, {}, RoomController);
    scoped.req.method = 'GET';
    scoped.req.query = {};
    await expect(scoped.guard.canActivate(scoped.context)).rejects.toMatchObject({ status: 404 });
  });

  it('upgrades existing sessions, enforces tenant-bound FK, rolls back without losing hashes, then upgrades again', async () => {
    await select();
    const runner = ds.createQueryRunner();
    try {
      await migration.down(runner);
      const old = await runner.query(`SELECT refresh_secret_hash FROM user_sessions WHERE id = $1`, [sessionId]);
      expect(old[0].refresh_secret_hash).toBe('hash-preserved');
      await migration.up(runner);
      const upgraded = await runner.query(`SELECT selected_branch_id, selected_branch_version FROM user_sessions WHERE id = $1`, [sessionId]);
      expect(upgraded[0]).toEqual({ selected_branch_id: null, selected_branch_version: null });
      await runner.query(`INSERT INTO branches VALUES ($1, $2, 'Other', 'OTHER', 'active', NULL)`, [randomUUID(), otherTenant]);
      await expect(runner.query(`UPDATE user_sessions SET selected_branch_id =
        (SELECT id FROM branches WHERE tenant_id = $1), selected_branch_version = 1 WHERE id = $2`, [otherTenant, sessionId]))
        .rejects.toMatchObject({ driverError: { code: '23503' } });
      await select();
    } finally { await runner.release(); }
  });
});
