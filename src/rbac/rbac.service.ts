import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestUser } from '../common/context/request-context';
import { RbacPolicyService } from './rbac-policy.service';
import { RbacRoleEntity } from './rbac-role.entity';
import { isSystemRole, OKUL01_EXTENDED_ROLES, SystemRole } from './roles.extended';

/**
 * OKUL-01 RBAC servisi.
 *
 * Rol okuma ve policy sorgulama işlemlerini tenant izolasyonu içinde sunar.
 * Tüm okuma işlemleri aktörün `tenantId`'si ile filtrelenir; başka tenant'a
 * ait rol kayıtları asla döndürülmez (tenant bazlı izolasyon korunur).
 *
 * Güvenlik: evaluate/resolveEffectivePermissions, güvenilmeyen (token'dan
 * gelen) aktör verisini normalize eder. Eksik/hatalı `permissions` veya
 * geçersiz `roleIds` çökme (crash) yerine 403 üretir.
 *
 * KVKK: bu servis hiçbir PII taşımaz; yalnızca rol/izin meta-verisiyle çalışır.
 * Sahiplik (veli-öğrenci) kontrolü yalnızca ID düzeyinde yapılır.
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

  /**
   * Aktörün izin kümesini OKUL-01 matrix'i üzerinden hesaplar.
   * Güvenilmeyen aktör verisi normalize edilir (permissions -> [], roleIds
   * yalnızca isSystemRole ile filtrelenir); malformed actor yerine boş küme döner.
   */
  resolveEffectivePermissions(actor: RequestUser): string[] {
    const normalized = this.normalizeActor(actor);
    if (!normalized) {
      this.logger.warn('Malformed actor; efektif izin kümesi boş döndürülüyor');
      return [];
    }
    return this.policy.resolveEffectivePermissions(normalized.roleIds as SystemRole[]);
  }

  /**
   * Policy engine'i sarmalar; tenant izolasyonu ve (gerekirse) veli sahiplik
   * kontrolünü input'a uygular.
   *
   * linkedStudentIds güvenilir kaynaktan (JWT claim) gelmelidir; isteğin
   * gövdesinden ASLA okunmaz (cross-student leak riski).
   */
  evaluate(
    actor: RequestUser,
    input: {
      permission: string;
      resource: string;
      action?: string;
      targetTenantId?: string;
      targetStudentId?: string;
    },
  ) {
    this.assertTenantScope(actor);
    const normalized = this.normalizeActor(actor);
    if (!normalized) {
      // Malformed actor -> çökme yerine 403 (fail-closed).
      return this.policy.decide({
        roleIds: [],
        permissions: [],
        actorTenantId: actor?.tenantId ?? '',
        targetTenantId: input.targetTenantId ?? null,
        targetStudentId: input.targetStudentId ?? null,
        linkedStudentIds: [],
        permission: input.permission,
        resource: input.resource,
        action: input.action,
      });
    }
    return this.policy.decide({
      roleIds: normalized.roleIds as SystemRole[],
      permissions: normalized.permissions,
      actorTenantId: normalized.tenantId,
      targetTenantId: input.targetTenantId ?? null,
      targetStudentId: input.targetStudentId ?? null,
      // Güvenilir kaynaktan gelen bağlı öğrenci listesi (req.user/JWT claim).
      // İstek gövdesinden ASLA alınmaz (cross-student leak sahteciliği riski).
      linkedStudentIds: normalized.linkedStudentIds,
      permission: input.permission,
      resource: input.resource,
      action: input.action,
    });
  }

  /**
   * Güvenilmeyen aktör verisini normalize eder.
   * - permissions: undefined/null değilse string[]'e çevrilir, aksi halde [].
   * - roleIds: yalnızca isSystemRole doğrulaması geçen değerler tutulur.
   * - tenantId: string olmalı.
   * Geçersiz aktör (null/undefined, tenantId yok) için null döner -> 403.
   */
  private normalizeActor(actor: RequestUser | null | undefined): {
    tenantId: string;
    roleIds: string[];
    permissions: string[];
    linkedStudentIds: readonly string[];
  } | null {
    if (!actor || typeof actor !== 'object') return null;

    const tenantId =
      typeof actor.tenantId === 'string' && actor.tenantId.length > 0
        ? actor.tenantId
        : '';

    if (!tenantId) return null; // tenant scope zorunlu

    // roleIds: yalnızca bilinen sistem rolleri kabul edilir.
    const rawRoles = Array.isArray(actor.roleIds) ? actor.roleIds : [];
    const roleIds = rawRoles.filter(
      (r): r is SystemRole => typeof r === 'string' && isSystemRole(r),
    );

    // permissions: tanımsız/sayı değilse boş diziye normalize et.
    const rawPerms = Array.isArray(actor.permissions) ? actor.permissions : [];
    const permissions = rawPerms.filter((p) => typeof p === 'string');

    // linkedStudentIds: yalnızca güvenilir kaynaktan (JWT claim) gelen ID kümesi.
    // İstek gövdesinden ASLA beslenmez (cross-student leak sahteciliği engellenir).
    interface ActorWithLinks extends RequestUser {
      linkedStudentIds?: readonly string[] | null;
    }
    const rawLinks = (actor as ActorWithLinks).linkedStudentIds;
    const linkedStudentIds = Array.isArray(rawLinks)
      ? rawLinks.filter((id) => typeof id === 'string')
      : [];

    return { tenantId, roleIds, permissions, linkedStudentIds };
  }

  private assertTenantScope(actor: RequestUser): void {
    if (!actor?.tenantId) {
      this.logger.warn('Tenant scope eksik; rol erişimi reddedildi');
      throw new ForbiddenException('Tenant scope gerekli');
    }
  }
}
