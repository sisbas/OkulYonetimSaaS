import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import { AppModule } from '../../src/app.module';
import { assertDatabaseUrlConfigured } from '../../src/database/data-source';

type ExpressHandler = (request: Request, response: Response) => void;
type CreateNestHandler = () => Promise<ExpressHandler>;

const VERCEL_API_PATH_PARAM = '__vercelApiPath';

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

export function restoreRewrittenApiRequestUrl(request: Pick<Request, 'url'>): void {
  const rewrittenUrl = new URL(request.url, 'http://vercel.internal');
  const nestedPath = rewrittenUrl.searchParams.get(VERCEL_API_PATH_PARAM);
  if (!nestedPath) return;

  rewrittenUrl.searchParams.delete(VERCEL_API_PATH_PARAM);
  const normalizedPath = nestedPath.replace(/^\/+/, '');
  rewrittenUrl.pathname = normalizedPath ? `/api/v1/${normalizedPath}` : '/api/v1';
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

export default async function handler(request: Request, response: Response) {
  restoreRewrittenApiRequestUrl(request);
  const nestHandler = await getCachedNestHandler();
  return nestHandler(request, response);
}
