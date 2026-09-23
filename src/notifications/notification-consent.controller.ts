import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { RequestContext, RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import {
  ConsentLifecycleActor,
  ConsentLifecycleService,
} from '../kvkk/consent-lifecycle.service';
import {
  NOTIFICATION_CONSENT_TYPES,
  NotificationConsentType,
} from '../kvkk/consent-versioning';

/** Geri çekme isteği gövdesi: yalnız kapalı sözlükten `consentType` kabul edilir. */
interface WithdrawConsentBody {
  consentType?: string;
}

/**
 * #266 R5 — Bildirim onayı (consent) yüzeyi.
 *
 * - Kimlik doğrulama (JWT) + kiracı sınırı; yetki her route'ta `@Permissions`
 *   ile zorunlu kılınır. Global `PermissionGuard` metadata yoksa fail-OPEN
 *   davrandığı için bu iki route'un metadata'sı sözleşmedir ve testle sabitlenir.
 * - **Kiracı istek gövdesinden/path'inden alınmaz**; sunucu tarafındaki
 *   `request.context.tenantId` kullanılır (constitution Madde II). Başka
 *   kiracının öğrencisi için okuma boş sonuç, geri çekme `not_found` döner
 *   (kayıt varlığı sızdırılmaz — BOLA yüzeyi yok).
 * - Teacher rolü bu izinleri taşımaz (`src/database/seeds/permissions.seed.ts`:
 *   teacher listesi `student:kvkk:read` **ve** `parent_notification:*` içermez) →
 *   öğretmen ne onay durumunu okuyabilir ne geri çekebilir, dolayısıyla ham
 *   iletişim verisine erişemez.
 * - Bu yüzey ham iletişim verisi döndürmez: yalnız maskeli alanlar + sürümler +
 *   kanal kararları; okuma durable audit'e yazılır.
 */
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('notifications/consents')
export class NotificationConsentController {
  constructor(private readonly consents: ConsentLifecycleService) {}

  /** Onay durumu + sürümler (**hassas okuma**, durable audited, yalnız maskeli). */
  @Get(':studentId')
  @Permissions('student:kvkk:read')
  list(
    @Req() request: RequestWithContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    const context = contextOf(request);
    return this.consents.listStudentConsentStatus({
      tenantId: context.tenantId as string,
      studentId,
      actor: actorOf(context),
    });
  }

  /** Onay geri çekme (withdrawable): domain + olay + durable audit tek transaction'da. */
  @Post(':studentId/withdraw')
  @HttpCode(200)
  @Permissions('parent_notification:approve')
  withdraw(
    @Req() request: RequestWithContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() body: WithdrawConsentBody,
  ) {
    const context = contextOf(request);
    return this.consents.withdrawConsent({
      tenantId: context.tenantId as string,
      studentId,
      consentType: parseConsentType(body?.consentType),
      actor: actorOf(context),
    });
  }
}

function contextOf(request: RequestWithContext): RequestContext {
  if (!request.user && !request.context?.user) {
    throw new UnauthorizedException('Authentication required');
  }
  const context = request.context;
  if (!context?.tenantId) throw new ForbiddenException('Tenant context required');
  return context;
}

function actorOf(context: RequestContext): ConsentLifecycleActor {
  const userId = context.user?.userId ?? context.userId;
  if (!userId) throw new UnauthorizedException('Authentication required');
  return {
    actorUserId: userId,
    actorSessionId: context.user?.sessionId ?? null,
    requestId: context.requestId,
  };
}

/** Kapalı sözlük: yalnız desteklenen bildirim onay tipleri kabul edilir. */
function parseConsentType(value: string | undefined): NotificationConsentType {
  if (value !== undefined && NOTIFICATION_CONSENT_TYPES.includes(value as NotificationConsentType)) {
    return value as NotificationConsentType;
  }
  throw new BadRequestException(
    `consentType must be one of: ${NOTIFICATION_CONSENT_TYPES.join(', ')}`,
  );
}
