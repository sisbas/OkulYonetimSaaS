import { ForbiddenException, HttpException, NotFoundException, UnauthorizedException } from '@nestjs/common';

/**
 * Non-enumerating hata sözleşmesi (#339 R4, madde 5).
 *
 * Amaç: 403/404 ayrımının kaynak varlığı hakkında bilgi sızdırmaması.
 *
 *  - 401: istek kimliği doğrulanmamış / sunucu bağlamı çözülememiş.
 *  - 403: çağıran kimliği ve bağlamı GEÇERLİ, ancak beyan edilen yetki yok.
 *    Bu yanıt kaynak örneğinin var olup olmadığını SÖYLEMEZ.
 *  - 404: kaynak örneği kapsamı (id/ad) — "başka tenant'ın kaydı", "başka
 *    şubenin kaydı" ve "hiç var olmayan kayıt" AYNI yanıtı üretir.
 *
 * Bu yüzden cross-tenant / cross-branch / unknown-resource durumlarının hepsi
 * `cross_tenant_or_unknown_resource` koduna ve aynı mesaja eşlenir.
 */
export type DenyReasonCode =
  | 'missing_authenticated_context'
  | 'unresolved_context'
  | 'stale_authorization'
  | 'client_authority_rejected'
  | 'undeclared_protected_route'
  | 'missing_permission'
  | 'cross_tenant_or_unknown_resource'
  | 'branch_not_authorized';

export type DenyDecision = {
  status: 401 | 403 | 404;
  reasonCode: DenyReasonCode;
  message: string;
};

/** Kaynak örneği bulunamadı/erişilemez — ayrım yok, tek mesaj. */
export const NON_ENUMERATING_NOT_FOUND_MESSAGE = 'Kayıt bulunamadı';
export const NON_ENUMERATING_FORBIDDEN_MESSAGE = 'Bu işlem için yetkiniz yok';
export const NON_ENUMERATING_UNAUTHORIZED_MESSAGE = 'Oturum bağlamı doğrulanamadı';

const DECISIONS: Record<DenyReasonCode, DenyDecision> = {
  missing_authenticated_context: {
    status: 401,
    reasonCode: 'missing_authenticated_context',
    message: NON_ENUMERATING_UNAUTHORIZED_MESSAGE,
  },
  unresolved_context: {
    status: 401,
    reasonCode: 'unresolved_context',
    message: NON_ENUMERATING_UNAUTHORIZED_MESSAGE,
  },
  stale_authorization: {
    status: 401,
    reasonCode: 'stale_authorization',
    message: NON_ENUMERATING_UNAUTHORIZED_MESSAGE,
  },
  client_authority_rejected: {
    status: 403,
    reasonCode: 'client_authority_rejected',
    message: NON_ENUMERATING_FORBIDDEN_MESSAGE,
  },
  undeclared_protected_route: {
    status: 403,
    reasonCode: 'undeclared_protected_route',
    message: NON_ENUMERATING_FORBIDDEN_MESSAGE,
  },
  missing_permission: {
    status: 403,
    reasonCode: 'missing_permission',
    message: NON_ENUMERATING_FORBIDDEN_MESSAGE,
  },
  branch_not_authorized: {
    status: 404,
    reasonCode: 'cross_tenant_or_unknown_resource',
    message: NON_ENUMERATING_NOT_FOUND_MESSAGE,
  },
  cross_tenant_or_unknown_resource: {
    status: 404,
    reasonCode: 'cross_tenant_or_unknown_resource',
    message: NON_ENUMERATING_NOT_FOUND_MESSAGE,
  },
};

export function decideDeny(reasonCode: DenyReasonCode): DenyDecision {
  return DECISIONS[reasonCode] ?? DECISIONS.unresolved_context;
}

/** Deny kararını Nest istisnasına çevirir (mesaj non-enumerating). */
export function toDenyException(reasonCode: DenyReasonCode): HttpException {
  const decision = decideDeny(reasonCode);
  if (decision.status === 401) return new UnauthorizedException(decision.message);
  if (decision.status === 404) return new NotFoundException(decision.message);
  return new ForbiddenException(decision.message);
}

/** Bağlam/yetki çözümleme hatasını deny sebebine eşler (fail-closed). */
export function denyReasonFromContextFailure(
  reasonCode:
    | 'missing_authenticated_user'
    | 'missing_tenant_scope'
    | 'unresolved_authority'
    | 'stale_authorization_version'
    | 'inconsistent_active_role'
    | 'unauthorized_branch',
): DenyReasonCode {
  switch (reasonCode) {
    case 'missing_authenticated_user':
      return 'missing_authenticated_context';
    case 'stale_authorization_version':
      return 'stale_authorization';
    case 'inconsistent_active_role':
      return 'client_authority_rejected';
    case 'unauthorized_branch':
      return 'branch_not_authorized';
    case 'unresolved_authority':
    case 'missing_tenant_scope':
    default:
      return 'unresolved_context';
  }
}

/**
 * İki deny sebebinin istemciye AYIRT EDİLEMEZ yanıt üretip üretmediğini
 * söyler. Negatif testler bu fonksiyonla "sızıntı yok" iddiasını doğrular.
 */
export function indistinguishableDenials(a: DenyReasonCode, b: DenyReasonCode): boolean {
  const left = decideDeny(a);
  const right = decideDeny(b);
  return left.status === right.status && left.message === right.message;
}
