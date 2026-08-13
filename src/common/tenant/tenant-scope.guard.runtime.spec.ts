import { Controller, Get, INestApplication, Module, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';

// supertest @types kurulu değil; runtime'ı test etmek için require ile alıyoruz.
// tslint:disable-next-line:no-var-requires
const request = require('supertest');

import { TenantScopeGuard } from './tenant-scope.guard';
import { RequestWithContext } from '../context/request-context';

// Gerçek bir Nest uygulamasında TenantScopeGuard'ın APP_GUARD olarak kayıtlı
// olması durumunda, malformed / çakışan / sadece-header kiracı id'lerinin
// runtime'da reddedildiğini (ve geçerli tek başlığın kabul edildiğini) kanıtlayan
// entegrasyon testi. (PR #225 P2-KRİTİK bulgusu: guard artık gerçekten devrede.)

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MALFORMED = 'tenant-b';

@Controller('probe')
class ProbeController {
  @Get()
  ok(@Req() req: RequestWithContext) {
    return { tenantId: req.context?.tenantId };
  }
}

@Module({
  controllers: [ProbeController],
  // app.module.ts ile aynı şekilde: TenantScopeGuard APP_GUARD olarak kayıtlı.
  providers: [{ provide: APP_GUARD, useClass: TenantScopeGuard }],
})
class ProbeModule {}

describe('TenantScopeGuard — runtime registration (P2 critical)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('[RT-2] malformed (UUID olmayan) X-Tenant-Id header → 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer()).get('/probe').set('x-tenant-id', MALFORMED);
    expect(res.status).toBe(401);
  });

  it('[RT-3] çift alias çakışması (x-tenant-id != tenant-id header) → 403 Forbidden', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe')
      .set('x-tenant-id', A)
      .set('tenant-id', B);
    expect(res.status).toBe(403);
  });

  it('[RT-4] geçerli tek X-Tenant-Id header (bootstrap) → 200 ve tenant yansır', async () => {
    const res = await request(app.getHttpServer()).get('/probe').set('x-tenant-id', A);
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(A);
  });

  it('[RT-5] kiracı olmadan istek → 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer()).get('/probe');
    expect(res.status).toBe(401);
  });
});
