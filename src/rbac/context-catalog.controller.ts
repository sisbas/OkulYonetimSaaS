import { Body, Controller, Get, Post, Req } from '@nestjs/common';

import { AuthorizationContextError } from '../common/context/authorization-context';
import { ContextScoped } from '../common/context/context-scope.decorator';
import { toDenyException } from '../common/context/deny-response';
import { RequestWithContext } from '../common/context/request-context';
import { AuditAction } from '../common/decorators/audit-action.decorator';
import { ContextCatalog, ContextCatalogService } from './context-catalog.service';
import { ContextBranchSelectDto } from './dto/context-branch-select.dto';

/**
 * Versioned context/catalog uç noktası (#339 R4, madde 3).
 *
 * Bu uç noktalar `@ContextScoped()` erişim sınıfındadır: iş kaynağı izni
 * gerektirmezler, ancak kimliği doğrulanmış + sunucudan çözülmüş bağlam
 * ZORUNLUDUR (default-deny). Dönen veri yalnızca çağıranın erişebildiği kurum
 * ve şubelerdir; iç UUID/ETag/jargon dönmez.
 */
@Controller('context')
export class ContextCatalogController {
  constructor(private readonly catalog: ContextCatalogService) {}

  @Get()
  @ContextScoped()
  @AuditAction({ action: 'context.catalog.read', resource: 'context.catalog' })
  async current(@Req() req: RequestWithContext): Promise<ContextCatalog> {
    return this.run(req, {});
  }

  /**
   * Şube seçimi: istemci yalnızca bir AD gönderir; sunucu bu adı yetkili şube
   * kümesiyle eşler. Eşleşme yoksa ya da ad belirsizse non-enumerating 404
   * döner (başka kurum/şube varlığı sızmaz).
   */
  @Post('branch')
  @ContextScoped()
  @AuditAction({ action: 'context.branch.select', resource: 'context.branch' })
  async selectBranch(
    @Req() req: RequestWithContext,
    @Body() body: ContextBranchSelectDto,
  ): Promise<ContextCatalog> {
    return this.run(req, { branchName: body?.branchName });
  }

  private async run(
    req: RequestWithContext,
    selection: { branchName?: string | null },
  ): Promise<ContextCatalog> {
    try {
      return await this.catalog.build(req.context ?? { requestId: 'unknown' }, selection);
    } catch (error) {
      if (error instanceof AuthorizationContextError) {
        throw toDenyException(
          error.reasonCode === 'unauthorized_branch'
            ? 'branch_not_authorized'
            : error.reasonCode === 'stale_authorization_version'
              ? 'stale_authorization'
              : 'unresolved_context',
        );
      }
      throw error;
    }
  }
}
