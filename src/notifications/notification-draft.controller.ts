import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from 'typeorm';
import { RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import { NotificationDraftService } from './notification-draft.service';

/**
 * #266 N1c — Notification draft public API (operatör onay kuyruğu).
 *
 * Kilitli devamsızlıktan üretilen bildirim taslakları için
 * salt-okuma + onay/iptal akışı sağlar.
 *
 * KVKK: yanıtlar ham PII taşımaz; snapshot pseudonymize edilmiş
 * referanslar ve maskelenmiş değerler içerir.
 */
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('notifications/drafts')
export class NotificationDraftController {
  constructor(
    private readonly draftService: NotificationDraftService,
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  /**
   * Draft listesi — operatör onay kuyruğu.
   *
   * Yalnız `pending` ve `blocked_consent` durumundaki satırlar
   * taslak olarak görünür. Tenant + branch predicate zorunludur.
   */
  @Get()
  @Permissions('notification:draft:read')
  async list(
    @Req() req: RequestWithContext,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    const drafts = await this.dataSource.transaction(async (em) =>
      this.draftService.listDrafts(em, ctx, parsedLimit, parsedOffset),
    );
    return { drafts };
  }

  /**
   * Tek draft detayı.
   *
   * Tenant + branch predicate zorunludur. Snapshot ile birlikte
   * döner (PII taşımaz).
   */
  @Get(':id')
  @Permissions('notification:draft:read')
  async get(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    const draft = await this.dataSource.transaction(async (em) =>
      this.draftService.getDraft(em, ctx, id),
    );
    if (!draft) throw new ForbiddenException('Draft not found');
    return draft;
  }

  /**
   * Session düzeyinde toplu draft onayı — `pending|blocked_consent` → `approved`.
   *
   * (P1B-FINAL Stage 5) Aynı attendance session'ının tüm draftlarını tek
   * işlemde onaylar. Optimistic concurrency: `expectedVersions` dizisindeki
   * `(id, version)` eşleşmesi all-or-nothing korumalıdır.
   * `:id` parametresiyle çakışmaması için `:id/approve`'tan ÖNCE kayıtlıdır.
   */
  @Post('session/:sessionId/approve')
  @Permissions('notification:draft:approve')
  async approveSession(
    @Req() req: RequestWithContext,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: { expectedVersions: Array<{ id: string; version: number }> },
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    return this.dataSource.transaction(async (em) =>
      this.draftService.bulkApproveSession(em, {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        sessionId,
        expectedVersions: body.expectedVersions ?? [],
      }),
    );
  }

  /**
   * Draft onayı — `pending` → `approved`.
   *
   * Optimistic concurrency: `expectedVersion` ile korunur.
   * Stale version'da hata fırlatır.
   */
  @Post(':id/approve')
  @Permissions('notification:draft:approve')
  async approve(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { expectedVersion: number },
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    return this.dataSource.transaction(async (em) =>
      this.draftService.approveDraft(em, {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        id,
        expectedVersion: body.expectedVersion,
      }),
    );
  }

  /**
   * Draft iptali — `pending` → `closed`.
   *
   * Optimistic concurrency: `expectedVersion` ile korunur.
   * Stale version'da hata fırlatır.
   */
  @Post(':id/close')
  @Permissions('notification:draft:close')
  async close(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { expectedVersion: number },
  ) {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    return this.dataSource.transaction(async (em) =>
      this.draftService.closeDraft(em, {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        id,
        expectedVersion: body.expectedVersion,
      }),
    );
  }
}
