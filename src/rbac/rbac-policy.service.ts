import { Injectable, Logger } from '@nestjs/common';

import {
  isKvkkSubjectRole,
  kvkkFieldCategoryForResource,
  OKUL01_PERMISSION_MATRIX,
  RolePermissionMapping,
  SystemRole,
} from './roles.extended';
import {
  RbacDenyReasonCode,
  RbacPolicyDecision,
  RbacPolicyInput,
} from './rbac-policy.types';

/**
 * OKUL-01 role-based policy engine.
 *
 * Tek sorumluluğu: verilen aktör + hedef + kaynak için ALLOW/DENY kararı üretmek.
 * Saf fonksiyonel çekirdek (decide-impure değil) tutulur; böylece unit test
 * DB/postgres gerektirmez. Tenant izolasyonu, KVKK PII koruması ve açık red
 * kuralları burada merkezi olarak uygulanır.
 *
 * Fail-closed ilke: belirsizlik olduğunda DENY döner (varsayılan ret).
 */
@Injectable()
export class RbacPolicyService {
  private readonly logger = new Logger(RbacPolicyService.name);

  /** Aktörün rollerine göre OKUL-01 matrix'inden eşleşen kurallar. */
  private matrixForRoles(roleIds: SystemRole[]): RolePermissionMapping[] {
    return OKUL01_PERMISSION_MATRIX.filter((mapping) =>
      (roleIds as string[]).includes(mapping.role),
    );
  }

  /**
   * Ana karar fonksiyonu. Değerlendirme sırası fail-closed'dur:
   *   1) tenant izolasyonu ihlali -> 403 (tenant_isolation_breach)
   *   2) matrix'te açık deny -> 403 (explicit_deny)
   *   3) KVKK PII koruması (öğrenci/veli rolü + hassas kaynak) -> 403 (kvkk_pii_protected)
   *   4) efektif izin kümesinde permission yok -> 403 (missing_permission)
   *   5) aksi halde -> 200 (allow)
   */
  decide(input: RbacPolicyInput): RbacPolicyDecision {
    const { roleIds, permissions, actorTenantId, targetTenantId, permission, resource } = input;

    // 1) Tenant izolasyonu — aktör başka tenant'ın kaynağına erişemez.
    if (targetTenantId != null && targetTenantId !== actorTenantId) {
      return this.deny({
        permission,
        resource,
        auditRequired: true,
        denyState: 'forbidden_403',
        reasonCode: 'tenant_isolation_breach',
        tenantId: actorTenantId,
        matchedRole: null,
      });
    }

    const matrix = this.matrixForRoles(roleIds);

    // 2) Açık red (explicit deny) — matrix'teki deny kaydı her şeyi bastırır.
    const explicitDeny = matrix.find(
      (mapping) => mapping.permission === permission && mapping.effect === 'deny',
    );
    if (explicitDeny) {
      return this.deny({
        permission,
        resource,
        auditRequired: explicitDeny.auditRequired,
        denyState: explicitDeny.denyState,
        reasonCode: 'explicit_deny',
        tenantId: actorTenantId,
        matchedRole: explicitDeny.role,
      });
    }

    // 3) KVKK PII koruması — KVKK kapsamındaki roller için hassas kaynak varsayılan ret.
    const piiCategory = kvkkFieldCategoryForResource(resource);
    if (piiCategory === 'parent_contact' || piiCategory === 'sensitive') {
      const kvkkSubject = roleIds.some((role) => isKvkkSubjectRole(role));
      const hasExplicitAllow = matrix.some(
        (mapping) =>
          mapping.permission === permission &&
          mapping.effect === 'allow' &&
          !mapping.kvkkProtected,
      );
      // KVKK öznesi rol, açık ve KVKK-korumasız bir allow kaydı olmadan
      // hassas PII alanına erişemez.
      if (kvkkSubject && !hasExplicitAllow) {
        return this.deny({
          permission,
          resource,
          auditRequired: true,
          denyState: 'blocked_kvkk',
          reasonCode: 'kvkk_pii_protected',
          tenantId: actorTenantId,
          matchedRole: roleIds.find((role) => isKvkkSubjectRole(role)) ?? null,
        });
      }
    }

    // 4) Efektif izin kontrolü (DB'den çözülen izin kümesi).
    const hasPermission = (permissions as string[]).includes(permission);
    if (!hasPermission) {
      return this.deny({
        permission,
        resource,
        auditRequired: false,
        denyState: 'forbidden_403',
        reasonCode: 'missing_permission',
        tenantId: actorTenantId,
        matchedRole: null,
      });
    }

    // 5) İzin var, red yok -> ALLOW
    const allowMapping = matrix.find(
      (mapping) => mapping.permission === permission && mapping.effect === 'allow',
    );
    return {
      outcome: 'allow',
      allowed: true,
      statusCode: 200,
      permission,
      resource,
      auditRequired: allowMapping?.auditRequired ?? false,
      denyState: allowMapping?.denyState ?? 'none',
      reasonCode: null,
      tenantId: actorTenantId,
      matchedRole: allowMapping?.role ?? null,
    };
  }

  /** Verilen rollerin efektif izin listesini (matrix'ten) hesaplar. */
  resolveEffectivePermissions(roleIds: SystemRole[]): string[] {
    const seen = new Set<string>();
    for (const mapping of this.matrixForRoles(roleIds)) {
      if (mapping.effect === 'allow' && !mapping.kvkkProtected) {
        seen.add(mapping.permission);
      }
    }
    return [...seen].sort();
  }

  /** Matrix'te tanımlı yeni rollerin tümünü döndürür (katalog sözleşmesi). */
  listExtendedRoles(): SystemRole[] {
    return OKUL01_PERMISSION_MATRIX.map((m) => m.role)
      .filter((role, index, all) => all.indexOf(role) === index) as SystemRole[];
  }

  private deny(input: {
    permission: string;
    resource: string;
    auditRequired: boolean;
    denyState: RbacPolicyDecision['denyState'];
    reasonCode: RbacDenyReasonCode;
    tenantId: string | null;
    matchedRole: SystemRole | null;
  }): RbacPolicyDecision {
    return {
      outcome: 'deny',
      allowed: false,
      statusCode: 403,
      permission: input.permission,
      resource: input.resource,
      auditRequired: input.auditRequired,
      denyState: input.denyState,
      reasonCode: input.reasonCode,
      tenantId: input.tenantId,
      matchedRole: input.matchedRole,
    };
  }
}
