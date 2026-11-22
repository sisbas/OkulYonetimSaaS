import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import { AppModule } from '../../src/app.module';
import { assertDatabaseUrlConfigured } from '../../src/database/data-source';

type ExpressHandler = (request: Request, response: Response) => void;
type CreateNestHandler = () => Promise<ExpressHandler>;

const VERCEL_API_PATH_PARAM = '__vercelApiPath';
const API_FUNCTION_PATHS = new Set(['/api/v1', '/api/v1/']);

let cachedHandler: Promise<ExpressHandler> | undefined;
let createNestHandlerFactory: CreateNestHandler = createNestHandler;

async function createNestHandler(): Promise<ExpressHandler> {
  assertDatabaseUrlConfigured();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    bodyParser: true,
    logger: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  return app.getHttpAdapter().getInstance() as ExpressHandler;
}

function bootstrapWithRecovery(): Promise<ExpressHandler> {
  const bootstrapPromise = Promise.resolve().then(() => createNestHandlerFactory());
  let recoverablePromise: Promise<ExpressHandler>;
  recoverablePromise = bootstrapPromise.catch((error) => {
    if (cachedHandler === recoverablePromise) {
      cachedHandler = undefined;
    }
    throw error;
  });
  cachedHandler = recoverablePromise;
  return recoverablePromise;
}

export function getCachedNestHandler(): Promise<ExpressHandler> {
  return cachedHandler ?? bootstrapWithRecovery();
}

function stripInternalRewriteMarker(
  request: Pick<Request, 'query'>,
  rewrittenUrl: URL,
): void {
  rewrittenUrl.searchParams.delete(VERCEL_API_PATH_PARAM);
  if (request.query && typeof request.query === 'object') {
    delete request.query[VERCEL_API_PATH_PARAM];
  }
}

function isSafeNestedApiPath(value: string): boolean {
  if (value.includes('\\')) return false;
  const normalized = value.replace(/^\/+/, '');
  return normalized.split('/').every((segment) => segment !== '.' && segment !== '..');
}

export function restoreRewrittenApiRequestUrl(request: Pick<Request, 'url' | 'query'>): void {
  const rewrittenUrl = new URL(request.url, 'http://vercel.internal');
  const nestedPath = rewrittenUrl.searchParams.get(VERCEL_API_PATH_PARAM);
  if (nestedPath === null) return;

  stripInternalRewriteMarker(request, rewrittenUrl);

  if (!API_FUNCTION_PATHS.has(rewrittenUrl.pathname)) {
    request.url = `${rewrittenUrl.pathname}${rewrittenUrl.search}`;
    return;
  }

  if (!isSafeNestedApiPath(nestedPath)) {
    request.url = `/api/v1${rewrittenUrl.search}`;
    return;
  }

  const normalizedPath = nestedPath.replace(/^\/+/, '');
  rewrittenUrl.pathname = normalizedPath ? `/api/v1/${normalizedPath}` : '/api/v1';
  if (rewrittenUrl.pathname !== '/api/v1' && !rewrittenUrl.pathname.startsWith('/api/v1/')) {
    request.url = `/api/v1${rewrittenUrl.search}`;
    return;
  }

  request.url = `${rewrittenUrl.pathname}${rewrittenUrl.search}`;
}

export function __setCreateNestHandlerForTest(factory: CreateNestHandler): void {
  createNestHandlerFactory = factory;
  cachedHandler = undefined;
}

export function __resetCreateNestHandlerForTest(): void {
  createNestHandlerFactory = createNestHandler;
  cachedHandler = undefined;
}

/** #503 — preview booting error detail is diagnostic-only, never a secret sink. */
function scrubBootstrapError(error: unknown): string {
  const message = String((error as { message?: unknown } | null)?.message ?? error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[db-url-redacted]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email-redacted]')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export default async function handler(request: Request, response: Response) {
  restoreRewrittenApiRequestUrl(request);
  let nestHandler: ExpressHandler;
  try {
    nestHandler = await getCachedNestHandler();
  } catch (error) {
    // Production keeps the platform's opaque 500. Preview surfaces a scrubbed
    // first-line reason so deployment/env regressions are diagnosable via HTTP.
    if (process.env.VERCEL_ENV !== 'preview') throw error;
    response.statusCode = 500;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      error: 'preview_bootstrap_failed',
      detail: scrubBootstrapError(error),
    }));
    return;
  }
  return nestHandler(request, response);
}
