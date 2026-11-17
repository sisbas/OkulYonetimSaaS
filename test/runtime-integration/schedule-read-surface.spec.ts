import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DataSource } from 'typeorm';
import type { Request, Response } from 'express';

import handler, {
  __resetCreateNestHandlerForTest,
  __setCreateNestHandlerForTest,
  getCachedNestHandler,
} from '../../api/v1/index';
import { AppModule } from '../../src/app.module';
import { AuthService, AUTH_ACCESS_TOKEN_AUDIENCE, AUTH_TOKEN_ISSUER } from '../../src/auth/auth.service';
import { resolveJwtKey } from '../../src/auth/jwt-keyring';
import type { RequestUser } from '../../src/common/context/request-context';
import { BranchScopeService } from '../../src/rbac/branch-scope.service';
import { ScheduleService } from '../../src/schedules/schedule.service';
import { ScheduleReadService } from '../../src/schedules/schedule-read.service';
import { ScheduleVersionMismatchException } from '../../src/schedules/schedule-revision';

jest.setTimeout(120_000);

type NestJsonBody = Record<string, unknown>;

let bootedApp: Awaited<ReturnType<typeof bootNestApp>> | undefined;
let server: Server | undefined;
let baseUrl: string | undefined;

const routingTenant = randomUUID();
const routingBranch = randomUUID();
const scheduleId = randomUUID();
const REVISION = 1;

const baseUser = {
  tenantId: routingTenant,
  sessionId: randomUUID(),
  authorizationVersion: 1,
};

const adminUser: RequestUser = {
  ...baseUser,
  userId: randomUUID(),
  roleIds: ['tenant-admin'],
  permissions: [
    'schedule:draft:create', 'schedule:draft:update', 'schedule:draft:read', 'schedule:read',
    'schedule:own:read', 'schedule:publish', 'schedule:validate', 'schedule:conflict:read',
  ],
};
const teacherUser: RequestUser = {
  ...baseUser,
  userId: randomUUID(),
  roleIds: ['teacher'],
  permissions: ['schedule:own:read'],
};
const viewerUser: RequestUser = { ...baseUser, userId: randomUUID(), roleIds: ['viewer'], permissions: [] };
const parentUser: RequestUser = {
  ...baseUser,
  userId: randomUUID(),
  roleIds: ['parent'],
  permissions: ['schedule:read'],
};

let currentUser: RequestUser = adminUser;
function switchUser(user: RequestUser) {
  currentUser = user;
}

const stubAuthService = {
  validateAccessTokenSession: jest.fn(async () => currentUser),
} as unknown as AuthService;

function createStubDataSource(): DataSource {
  return {
    isInitialized: true,
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    manager: {},
    entityMetadatas: [],
    options: { type: 'postgres' },
    getRepository: jest.fn().mockReturnValue({}),
    getTreeRepository: jest.fn().mockReturnValue({}),
    getMongoRepository: jest.fn().mockReturnValue({}),
  } as unknown as DataSource;
}

const draftSummary = {
  contractId: 'M3_CONTRACT_V2', contractVersion: '2.0.0',
  scheduleId, branchId: routingBranch,
  status: 'unpublished', projection: 'management_draft',
  gridState: 'weekly_grid_ready_draft', readOnly: false,
  revision: REVISION, effectiveFrom: '2026-09-01', effectiveTo: null,
  version: null, eventCount: 0,
};

function scheduleDetail(projection: string) {
  const published = projection !== 'management_draft';
  return {
    ...draftSummary,
    status: published ? 'published' : 'unpublished',
    projection,
    gridState: published ? 'weekly_grid_ready_published' : 'weekly_grid_ready_draft',
    readOnly: published,
    events: [],
  };
}

function projectionOf(permissions: ReadonlyArray<string> | undefined): string {
  const keys = new Set(permissions ?? []);
  if (keys.has('schedule:draft:read')) return 'management_draft';
  if (keys.has('schedule:read')) return 'published_branch';
  return 'published_own';
}

const scheduleServiceStub = {
  createSchedule: jest.fn(async () => ({
    id: scheduleId,
    tenantId: routingTenant,
    branchId: routingBranch,
    status: 'draft',
    revision: REVISION,
    effectiveFrom: new Date('2026-09-01'),
    effectiveTo: null,
    activeVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  saveDraft: jest.fn(async (input: { expectedRevision: number }) => {
    if (Number(input.expectedRevision) !== REVISION) throw new ScheduleVersionMismatchException();
    return { id: randomUUID(), status: 'draft', versionNo: 1 };
  }),
  validateDraft: jest.fn(async (_tenantId: string, _branchId: string, _scheduleId: string, _events: unknown, revision: number) => {
    if (Number(revision) !== REVISION) throw new ScheduleVersionMismatchException();
    return { contractId: 'M3_CONTRACT_V2', contractVersion: '2.0.0', status: 'valid', evidenceStatus: 'authoritative', canPublish: true, hardConflictCount: 0, reasons: [] };
  }),
  publish: jest.fn(async (_tenantId: string, _branchId: string, _scheduleId: string, _actorId: string, _requestId: string, _events: unknown[], callerRevision: number) => {
    if (Number(callerRevision) !== REVISION) throw new ScheduleVersionMismatchException();
    return { id: randomUUID(), status: 'published', versionNo: 1, publishedAt: new Date() };
  }),
  unpublish: jest.fn(async (_tenantId: string, _branchId: string, _scheduleId: string, _actorId: string, _requestId: string, callerRevision: number) => {
    if (Number(callerRevision) !== REVISION) throw new ScheduleVersionMismatchException();
  }),
};

const readServiceStub = {
  listManagementDrafts: jest.fn(async () => [{ ...draftSummary }]),
  listPublished: jest.fn(async (input: { ctx: { permissions?: string[] } }) => {
    const projection = projectionOf(input.ctx.permissions);
    return [{ ...scheduleDetail(projection), events: undefined }];
  }),
  readSchedule: jest.fn(async (input: { ctx: { permissions?: string[] } }) =>
    scheduleDetail(projectionOf(input.ctx.permissions))),
};

async function bootNestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getDataSourceToken())
    .useValue(createStubDataSource() as unknown as DataSource)
    .overrideProvider(AuthService)
    .useValue(stubAuthService)
    .overrideProvider(BranchScopeService)
    .useValue({
      sessionContext: jest.fn().mockImplementation(async (user: RequestUser) => ({
        accessible: [{ branchId: routingBranch, name: 'Routing', code: 'ROUTING' }],
        branch: { branchId: routingBranch, branchName: 'Routing', source: 'membership_default' },
        authority: {
          roles: user.roleIds,
          permissions: user.permissions,
          tokenVersion: 1,
          resolvedAt: new Date().toISOString(),
          cache: 'disabled',
        },
      })),
    })
    .overrideProvider(ScheduleService)
    .useValue(scheduleServiceStub)
    .overrideProvider(ScheduleReadService)
    .useValue(readServiceStub)
    .compile();

  const app = moduleRef.createNestApplication(new ExpressAdapter(), {
    bodyParser: true,
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  return app;
}

async function requestJson(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; contentType: string; body: string; etag: string | null }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: await response.text(),
    etag: response.headers.get('etag'),
  };
}

function assertJson(result: Awaited<ReturnType<typeof requestJson>>, expectedStatus: number): NestJsonBody {
  expect(result.status).toBe(expectedStatus);
  expect(result.contentType).toMatch(/^application\/json/);
  const parsed = JSON.parse(result.body) as NestJsonBody;
  expect(typeof parsed).toBe('object');
  expect(parsed).not.toBeNull();
  return parsed;
}

async function makeToken(user: RequestUser): Promise<string> {
  return new JwtService({}).signAsync(
    {
      sub: user.userId,
      tenant_id: user.tenantId,
      session_id: user.sessionId,
      jti: user.sessionId,
      authorization_version: user.authorizationVersion,
    },
    {
      secret: resolveJwtKey('access').secret,
      keyid: resolveJwtKey('access').keyId,
      issuer: AUTH_TOKEN_ISSUER,
      audience: AUTH_ACCESS_TOKEN_AUDIENCE,
      expiresIn: '15m',
    },
  );
}

const ifMatch = (
  template: string,
  rev: number,
) => ({ 'If-Match': `"schedule:${template}:v${rev}"` });

describe('#447 Schedule runtime alignment (HTTP-level)', () => {
  beforeAll(async () => {
    __setCreateNestHandlerForTest(async () => {
      bootedApp = await bootNestApp();
      return bootedApp.getHttpAdapter().getInstance() as unknown as (request: IncomingMessage, response: ServerResponse) => void;
    });

    server = createServer((request, response) => {
      Promise.resolve(handler(request as unknown as Request, response as unknown as Response)).catch(() => {
        if (!response.writableEnded) {
          response.statusCode = 500;
          response.end();
        }
      });
    });
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server?.once('listening', resolve);
      server?.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    await getCachedNestHandler();
  });

  afterAll(async () => {
    __resetCreateNestHandlerForTest();
    await bootedApp?.close();
    if (server) {
      const runningServer = server;
      await new Promise<void>((resolve) => runningServer.close(() => resolve()));
      runningServer.closeAllConnections();
    }
  });

  describe('draft creation (canonical plural path)', () => {
    it('creates a draft at POST /schedules/drafts with an ETag and revision 1', async () => {
      switchUser(adminUser);
      const token = await makeToken(adminUser);
      const result = await requestJson('/api/v1/schedules/drafts', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ branchId: routingBranch, effectiveFrom: '2026-09-01' }),
      });
      expect(result.status).toBe(201);
      expect(result.etag).toBe(`"schedule:${scheduleId}:v1"`);
      const body = assertJson(result, 201);
      expect(body.id).toBe(scheduleId);
      expect(body.status).toBe('draft');
      expect(body.revision).toBe(1);
    });

    it('accepts a stray If-Match on create without producing 428/412', async () => {
      switchUser(adminUser);
      const token = await makeToken(adminUser);
      const result = await requestJson('/api/v1/schedules/drafts', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'If-Match': '"schedule:00000000-0000-4000-8000-000000000000:v1"' },
        body: JSON.stringify({ branchId: routingBranch, effectiveFrom: '2026-09-01' }),
      });
      expect(result.status).toBe(201);
    });

    it('does not leak the management surface to a plain teacher (403)', async () => {
      switchUser(teacherUser);
      const token = await makeToken(teacherUser);
      const result = await requestJson('/api/v1/schedules/drafts', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ branchId: routingBranch, effectiveFrom: '2026-09-01' }),
      });
      expect(result.status).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Forbidden resource');
    });
  });

  describe('existing-resource mutations require an exact conditional revision header', () => {
    it('save/validate/publish/unpublish without If-Match produce 428 SCHEDULE_VERSION_REQUIRED', async () => {
      switchUser(adminUser);
      const token = await makeToken(adminUser);
      const cases = ['draft', 'validate', 'publish', 'unpublish'] as const;
      for (const resource of cases) {
        const path = `/api/v1/schedules/${scheduleId}/${resource}`;
        const body = resource === 'draft' ? { branchId: routingBranch, events: [] }
          : resource === 'validate' ? { branchId: routingBranch, events: [] }
          : resource === 'publish' ? { branchId: routingBranch, events: [] }
          : { branchId: routingBranch };
        const result = await requestJson(path, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        expect(result.status).toBe(428);
        expect(JSON.parse(result.body).code).toBe('SCHEDULE_VERSION_REQUIRED');
      }
    });

    it('save/validate/publish/unpublish with a stale If-Match produce 412 SCHEDULE_VERSION_MISMATCH', async () => {
      switchUser(adminUser);
      const token = await makeToken(adminUser);
      const stale = `"schedule:${scheduleId}:v99"`;
      const cases = ['draft', 'validate', 'publish', 'unpublish'] as const;
      for (const resource of cases) {
        const path = `/api/v1/schedules/${scheduleId}/${resource}`;
        const body = resource === 'draft' ? { branchId: routingBranch, events: [] }
          : resource === 'validate' ? { branchId: routingBranch, events: [] }
          : resource === 'publish' ? { branchId: routingBranch, events: [] }
          : { branchId: routingBranch };
        const result = await requestJson(path, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'If-Match': stale },
          body: JSON.stringify(body),
        });
        expect(result.status).toBe(412);
        expect(JSON.parse(result.body).code).toBe('SCHEDULE_VERSION_MISMATCH');
      }
    });

    it('save/validate/publish/unpublish with a mismatched resource produce 412', async () => {
      switchUser(adminUser);
      const token = await makeToken(adminUser);
      const other = '11111111-1111-4111-8111-111111111111';
      const path = `/api/v1/schedules/${scheduleId}/publish`;
      const result = await requestJson(path, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'If-Match': ifMatch(other, REVISION)['If-Match'] },
        body: JSON.stringify({ branchId: routingBranch, events: [] }),
      });
      expect(result.status).toBe(412);
      expect(JSON.parse(result.body).code).toBe('SCHEDULE_VERSION_MISMATCH');
    });

    it('save with a well-formed current If-Match succeeds and returns an ETag', async () => {
      switchUser(adminUser);
      const token = await makeToken(adminUser);
      const path = `/api/v1/schedules/${scheduleId}/draft`;
      const result = await requestJson(path, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'If-Match': `"schedule:${scheduleId}:v1"` },
        body: JSON.stringify({ branchId: routingBranch, events: [] }),
      });
      expect(result.status).toBe(200);
      expect(result.etag).toBe(`"schedule:${scheduleId}:v2"`);
    });
  });

  describe('read surface', () => {
    it('admin/ops see the management draft list (200) and its ETag', async () => {
      switchUser(adminUser);
      const token = await makeToken(adminUser);
      const result = await requestJson('/api/v1/schedules/drafts', { headers: { authorization: `Bearer ${token}` } });
      expect(result.status).toBe(200);
      assertJson(result, 200);
      const body = JSON.parse(result.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body[0].projection).toBe('management_draft');
      expect(body[0].gridState).toBe('weekly_grid_ready_draft');
      expect(body[0].readOnly).toBe(false);
      expect(result.etag).toMatch(/^"schedule:list:1:v1"$/);
    });

    it('drafts and published are not swallowed by the :scheduleId route (200, not 400)', async () => {
      switchUser(adminUser);
      const token = await makeToken(adminUser);
      for (const path of ['/api/v1/schedules/drafts', '/api/v1/schedules/published']) {
        const result = await requestJson(path, { headers: { authorization: `Bearer ${token}` } });
        expect(result.status).toBe(200);
      }
    });

    it('teacher receives own-scope published projection but no management discovery', async () => {
      switchUser(teacherUser);
      const token = await makeToken(teacherUser);
      const listed = await requestJson('/api/v1/schedules/published', { headers: { authorization: `Bearer ${token}` } });
      expect(listed.status).toBe(200);
      const items = JSON.parse(listed.body);
      expect(items[0].projection).toBe('published_own');
      expect(items[0].readOnly).toBe(true);
      expect(items[0].gridState).toBe('weekly_grid_ready_published');

      const detail = await requestJson(`/api/v1/schedules/${scheduleId}`, { headers: { authorization: `Bearer ${token}` } });
      expect(detail.status).toBe(200);
      expect(JSON.parse(detail.body).projection).toBe('published_own');
      expect(detail.etag).toBe(`"schedule:${scheduleId}:v1"`);

      const drafts = await requestJson('/api/v1/schedules/drafts', { headers: { authorization: `Bearer ${token}` } });
      expect(drafts.status).toBe(403);
      expect(JSON.parse(drafts.body).message).toBe('Forbidden resource');
    });

    it('parent-like schedule:read actor sees branch projection but no management', async () => {
      switchUser(parentUser);
      const token = await makeToken(parentUser);
      const detail = await requestJson(`/api/v1/schedules/${scheduleId}`, { headers: { authorization: `Bearer ${token}` } });
      expect(detail.status).toBe(200);
      expect(JSON.parse(detail.body).projection).toBe('published_branch');
      const drafts = await requestJson('/api/v1/schedules/drafts', { headers: { authorization: `Bearer ${token}` } });
      expect(drafts.status).toBe(403);
    });

    it('viewer (no schedule keys) is dark on the whole surface', async () => {
      switchUser(viewerUser);
      const token = await makeToken(viewerUser);
      for (const path of ['/api/v1/schedules/drafts', '/api/v1/schedules/published', `/api/v1/schedules/${scheduleId}`]) {
        const result = await requestJson(path, { headers: { authorization: `Bearer ${token}` } });
        expect(result.status).toBe(403);
      }
    });

    it('a malformed id produces 400, a well-formed one non-enumerating 404/projection', async () => {
      switchUser(adminUser);
      const token = await makeToken(adminUser);
      const bad = await requestJson('/api/v1/schedules/not-a-uuid', { headers: { authorization: `Bearer ${token}` } });
      expect(bad.status).toBe(400);
    });

    it('rejects unauthenticated read of the surface with 401', async () => {
      const result = await requestJson('/api/v1/schedules/drafts');
      expect(result.status).toBe(401);
    });
  });
});
