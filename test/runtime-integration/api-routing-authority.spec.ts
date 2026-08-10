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
let accessToken: string | undefined;

const authenticatedUser: RequestUser = {
  userId: randomUUID(),
  tenantId: randomUUID(),
  roleIds: ['operations'],
  permissions: ['leave:read', 'leave:own:read', 'leave:create'],
  sessionId: randomUUID(),
  authorizationVersion: 1,
};

const stubAuthService = {
  validateAccessTokenSession: jest.fn().mockResolvedValue(authenticatedUser),
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

describe('production /api/v1 routing authority (nested routes reach the Nest application)', () => {
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

  it('serves /api/v1/health as application-controlled Nest JSON', async () => {
    const body = assertNestJson(await requestJson('/api/v1/health'), 200);

    expect(body.status).toBe('ok');
    expect(body.service).toBe('okul-yonetim-saas-api');
    expect(body.applicationType).toBe('backend-api');
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('routes /api/v1/daily-operations/today to Nest and returns a controlled 401 instead of platform NOT_FOUND', async () => {
    const branchId = randomUUID();
    const body = assertNestJson(
      await requestJson(`/api/v1/daily-operations/today?branchId=${branchId}&date=2026-08-11`),
      401,
    );

    expect(body.message).toBe('Unauthorized');
    expect(body.statusCode).toBe(401);
  });

  it('routes the Vercel-rewritten /api/v1/daily-operations/today shape to Nest and strips the internal marker', async () => {
    const branchId = randomUUID();
    const body = assertNestJson(
      await requestJson(`/api/v1?__vercelApiPath=daily-operations/today&branchId=${branchId}&date=2026-08-11`),
      401,
    );

    expect(body.message).toBe('Unauthorized');
    expect(body.statusCode).toBe(401);
  });

  it('routes an unauthenticated /api/v1/leaves/me to Nest with a controlled 401, never platform NOT_FOUND', async () => {
    const body = assertNestJson(await requestJson('/api/v1/leaves/me'), 401);

    expect(body.message).toBe('Unauthorized');
    expect(body.statusCode).toBe(401);
  });

  it('dispatches an authenticated /api/v1/leaves/me to the Nest leaves controller with a controlled 400', async () => {
    expect(accessToken).toBeDefined();
    const body = assertNestJson(
      await requestJson('/api/v1/leaves/me', {
        headers: { authorization: `Bearer ${accessToken as string}` },
      }),
      400,
    );

    expect(body.statusCode).toBe(400);
    expect(JSON.stringify(body.message)).toContain('uuid is expected');
  });

  it('preserves POST method and JSON body through the rewritten routing shape into Nest validation', async () => {
    expect(accessToken).toBeDefined();
    const body = assertNestJson(
      await requestJson('/api/v1?__vercelApiPath=leaves/me', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken as string}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ branchId: 'not-a-uuid', durationType: 'weekly', reasonCode: 'administrative' }),
      }),
      400,
    );

    expect(body.statusCode).toBe(400);
    const messages = Array.isArray(body.message) ? (body.message as string[]) : [];
    expect(messages.some((message) => message.includes('branchId must be a UUID'))).toBe(true);
    expect(messages.some((message) => message.includes('durationType must be one of the following values'))).toBe(true);
  });

  it('preserves the x-tenant-id header through the rewritten routing shape into tenant context', async () => {
    expect(accessToken).toBeDefined();
    const body = assertNestJson(
      await requestJson('/api/v1?__vercelApiPath=leaves/me', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken as string}`,
          'content-type': 'application/json',
          'x-tenant-id': randomUUID(),
        },
        body: JSON.stringify({ reason: 'routing-propagation-probe' }),
      }),
      403,
    );

    expect(body.statusCode).toBe(403);
    expect(body.message).toBe('Forbidden resource');
  });

  it('proves the request body reaches Nest by surfacing a Nest body-parser error as controlled 400 JSON', async () => {
    const body = assertNestJson(
      await requestJson('/api/v1?__vercelApiPath=leaves/me', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"unterminated',
      }),
      400,
    );

    expect(body.statusCode).toBe(400);
  });

  it('returns Nest-controlled 404 JSON for any unknown nested /api/v1/* route, never platform HTML', async () => {
    const body = assertNestJson(await requestJson('/api/v1/nonexistent/deep/route'), 404);

    expect(body.statusCode).toBe(404);
    expect(JSON.stringify(body)).toContain('Cannot GET /api/v1/nonexistent/deep/route');
  });
});
