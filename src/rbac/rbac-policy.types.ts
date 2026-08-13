/**
 * OKUL-01 RBAC policy engine — tip tanımları.
 *
 * Policy engine, bir aktörün (rol + izin kümesi + tenant) belirli bir kaynağa
 * erişip erişemeyeceğine karar verir. Üç katmanlı fail-closed (kapalıya doğru
 * başarısız) değerlendirme yapar:
 *   1) Tenant izolasyonu (tenant_isolation_breach)
 *   2) Açık red (explicit_deny) — matrix'teki deny kayıtları
 *   3) KVKK PII koruması (kvkk_pii_protected) — öğrenci/veli rolleri için varsayılan ret
 *   4) İzin varlığı (missing_permission) — DB'den çözülen izin kümesi
 */

import { PermissionDenyState } from './permission-catalog';
import { PiiFieldCategory, SystemRole } from './roles.extended';

export type RbacDecisionOutcome = 'allow' | 'deny';

export type RbacDenyReasonCode =
  | 'missing_permission'
  | 'tenant_isolation_breach'
  | 'explicit_deny'
  | 'kvkk_pii_protected'
  | 'tenant_header_mismatch';

/** Bir policy kararının çıktı sözleşmesi (rbac-api.contract.ts ile uyumlu). */
export interface RbacPolicyDecision {
  outcome: RbacDecisionOutcome;
  allowed: boolean;
  statusCode: 200 | 403;
  permission: string;
  resource: string;
  auditRequired: boolean;
  denyState: PermissionDenyState;
  reasonCode: RbacDenyReasonCode | null;
  tenantId: string | null;
  /** Kararın dayandığı rol (varsa). */
  matchedRole: SystemRole | null;
}

/** Policy değerlendirmesi için girdi. */
export interface RbacPolicyInput {
  /** Aktörün sahip olduğu roller (sistem rol adları). */
  roleIds: SystemRole[];
  /** Aktörün DB'den çözülen efektif izin kümesi. */
  permissions: string[];
  /** Token'dan gelen aktör tenant kimliği. */
  actorTenantId: string;
  /** Erişilmek istenen kaynağın tenant kimliği (opsiyonel). */
  targetTenantId?: string | null;
  /** Gerekli izin kodu (örn. 'student:parent_contact:read'). */
  permission: string;
  /** Kaynak anahtarı (örn. 'student.parent_contact'). */
  resource: string;
  action?: string;
}

export type { PiiFieldCategory };
