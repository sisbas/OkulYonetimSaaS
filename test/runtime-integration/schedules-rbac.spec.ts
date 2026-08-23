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

jest.setTimeout(120_000);

type NestJsonBody = Record<string, unknown>;

let bootedApp: Awaited<ReturnType<typeof bootNestApp>> | undefined;
let server: Server | undefined;
let baseUrl: string | undefined;

// Tek stub kullanıcı: schedule permission'ları VAR (api-routing-authority
// desenini izler). "Permission yok" senaryosu #269 acceptance journey'ye bırakılır.
const authorizedUser: RequestUser = {
  userId: randomUUID(),
  tenantId: randomUUID(),
  roleIds: ['tenant-admin'],
  permissions: ['schedule:draft:create', 'schedule:draft:update', 'schedule:read', 'schedule:publish'],
  sessionId: randomUUID(),
  authorizationVersion: 1,
};

const stubAuthService = {
  validateAccessTokenSession: jest.fn().mockResolvedValue(authorizedUser),
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

async function bootNestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getDataSourceToken())
    .useValue(createStubDataSource() as unknown as DataSource)
    .overrideProvider(AuthService)
    .useValue(stubAuthService)
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
      secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      issuer: AUTH_TOKEN_ISSUER,
      audience: AUTH_ACCESS_TOKEN_AUDIENCE,
      expiresIn: '15m',
    },
  );
}

describe('Schedules controller HTTP-layer RBAC + tenant isolation (P1B-05 slice 3)', () => {
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

  let authorizedToken: string | undefined;

  beforeAll(async () => {
    authorizedToken = await makeToken(authorizedUser);
  });

  it('rejects unauthenticated POST /api/v1/schedules with 401 (no token)', async () => {
    const body = assertNestJson(await requestJson('/api/v1/schedules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), 401);
    expect(body.message).toBe('Unauthorized');
    expect(body.statusCode).toBe(401);
  });

  it('rejects a malformed bearer token with 401', async () => {
    const body = assertNestJson(
      await requestJson('/api/v1/schedules', {
        method: 'POST',
        headers: { authorization: 'Bearer not-a-valid-jwt', 'content-type': 'application/json' },
        body: JSON.stringify({ branchId: randomUUID(), effectiveFrom: '2026-09-01' }),
      }),
      401,
    );
    expect(body.statusCode).toBe(401);
  });

  it('reaches the schedules controller (not 401/403) when caller is authenticated with schedule permission', async () => {
    expect(authorizedToken).toBeDefined();
    // Stub DataSource nedeniyle service çağrısı 500/400 döndürebilir; ama 401/403
    // DEĞİL — yani auth + permission guard'ı geçti ve controller'a ulaştı.
    const result = await requestJson('/api/v1/schedules', {
      method: 'POST',
      headers: { authorization: `Bearer ${authorizedToken as string}`, 'content-type': 'application/json' },
      body: JSON.stringify({ branchId: randomUUID(), effectiveFrom: '2026-09-01' }),
    });
    expect(result.status).not.toBe(401);
    expect(result.status).not.toBe(403);
  });

  it('never returns platform HTML for an unknown nested schedule route', async () => {
    expect(authorizedToken).toBeDefined();
    const body = assertNestJson(
      await requestJson('/api/v1/schedules/nonexistent/deep', {
        headers: { authorization: `Bearer ${authorizedToken as string}` },
      }),
      404,
    );
    expect(body.statusCode).toBe(404);
  });
});
