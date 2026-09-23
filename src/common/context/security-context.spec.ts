import {
  AuthorizationContextError,
  assertClientSelectionMatchesServer,
  buildAuthorizedContext,
  selectActiveRole,
} from './authorization-context';
import {
  CONTEXT_AUDIT_FORBIDDEN_KEYS,
  CONTEXT_AUDIT_METADATA_ALLOWLIST,
  buildContextAuditEvent,
  legacySecurityAuditReasonCode,
  redactContextAuditMetadata,
} from './context-audit';
import { decideDeny, indistinguishableDenials, toDenyException } from './deny-response';
import { PUBLIC_ROUTE_KEYS, isPublicRouteHandler } from './public-route';
import { REQUEST_CONTEXT_VERSION, RequestUser } from './request-context';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const BRANCH_A = '33333333-3333-4333-8333-333333333333';

const user = (overrides: Partial<RequestUser> = {}): RequestUser => ({
  userId: '44444444-4444-4444-8444-444444444444',
  tenantId: TENANT_A,
  roleIds: ['operations_manager'],
  permissions: ['user:read'],
  authorizationVersion: 3,
  ...overrides,
});

const authority = (overrides: Record<string, unknown> = {}) => ({
  roles: ['operations_manager'],
  permissions: ['user:read'],
  tokenVersion: 3,
  resolvedAt: '2026-09-23T10:00:00.000Z',
  cache: 'miss' as const,
  ...overrides,
});

describe('buildAuthorizedContext (server-authoritative context)', () => {
  it('builds a request context carrying tenant, branch, active role and effective permissions', () => {
    const context = buildAuthorizedContext({
      requestId: 'req-1',
      user: user(),
      authority: authority(),
      branch: { branchId: BRANCH_A, branchName: 'Merkez Kampüs', source: 'membership_default' },
    });

    expect(context.contextVersion).toBe(REQUEST_CONTEXT_VERSION);
    expect(context.tenantId).toBe(TENANT_A);
    expect(context.branchId).toBe(BRANCH_A);
    expect(context.branch?.branchName).toBe('Merkez Kampüs');
    expect(context.activeRole).toBe('operations_manager');
    expect(context.permissions).toEqual(['user:read']);
    expect(context.authorization).toMatchObject({ resolvedFrom: 'server', tokenVersion: 3 });
  });

  it('picks a deterministic active role, but never a role the server did not grant', () => {
    expect(selectActiveRole(['teacher', 'tenant_admin'])).toBe('tenant_admin');
    expect(selectActiveRole(['teacher'])).toBe('teacher');
    expect(selectActiveRole(['teacher'], 'tenant_admin')).toBeUndefined();
  });

  it('fails closed without an authenticated user or tenant scope', () => {
    expect(() =>
      buildAuthorizedContext({ requestId: 'r', user: null, authority: authority() }),
    ).toThrow(AuthorizationContextError);
    expect(() =>
      buildAuthorizedContext({ requestId: 'r', user: user({ tenantId: '' }), authority: authority() }),
    ).toThrow(AuthorizationContextError);
  });

  it('fails closed when authority cannot be resolved or is malformed', () => {
    expect(() => buildAuthorizedContext({ requestId: 'r', user: user(), authority: null })).toThrow(
      AuthorizationContextError,
    );
    expect(() =>
      buildAuthorizedContext({
        requestId: 'r',
        user: user(),
        authority: authority({ permissions: [123] }),
      }),
    ).toThrow(AuthorizationContextError);
  });

  it('rejects a stale token version (token_version compatibility)', () => {
    expect(() =>
      buildAuthorizedContext({
        requestId: 'r',
        user: user({ authorizationVersion: 2 }),
        authority: authority({ tokenVersion: 5 }),
      }),
    ).toThrow(AuthorizationContextError);
  });

  it('rejects a client-claimed active role that the server did not grant', () => {
    expect(() =>
      buildAuthorizedContext({
        requestId: 'r',
        user: user(),
        authority: authority({ roles: ['teacher'], activeRole: 'tenant_admin' }),
      }),
    ).toThrow(AuthorizationContextError);
  });

  it('never lets a client tenant/branch selection create authority', () => {
    const context = buildAuthorizedContext({
      requestId: 'r',
      user: user(),
      authority: authority(),
      branch: { branchId: BRANCH_A, branchName: 'Merkez', source: 'request_selection' },
    });
    expect(
      assertClientSelectionMatchesServer(context, { tenantId: TENANT_A, branchId: BRANCH_A }),
    ).toBe(true);
    expect(assertClientSelectionMatchesServer(context, { tenantId: TENANT_B })).toBe(false);
    expect(
      assertClientSelectionMatchesServer(context, {
        branchId: '99999999-9999-4999-8999-999999999999',
      }),
    ).toBe(false);
  });
});

describe('non-enumerating deny contract', () => {
  it('maps cross-tenant, cross-branch and unknown resources to the same 404', () => {
    expect(decideDeny('cross_tenant_or_unknown_resource').status).toBe(404);
    expect(
      indistinguishableDenials('cross_tenant_or_unknown_resource', 'branch_not_authorized'),
    ).toBe(true);
    expect(toDenyException('branch_not_authorized').getStatus()).toBe(404);
  });

  it('does not reveal whether a resource exists for a permission denial', () => {
    expect(indistinguishableDenials('missing_permission', 'undeclared_protected_route')).toBe(true);
    expect(decideDeny('missing_permission').status).toBe(403);
    expect(decideDeny('client_authority_rejected').message).toBe(
      decideDeny('missing_permission').message,
    );
  });

  it('keeps anonymous/context failures on 401 with one generic message', () => {
    expect(decideDeny('unresolved_context').status).toBe(401);
    expect(indistinguishableDenials('unresolved_context', 'missing_authenticated_context')).toBe(
      true,
    );
  });
});

describe('context audit metadata (allowlist + redaction)', () => {
  it('drops every non-allowlisted field, including PII and payload keys', () => {
    const event = buildContextAuditEvent({
      reasonCode: 'missing_permission',
      requiredPermission: ['user:read'],
      context: {
        requestId: 'req-9',
        tenantId: TENANT_A,
        userId: 'u-1',
        contextVersion: 'context:v2',
      },
    });
    const keys = Object.keys(event);
    const allowed = CONTEXT_AUDIT_METADATA_ALLOWLIST as ReadonlyArray<string>;
    expect(keys.every((key) => allowed.includes(key))).toBe(true);
    for (const forbidden of CONTEXT_AUDIT_FORBIDDEN_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
    expect(JSON.stringify(event)).not.toContain('@');
  });

  it('redacts secret-looking values inside allowlisted fields', () => {
    const redacted = redactContextAuditMetadata({
      requestId: 'Bearer abc.def.ghi',
      actorId: 'user@example.com',
      resource: 'user',
      body: { email: 'user@example.com' },
    });
    expect(redacted.requestId).toBe('[redacted]');
    expect(redacted.actorId).toBe('[redacted]');
    expect(redacted.resource).toBe('user');
    expect(redacted.body).toBeUndefined();
  });

  it('routes only reason codes the legacy security audit channel supports', () => {
    expect(legacySecurityAuditReasonCode('missing_permission')).toBe('missing_permission');
    expect(legacySecurityAuditReasonCode('client_authority_rejected')).toBe(
      'tenant_header_mismatch',
    );
    expect(legacySecurityAuditReasonCode('unresolved_context')).toBeNull();
  });
});

describe('public route allowlist', () => {
  it('is exact and matches handler identity only', () => {
    expect(PUBLIC_ROUTE_KEYS).toHaveLength(3);
    expect(isPublicRouteHandler('HealthController', 'check')).toBe(true);
    expect(isPublicRouteHandler('AuthController', 'login')).toBe(true);
    expect(isPublicRouteHandler('AuthController', 'refresh')).toBe(true);
    expect(isPublicRouteHandler('RbacController', 'roles')).toBe(false);
    expect(isPublicRouteHandler(undefined, undefined)).toBe(false);
  });
});
