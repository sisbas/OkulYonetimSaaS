import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RequestWithContext } from '../common/context/request-context';
import { RbacPolicyQueryDto } from './dto/rbac-policy-query.dto';
import { RbacService } from './rbac.service';
import { OKUL01_EXTENSION_VERSION } from './roles.extended';
import { PERMISSION_SEED } from '../database/seeds/permissions.seed';

/**
 * OKUL-01 RBAC genişletme controller'ı.
 *
 * Mevcut `/rbac/permissions` ve `/rbac/roles` uç noktaları korunur; yeni
 * uç noktalar OKUL-01 rolleri ve policy engine sorgusu için eklenir.
 * Tüm uç noktalarda tenant izolasyonu RbacService katmanında zorlanır.
 *
 * Güvenlik: targetTenantId YALNIZCA istek gövdesinden (body) alınır; query
 * parametresi ile çakışma olmaz (tek kaynak). Veli sahiplik kontrolü için
 * linkedStudentIds GÜVENİLİR kaynaktan (JWT claim / req.user) gelir, asla
 * istek gövdesinden okunmaz (başka öğrenciye erişim sahteciliği engellenir).
 */

@UseGuards(AuthGuard('jwt'))
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  @Permissions('role:permission:read')
  permissions() {
    return PERMISSION_SEED;
  }

  @Get('roles')
  @Permissions('role:read')
  async roles(@Req() req: RequestWithContext) {
    return this.rbac.listTenantRoles(req.user!);
  }

  /** OKUL-01 ile eklenen yeni rolleri ve versiyonu döndürür. */
  @Get('okul-01/roles')
  @Permissions('role:read')
  okul01Roles() {
    return {
      version: OKUL01_EXTENSION_VERSION,
      roles: this.rbac.listExtendedRoles(),
    };
  }

  /** Tenant'a ait belirli bir rolü döndürür. */
  @Get('okul-01/roles/:roleId')
  @Permissions('role:read')
  async okul01Role(@Req() req: RequestWithContext, @Param('roleId') roleId: string) {
    return this.rbac.getTenantRole(req.user!, roleId);
  }

  /** Policy engine değerlendirme uç noktası (tenant izolasyonu dahil). */
  @Post('okul-01/evaluate')
  @Permissions('role:permission:read')
  evaluate(@Req() req: RequestWithContext, @Body() body: RbacPolicyQueryDto) {
    // linkedStudentIds güvenilir kaynaktan (req.user / JWT claim) gelir;
    // service katmanında aktörden okunur, gövdeden OKUNMAZ (cross-student leak
    // sahteciliği riski).
    return this.rbac.evaluate(req.user!, {
      permission: body.permission,
      resource: body.resource,
      action: body.action,
      // targetTenantId tek kaynak: istek gövdesi (query parametresi yok).
      targetTenantId: body.targetTenantId,
      targetStudentId: body.targetStudentId,
    });
  }
}
