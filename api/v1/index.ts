import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import { AppModule } from '../../src/app.module';

type ExpressHandler = (request: Request, response: Response) => void;
type CreateNestHandler = () => Promise<ExpressHandler>;

let cachedHandler: Promise<ExpressHandler> | undefined;
let createNestHandlerFactory: CreateNestHandler = createNestHandler;

async function createNestHandler(): Promise<ExpressHandler> {
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

export function __setCreateNestHandlerForTest(factory: CreateNestHandler): void {
  createNestHandlerFactory = factory;
  cachedHandler = undefined;
}

export function __resetCreateNestHandlerForTest(): void {
  createNestHandlerFactory = createNestHandler;
  cachedHandler = undefined;
}

export default async function handler(request: Request, response: Response) {
  const nestHandler = await getCachedNestHandler();
  return nestHandler(request, response);
}
