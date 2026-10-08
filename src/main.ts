import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Response } from 'express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { assertDatabaseUrlConfigured } from './database/data-source';

// Guard/interceptor/controller katmanından düşen istekleri yalnız meta veriyle
// (method/url/status/kategori) raporlar; exception.message/body asla yazılmaz
// (ham detay sızıntısı tarayıcısına takılmamak için). YANITI KENDİSİ YAZAR:
// yanıt göndermeden bırakmak istemci tarafında isteğin askıda kalmasına yol açar.
const REQUEST_FAILURE_CATEGORIES = [
  'AuthorizationContextError',
  'UnauthorizedException',
  'ForbiddenException',
  'NotFoundException',
  'BadRequestException',
  'ConflictException',
  'HttpException',
];

function requestFailureBody(exception: unknown): Record<string, unknown> {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === 'string') return { statusCode: status, message: response };
    if (response && typeof response === 'object') return response as Record<string, unknown>;
    return { statusCode: status, message: exception.message };
  }
  return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
}

@Catch()
class RequestFailureFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<{ method?: string; url?: string }>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (request?.method) {
      const name = exception instanceof Error ? exception.constructor.name : 'UnknownError';
      const category = REQUEST_FAILURE_CATEGORIES.includes(name) ? name : 'Error';
      // Yalnızca kategorisiz iç hatalar için Postgres driver hatası KODU eklenir;
      // message/SQL/veri değerleri asla yazılmaz (ham PII taraması koruması).
      const failed = exception as {
        driverError?: { code?: string; message?: string; table?: string };
      };
      const driverError = failed?.driverError;
      const extra: Record<string, unknown> = {};
      if (!REQUEST_FAILURE_CATEGORIES.includes(name) && typeof driverError?.code === 'string') {
        extra.code = driverError.code;
        if (driverError.code === '42P01') {
          if (typeof driverError.table === 'string' && driverError.table) {
            extra.relation = driverError.table;
          } else {
            const relation = /relation\s+"([^"]+)"/.exec(driverError.message ?? '')?.[1];
            if (relation) extra.relation = relation;
          }
        }
      }
      console.warn(
        JSON.stringify({
          event: 'http.request.failed',
          method: request.method,
          url: String(request.url ?? ''),
          status,
          error: category,
          ...extra,
        }),
      );
    }
    response.status(status).json(requestFailureBody(exception));
  }
}

async function bootstrap() {
  assertDatabaseUrlConfigured();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(process.cwd(), 'dist', 'runtime'), { prefix: '/runtime' });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new RequestFailureFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}
void bootstrap();
