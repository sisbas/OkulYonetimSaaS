import { Request } from 'express';

export type RequestUser = {
  userId: string;
  tenantId: string;
  roleIds: string[];
  permissions: string[];
  sessionId?: string;
  authorizationVersion?: number;
};

export type TenantLocalBusinessDate = {
  tenantId: string;
  date: string;
  source: 'tenant_local';
};

/**
 * Şube (branch) kapsamı — TAMAMEN sunucudan çözülür.
 *
 * `source` istemcinin ne gönderdiğini değil, sunucunun bu şubeyi neden aktif
 * kabul ettiğini kaydeder:
 *  - `request_selection`: istemci bir şube *seçimi* gönderdi ve sunucu bu
 *    seçimi yetkili şube kümesiyle doğruladı (seçim yetki DEĞİLDİR).
 *  - `membership_default`: istemci seçim göndermedi; sunucu oturumun şube
 *    kümesinden varsayılanı belirledi.
 */
export type RequestBranch = {
  branchId: string;
  branchName: string;
  source: 'request_selection' | 'membership_default';
};

/**
 * Sunucudan çözülmüş yetki (authority) özeti.
 *
 * `resolvedFrom: 'server'` alanı sözleşmenin parçasıdır: izin/rol kümesi
 * veritabanından (veya sunucu tarafı önbelleğinden) gelir; token/başlık/gövde
 * içindeki istemci beyanları asla yetki kaynağı değildir.
 */
export type RequestAuthorization = {
  resolvedFrom: 'server';
  roles: string[];
  activeRole: string | null;
  permissions: string[];
  /** `users.token_version`; 0 = kimlik katmanı çözdü, önbellek devre dışı. */
  tokenVersion: number;
  resolvedAt: string;
  cache: 'hit' | 'miss' | 'disabled';
};

/** Context sözleşme sürümü — şekil değiştiğinde artırılır. */
export const REQUEST_CONTEXT_VERSION = 'context:v2' as const;

export type RequestContext = {
  requestId: string;
  /** `REQUEST_CONTEXT_VERSION`; istemciye sürüm bildirimi için taşınır. */
  contextVersion?: string;
  userId?: string;
  tenantId?: string;
  branchId?: string;
  branch?: RequestBranch;
  roles?: string[];
  activeRole?: string | null;
  permissions?: string[];
  authorization?: RequestAuthorization;
  businessDate?: TenantLocalBusinessDate;
  user?: RequestUser;
};

export type RequestWithContext = Request & { context?: RequestContext; user?: RequestUser };
