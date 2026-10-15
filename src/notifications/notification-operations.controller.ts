import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Permissions } from '../common/decorators/permissions.decorator';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import { RequestContext, RequestWithContext } from '../common/context/request-context';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationOutboxStatus } from './notification-outbox.entity';

const VALID_STATUSES: ReadonlySet<string> = new Set<NotificationOutboxStatus>([
  'pending',
  'blocked_consent',
  'approved',
  'dispatched',
  'delivered',
  'failed',
  'dead_lettered',
  'uncertain',
  'cancelled',
  'closed',
]);

/**
 * #266 N3 — Notification Operations public API (sunucu-otoriter).
 *
 * N1c `/notifications/drafts*` akışını DEĞİŞTİRMEZ; operatör gönderim
 * (execute/retry/cancel) ve tüm-durum listesini ekler. Her yanıt
 * `version` döner (UI optimistic concurrency). Receipt'ler yalnız
 * `parent_notification:failure:read` yetkisinde görünür.
 *
 * KVKK: yanıtlar maskeleli meta veri + pseudonymize referanslar taşır.
 */
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('notifications')
export class NotificationOperationsController {
  constructor(private readonly dispatchService: NotificationDispatchService) {}

  /** Tüm durumlardaki bildirim operasyon listesi. */
  @Get()
  @Permissions('notification:draft:read')
  async list(
    @Req() req: RequestWithContext,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    if (status !== undefined && !VALID_STATUSES.has(status)) {
      throw new ForbiddenException('NOTIFICATION_STATUS_FILTER_INVALID');
    }
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    const notifications = await this.dispatchService.list(ctx, {
      limit: parsedLimit,
      offset: parsedOffset,
      status,
    });
    return { notifications };
  }

  /**
   * Bildirim detayı — sunucu hesaplı `availableActions` + `version`.
   * Receipt'ler yalnız `parent_notification:failure:read` yetkisinde döner.
   *
   * Receipt görünürlüğü route kapısı DEĞİLDİR: rota `notification:draft:read`
   * ile açılır, receipt'ler ise yanıt alanı bazında koşullu eklenir. Bu yüzden
   * karar guard'ın kullandığı TEK sunucu-çözülmüş kaynaktan (`context.permissions`)
   * verilir; JWT beyanı hiçbir durumda yetki kaynağı değildir (#462).
   */
  @Get(':id')
  @Permissions('notification:draft:read')
  async detail(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    const includeReceipts = hasPermission(ctx, 'parent_notification:failure:read');
    return this.dispatchService.detail(ctx, id, includeReceipts);
  }

  /**
   * Gönderimi yürüt — tx1 claim → dispatch-time onay yeniden doğrulama →
   * simüle sağlayıcı → koşullu geçiş → dayanıcı receipt.
   *
   * Idempotent: `dispatched` satırda ikinci çağrı yeni etki üretmez,
   * mevcut receipt'i döner.
   */
  @Post(':id/execute')
  @Permissions('parent_notification:send')
  async execute(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    return this.dispatchService.execute(ctx, id);
  }

  /** Dead-letter/uncertain → yeniden uygunluk (attempts korunur). */
  @Post(':id/retry')
  @Permissions('parent_notification:send')
  async retry(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    return this.dispatchService.retry(ctx, id);
  }

  /**
   * İptal — koşullu geçiş; `dispatched`/`cancelled`/`closed` korunur.
   * Execute ile yarışta tek kazanan olur (race-safe).
   */
  @Post(':id/cancel')
  @Permissions('parent_notification:approve')
  async cancel(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    return this.dispatchService.cancel(ctx, id);
  }
}

/**
 * Koşullu alan görünürlüğü için sunucu-çözülmüş yetki kaynağı (#462).
 *
 * `PermissionGuard` route kapısını `request.context.permissions` üzerinden
 * karar verir; burada **aynı alan** okunur. Tek kaynak burada bitiyor.
 *
 * `req.user.permissions` BİLEREK KULLANILMAZ: bu alan JWT gövdesindeki beyandır
 * ve oturum boyunca yeniden çözülmez. Argümanın tamamı:
 * `docs/notifications/dispatch-receipt-visibility.md`.
 *
 * `@Permissions(...)` guard'ı tüm route'lar için gerekli izni zorunlu kılar;
 * koşullu alan ekleme ifadesi bu yüzden route seviyesinde temsil edilemez.
 */
function hasPermission(context: RequestContext, code: string): boolean {
  const permissions = context.permissions ?? [];
  return permissions.includes(code);
}
