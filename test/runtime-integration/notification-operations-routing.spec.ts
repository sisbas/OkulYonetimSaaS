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
import type { RequestUser } from '../../src/common/context/request-context';
import { BranchScopeService } from '../../src/rbac/branch-scope.service';
import { NotificationDispatchService } from '../../src/notifications/notification-dispatch.service';
import { NotificationDraftService } from '../../src/notifications/notification-draft.service';

jest.setTimeout(120_000);

/**
 * #266 N3 — Notification Operations route/guard yetki sınırı.
 *
 * REAL PostgreSQL authority acceptance DEĞİLDİR (stub kaynaklar); bu spec
 * yalnız şu zinciri kanıtlar: HTTP → JWT → global PermissionGuard →
 * @Permissions dekoratörü → controller → servis (stub). Sahiplik/scope
 * kabulü ayrı real-PG kanıtlarındadır.
 *
 * Sıra kanıtı: `GET /notifications/drafts` literal route'unu test eder —
 * NotificationDraftController, NotificationOperationsController'dan ÖNCE
 * kayıtlı olmazsa `:id` (ParseUUIDPipe) 'drafts'ı yutar ve 400 döner.
 */

type NestJsonBody = Record<string, unknown>;

let bootedApp: Awaited<ReturnType<typeof bootNestApp>> | undefined;
let server: Server | undefined;
let baseUrl: string | undefined;
let accessToken: string | undefined;

const readPermission = 'notification:draft:read';
const sendPermission = 'parent_notification:send';
const approvePermission = 'parent_notification:approve';

const authenticatedUser: RequestUser = {
  userId: randomUUID(),
  tenantId: randomUUID(),
  roleIds: ['operations'],
  permissions: [readPermission, sendPermission, approvePermission],
  sessionId: randomUUID(),
  authorizationVersion: 1,
};
const routingBranch = randomUUID();

const stubAuthService = {
  validateAccessTokenSession: jest.fn().mockResolvedValue(authenticatedUser),
} as unknown as AuthService;

const dispatchServiceStub = {
  list: jest.fn(),
  detail: jest.fn(),
  execute: jest.fn(),
  retry: jest.fn(),
  cancel: jest.fn(),
};

const draftServiceStub = {
  listDrafts: jest.fn(),
  getDraft: jest.fn(),
  approveDraft: jest.fn(),
  closeDraft: jest.fn(),
};

function createStubDataSource(): DataSource {
  return {
    isInitialized: true,
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    manager: {},
    entityMetadatas: [],
    options: { type: 'postgres' },
    // Draft controller runs its transaction directly on the DataSource.
    transaction: jest.fn().mockImplementation(async (fn: unknown) =>
      typeof fn === 'function' ? (fn as (em: unknown) => unknown)({}) : fn),
    getRepository: jest.fn().mockReturnValue({}),
    getTreeRepository: jest.fn().mockReturnValue({}),
    getMongoRepository: jest.fn().mockReturnValue({}),
  } as unknown as DataSource;
}

async function bootNestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getDataSourceToken())
    .useValue(createStubDataSource() as unknown as DataSource)
    .overrideProvider(AuthService)
    .useValue(stubAuthService)
    .overrideProvider(BranchScopeService)
    .useValue({ sessionContext: jest.fn().mockImplementation(async () => ({
      accessible: [{ branchId: routingBranch, name: 'Routing', code: 'ROUTING' }],
      branch: { branchId: routingBranch, branchName: 'Routing', source: 'membership_default' }, authority: {
        roles: authenticatedUser.roleIds, permissions: authenticatedUser.permissions,
        tokenVersion: 1, resolvedAt: new Date().toISOString(), cache: 'disabled',
      },
    })) })
    .overrideProvider(NotificationDispatchService)
    .useValue(dispatchServiceStub)
    .overrideProvider(NotificationDraftService)
    .useValue(draftServiceStub)
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

async function requestJson(path: string, init?: RequestInit): Promise<{ status: number; contentType: string; body: string }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: await response.text(),
  };
}

function assertNestJson(result: Awaited<ReturnType<typeof requestJson>>, expectedStatus: number): NestJsonBody {
  expect(result.status).toBe(expectedStatus);
  expect(result.contentType).toMatch(/^application\/json/);
  expect(result.body).not.toMatch(/<!DOCTYPE|<html|404: NOT_FOUND|__vercelApiPath/);
  const parsed = JSON.parse(result.body) as NestJsonBody;
  expect(typeof parsed).toBe('object');
  return parsed;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${accessToken as string}`, ...extra };
}

function withPermissions<T>(permissions: string[], run: () => Promise<T>): Promise<T> {
  const snapshot = authenticatedUser.permissions;
  authenticatedUser.permissions = permissions;
  return run().finally(() => {
    authenticatedUser.permissions = snapshot;
  });
}

const notificationId = randomUUID();

describe('notification operations API routing + permission authority', () => {
  beforeAll(async () => {
    accessToken = await new JwtService({}).signAsync(
      {
        sub: authenticatedUser.userId,
        tenant_id: authenticatedUser.tenantId,
        session_id: authenticatedUser.sessionId,
        jti: authenticatedUser.sessionId,
        authorization_version: authenticatedUser.authorizationVersion,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_ACCESS_TOKEN_AUDIENCE,
        expiresIn: '15m',
      },
    );

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

  beforeEach(() => {
    jest.clearAllMocks();
    dispatchServiceStub.list.mockResolvedValue([]);
    dispatchServiceStub.detail.mockResolvedValue({ row: { id: notificationId }, availableActions: [], receipts: [] });
    dispatchServiceStub.execute.mockResolvedValue({
      id: notificationId, status: 'dispatched', version: 2, attempt: 1, reason: null, idempotent: false, receipt: null,
    });
    dispatchServiceStub.retry.mockResolvedValue({ id: notificationId, status: 'approved', version: 3 });
    dispatchServiceStub.cancel.mockResolvedValue({ id: notificationId, status: 'cancelled', version: 3 });
    draftServiceStub.listDrafts.mockResolvedValue([]);
    draftServiceStub.approveDraft.mockResolvedValue({ id: notificationId, status: 'approved', version: 2 });
  });

  it('rejects unauthenticated list/execute/retry/cancel with 401 before any service runs', async () => {
    for (const probe of [
      { path: '/api/v1/notifications', init: {} as RequestInit },
      { path: `/api/v1/notifications/${notificationId}/execute`, init: { method: 'POST' } },
      { path: `/api/v1/notifications/${notificationId}/retry`, init: { method: 'POST' } },
      { path: `/api/v1/notifications/${notificationId}/cancel`, init: { method: 'POST' } },
    ]) {
      assertNestJson(await requestJson(probe.path, probe.init), 401);
    }
    expect(dispatchServiceStub.list).not.toHaveBeenCalled();
    expect(dispatchServiceStub.execute).not.toHaveBeenCalled();
    expect(dispatchServiceStub.retry).not.toHaveBeenCalled();
    expect(dispatchServiceStub.cancel).not.toHaveBeenCalled();
  });

  it('denies GET /notifications without notification:draft:read (default-deny, service untouched)', async () => {
    await withPermissions(['leave:read'], async () => {
      assertNestJson(await requestJson('/api/v1/notifications', { headers: authHeaders() }), 403);
    });
    expect(dispatchServiceStub.list).not.toHaveBeenCalled();
  });

  it('routes GET /notifications to the dispatch service when notification:draft:read is granted', async () => {
    await withPermissions([readPermission], async () => {
      const body = assertNestJson(await requestJson('/api/v1/notifications', { headers: authHeaders() }), 200);
      expect(Array.isArray(body.notifications)).toBe(true);
    });
    expect(dispatchServiceStub.list).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid status filter inside the controller (not by the guard)', async () => {
    await withPermissions([readPermission], async () => {
      const body = assertNestJson(
        await requestJson('/api/v1/notifications?status=bogus', { headers: authHeaders() }),
        403,
      );
      expect(body.message).toBe('NOTIFICATION_STATUS_FILTER_INVALID');
    });
    expect(dispatchServiceStub.list).not.toHaveBeenCalled();
  });

  it('enforces parent_notification:send on execute and forwards the server-computed result', async () => {
    await withPermissions([readPermission], async () => {
      assertNestJson(
        await requestJson(`/api/v1/notifications/${notificationId}/execute`, { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }) }),
        403,
      );
    });
    expect(dispatchServiceStub.execute).not.toHaveBeenCalled();

    await withPermissions([readPermission, sendPermission], async () => {
      const body = assertNestJson(
        await requestJson(`/api/v1/notifications/${notificationId}/execute`, { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }) }),
        201,
      );
      expect(body.status).toBe('dispatched');
      expect(body.version).toBe(2);
      expect(body.idempotent).toBe(false);
    });
    expect(dispatchServiceStub.execute).toHaveBeenCalledTimes(1);
  });

  it('enforces parent_notification:send on retry', async () => {
    await withPermissions([readPermission], async () => {
      assertNestJson(
        await requestJson(`/api/v1/notifications/${notificationId}/retry`, { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }) }),
        403,
      );
    });
    expect(dispatchServiceStub.retry).not.toHaveBeenCalled();

    await withPermissions([readPermission, sendPermission], async () => {
      const body = assertNestJson(
        await requestJson(`/api/v1/notifications/${notificationId}/retry`, { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }) }),
        201,
      );
      expect(body.status).toBe('approved');
    });
    expect(dispatchServiceStub.retry).toHaveBeenCalledTimes(1);
  });

  it('enforces parent_notification:approve on cancel (approval authority is not send authority)', async () => {
    await withPermissions([readPermission, sendPermission], async () => {
      assertNestJson(
        await requestJson(`/api/v1/notifications/${notificationId}/cancel`, { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }) }),
        403,
      );
    });
    expect(dispatchServiceStub.cancel).not.toHaveBeenCalled();

    await withPermissions([readPermission, approvePermission], async () => {
      const body = assertNestJson(
        await requestJson(`/api/v1/notifications/${notificationId}/cancel`, { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }) }),
        201,
      );
      expect(body.status).toBe('cancelled');
    });
    expect(dispatchServiceStub.cancel).toHaveBeenCalledTimes(1);
  });

  it('keeps /notifications/drafts on the literal draft route (controller order: drafts before :id)', async () => {
    await withPermissions([readPermission], async () => {
      const body = assertNestJson(
        await requestJson('/api/v1/notifications/drafts', { headers: authHeaders() }),
        200,
      );
      expect(Array.isArray(body.drafts)).toBe(true);
    });
    expect(draftServiceStub.listDrafts).toHaveBeenCalledTimes(1);
    expect(dispatchServiceStub.detail).not.toHaveBeenCalled();
  });

  it('enforces notification:draft:approve on draft approval with expectedVersion body', async () => {
    await withPermissions([readPermission], async () => {
      assertNestJson(
        await requestJson(`/api/v1/notifications/drafts/${notificationId}/approve`, {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ expectedVersion: 1 }),
        }),
        403,
      );
    });
    expect(draftServiceStub.approveDraft).not.toHaveBeenCalled();

    await withPermissions(['notification:draft:approve'], async () => {
      const body = assertNestJson(
        await requestJson(`/api/v1/notifications/drafts/${notificationId}/approve`, {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ expectedVersion: 1 }),
        }),
        201,
      );
      expect(body.status).toBe('approved');
      expect(draftServiceStub.approveDraft).toHaveBeenCalledWith(expect.anything(), {
        tenantId: authenticatedUser.tenantId,
        branchId: routingBranch,
        id: notificationId,
        expectedVersion: 1,
      });
    });
  });

  it('validates the notification id as UUID at the ops routes (controlled 400, not a service call)', async () => {
    await withPermissions([readPermission, sendPermission], async () => {
      assertNestJson(
        await requestJson('/api/v1/notifications/not-a-uuid/execute', {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
        }),
        400,
      );
    });
    expect(dispatchServiceStub.execute).not.toHaveBeenCalled();
  });

  it('serves GET /notifications/:id detail with server-computed availableActions', async () => {
    dispatchServiceStub.detail.mockResolvedValue({
      row: { id: notificationId, status: 'approved', version: 5 },
      availableActions: ['execute', 'cancel'],
      receipts: [],
    });
    await withPermissions([readPermission], async () => {
      const body = assertNestJson(
        await requestJson(`/api/v1/notifications/${notificationId}`, { headers: authHeaders() }),
        200,
      );
      expect(body.availableActions).toEqual(['execute', 'cancel']);
    });
    expect(dispatchServiceStub.detail).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-tenant x-tenant-id header before dispatch (client authority never wins)', async () => {
    await withPermissions([readPermission], async () => {
      assertNestJson(
        await requestJson('/api/v1/notifications', { headers: authHeaders({ 'x-tenant-id': randomUUID() }) }),
        403,
      );
    });
    expect(dispatchServiceStub.list).not.toHaveBeenCalled();
  });
});
