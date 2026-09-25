import {
  REQUEST_CONTEXT_VERSION,
  RequestAuthorization,
  RequestBranch,
  RequestContext,
  RequestUser,
} from './request-context';

/**
 * Yetki bağlamı çözümlemesi başarısız olduğunda fırlatılan hata (#339 R4).
 *
 * Fail-closed sözleşme: bağlam çözülemiyorsa istek ASLA yetkili sayılmaz.
 * Guard'lar bu hatayı yakalayıp erişimi reddeder; hata mesajı istemciye
 * kaynak/tenant varlığı hakkında bilgi sızdırmaz.
 */
export class AuthorizationContextError extends Error {
  constructor(
    readonly reasonCode:
      | 'missing_authenticated_user'
      | 'missing_tenant_scope'
      | 'unresolved_authority'
      | 'stale_authorization_version'
      | 'inconsistent_active_role'
      | 'unauthorized_branch',
  ) {
    super(`Request context could not be resolved (${reasonCode})`);
    this.name = 'AuthorizationContextError';
  }
}

/** Sunucudan çözülmüş yetki kümesi (rol + izin + token_version). */
export type ServerResolvedAuthority = {
  roles: unknown;
  permissions: unknown;
  tokenVersion: number;
  resolvedAt: string;
  cache: RequestAuthorization['cache'];
  /** Sunucunun seçtiği aktif rol (opsiyonel); rol kümesinde olmalıdır. */
  activeRole?: string | null;
};

export type BuildAuthorizedContextInput = {
  requestId: string;
  user?: RequestUser | null;
  authority?: ServerResolvedAuthority | null;
  /** Sunucunun yetkilendirdiği şube (varsa). */
  branch?: RequestBranch | null;
};

/** Sunucunun aktif rol için kullandığı öncelik sırası (deterministik). */
const ACTIVE_ROLE_PRIORITY: readonly string[] = [
  'tenant_admin',
  'operations_manager',
  'teacher',
  'teacher_assistant',
  'parent',
  'student',
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((entry) => typeof entry === 'string') ? [...(value as string[])].sort() : null;
}

/**
 * Sunucunun seçtiği aktif rolü belirler.
 * Açıkça verilen aktif rol rol kümesinde değilse `undefined` döner
 * (çağıran taraf fail-closed davranır — istemci beyanı aktif rol olamaz).
 */
export function selectActiveRole(
  roles: string[],
  requested?: string | null,
): string | null | undefined {
  if (requested != null) {
    return roles.includes(requested) ? requested : undefined;
  }
  for (const candidate of ACTIVE_ROLE_PRIORITY) {
    if (roles.includes(candidate)) return candidate;
  }
  return roles.length > 0 ? roles[0] : null;
}

/**
 * Yetki bağlamını kurar. Tüm girdiler sunucu tarafından çözülmüş olmalıdır
 * (JWT doğrulaması sonrası `req.user` + DB/önbellek yetki kümesi + sunucunun
 * onayladığı şube). İstemci başlığı/gövdesi bu fonksiyona girdi OLARAK
 * geçirilmez.
 *
 * Fail-closed kurallar (ihlalde `AuthorizationContextError`):
 *  - kimliği doğrulanmış kullanıcı yok,
 *  - tenant kapsamı boş,
 *  - rol/izin kümesi dizi değil ya da dizi içinde string olmayan değer var,
 *  - `authorizationVersion` ile `tokenVersion` uyuşmuyor (token_version uyumu),
 *  - sunucunun seçtiği aktif rol rol kümesinde değil,
 *  - şube bağlamı eksik/boş alan taşıyor.
 */
export function buildAuthorizedContext(input: BuildAuthorizedContextInput): RequestContext {
  const user = input.user;
  if (!user || !isNonEmptyString(user.userId)) {
    throw new AuthorizationContextError('missing_authenticated_user');
  }
  if (!isNonEmptyString(user.tenantId)) {
    throw new AuthorizationContextError('missing_tenant_scope');
  }
  const authority = input.authority;
  if (!authority) {
    throw new AuthorizationContextError('unresolved_authority');
  }
  const roles = stringArray(authority.roles);
  const permissions = stringArray(authority.permissions);
  if (!roles || !permissions) {
    throw new AuthorizationContextError('unresolved_authority');
  }
  const tokenVersion = authority.tokenVersion;
  if (!Number.isInteger(tokenVersion) || tokenVersion < 0) {
    throw new AuthorizationContextError('unresolved_authority');
  }
  if (
    user.authorizationVersion != null &&
    Number(user.authorizationVersion) !== tokenVersion
  ) {
    // Token'daki sürüm ile sunucudaki güncel sürüm farklıysa yetki bayattır.
    throw new AuthorizationContextError('stale_authorization_version');
  }
  const activeRole = selectActiveRole(roles, authority.activeRole ?? null);
  if (activeRole === undefined) {
    throw new AuthorizationContextError('inconsistent_active_role');
  }
  const branch = input.branch ?? null;
  if (branch && (!isNonEmptyString(branch.branchId) || !isNonEmptyString(branch.branchName))) {
    throw new AuthorizationContextError('unauthorized_branch');
  }

  const authorization: RequestAuthorization = {
    resolvedFrom: 'server',
    roles,
    activeRole,
    permissions,
    tokenVersion,
    resolvedAt: authority.resolvedAt,
    cache: authority.cache,
  };

  return {
    requestId: input.requestId,
    contextVersion: REQUEST_CONTEXT_VERSION,
    userId: user.userId,
    tenantId: user.tenantId,
    ...(branch ? { branchId: branch.branchId, branch: branch } : {}),
    roles,
    activeRole,
    permissions,
    authorization,
    user,
  };
}

/**
 * İstemcinin gönderdiği tenant/şube seçimi ile sunucunun çözümlediği bağlamı
 * karşılaştırır. İstemci seçimi yalnızca sunucunun zaten yetkilendirdiği bir
 * değeri TEKRAR ediyorsa kabul edilir; aksi hâlde erişim reddedilir (istemci
 * beyanı yetki üretmez).
 */
export function assertClientSelectionMatchesServer(
  context: RequestContext,
  selection: { tenantId?: string | null; branchId?: string | null },
): boolean {
  if (selection.tenantId != null && selection.tenantId !== context.tenantId) return false;
  if (selection.branchId != null && selection.branchId !== context.branchId) return false;
  return true;
}
