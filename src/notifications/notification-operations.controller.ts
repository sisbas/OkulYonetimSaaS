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
import { RequestWithContext } from '../common/context/request-context';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationOutboxStatus } from './notification-outbox.entity';

const VALID_STATUSES: ReadonlySet<string> = new Set<NotificationOutboxStatus>([
  'pending',
  'blocked_consent',
  'approved',
  'dispatched',
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
   */
  @Get(':id')
  @Permissions('notification:draft:read')
  async detail(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    const includeReceipts = this.hasPermission(req, 'parent_notification:failure:read');
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

  /** Sunucu çözülmüş yetki — istemci beyanı asla kaynak değildir. */
  private hasPermission(req: RequestWithContext, code: string): boolean {
    const fromContext =
      req.context?.authorization?.permissions ?? req.context?.permissions ?? [];
    const fromUser = req.user?.permissions ?? [];
    return fromContext.includes(code) || fromUser.includes(code);
  }
}
