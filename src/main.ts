import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { assertDatabaseUrlConfigured } from './database/data-source';

// Guard/interceptor/controller katmanından düşen istekleri yalnız meta veriyle
// (method/url/status/kategori) raporlar; exception.message/body asla yazılmaz
// (ham detay sızıntısı tarayıcısına takılmamak için).
const REQUEST_FAILURE_CATEGORIES = [
  'AuthorizationContextError',
  'UnauthorizedException',
  'ForbiddenException',
  'NotFoundException',
  'BadRequestException',
  'ConflictException',
  'HttpException',
];

@Catch()
class RequestFailureFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<{ method?: string; url?: string }>();
    if (!request?.method) return;
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const name = exception instanceof Error ? exception.constructor.name : 'UnknownError';
    const category = REQUEST_FAILURE_CATEGORIES.includes(name) ? name : 'Error';
    console.warn(
      JSON.stringify({
        event: 'http.request.failed',
        method: request.method,
        url: String(request.url ?? ''),
        status,
        error: category,
      }),
    );
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
