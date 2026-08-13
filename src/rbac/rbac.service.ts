import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestUser } from '../common/context/request-context';
import { RbacPolicyService } from './rbac-policy.service';
import { RbacRoleEntity } from './rbac-role.entity';
import { OKUL01_EXTENDED_ROLES, SystemRole } from './roles.extended';

/**
 * OKUL-01 RBAC servisi.
 *
 * Rol okuma ve policy sorgulama işlemlerini tenant izolasyonu içinde sunar.
 * Tüm okuma işlemleri aktörün `tenantId`'si ile filtrelenir; başka tenant'a
 * ait rol kayıtları asla döndürülmez (tenant bazlı izolasyon korunur).
 *
 * KVKK: bu servis hiçbir PII taşımaz; yalnızca rol/izin meta-verisiyle çalışır.
 */
@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    @InjectRepository(RbacRoleEntity)
    private readonly roleRepository: Repository<RbacRoleEntity>,
    private readonly policy: RbacPolicyService,
  ) {}

  /** Aktörün tenant'ına ait tüm rolleri (soft-delete hariç) döndürür. */
  async listTenantRoles(actor: RequestUser): Promise<RbacRoleEntity[]> {
    this.assertTenantScope(actor);
    return this.roleRepository.find({
      where: { tenantId: actor.tenantId },
      order: { name: 'ASC' },
    });
  }

  /** Aktörün tenant'ında belirli bir rolü (id ile) döndürür. */
  async getTenantRole(actor: RequestUser, roleId: string): Promise<RbacRoleEntity> {
    this.assertTenantScope(actor);
    const role = await this.roleRepository.findOne({
      where: { id: roleId, tenantId: actor.tenantId },
    });
    if (!role) {
      throw new NotFoundException('Rol bulunamadı');
    }
    return role;
  }

  /** OKUL-01 ile eklenen yeni rol adlarını döndürür (katalog sözleşmesi). */
  listExtendedRoles(): SystemRole[] {
    return [...OKUL01_EXTENDED_ROLES];
  }

  /** Aktörün izin kümesini OKUL-01 matrix'i üzerinden hesaplar. */
  resolveEffectivePermissions(actor: RequestUser): string[] {
    return this.policy.resolveEffectivePermissions(actor.roleIds as SystemRole[]);
  }

  /** Policy engine'i sarmalar; tenant izolasyonunu input'a uygular. */
  evaluate(actor: RequestUser, input: { permission: string; resource: string; action?: string; targetTenantId?: string }) {
    this.assertTenantScope(actor);
    return this.policy.decide({
      roleIds: actor.roleIds as SystemRole[],
      permissions: actor.permissions,
      actorTenantId: actor.tenantId,
      targetTenantId: input.targetTenantId ?? null,
      permission: input.permission,
      resource: input.resource,
      action: input.action,
    });
  }

  private assertTenantScope(actor: RequestUser): void {
    if (!actor?.tenantId) {
      this.logger.warn('Tenant scope eksik; rol erişimi reddedildi');
      throw new ForbiddenException('Tenant scope gerekli');
    }
  }
}
