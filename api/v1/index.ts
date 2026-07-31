import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import { AppModule } from '../../src/app.module';

type ExpressHandler = (request: Request, response: Response) => void;

let cachedHandler: Promise<ExpressHandler> | undefined;

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

export default async function handler(request: Request, response: Response) {
  cachedHandler ??= createNestHandler();
  const nestHandler = await cachedHandler;
  return nestHandler(request, response);
}
