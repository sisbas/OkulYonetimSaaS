/**
 * İstek hata kategorilerinin TEK kaynağı (#416 / K-26).
 *
 * main.ts'teki global exception filter ve audit interceptor aynı allowlist'i
 * kullanır; biri 7, diğeri 5 kategori tuttuğu için denetim logları farklı
 * sınıflandırılıyordu. Bu liste yalnızca log kategorisi üretir, yanıt gövdesini
 * veya HTTP durumunu değiştirmez.
 */
export const REQUEST_FAILURE_CATEGORIES = [
  'AuthorizationContextError',
  'UnauthorizedException',
  'ForbiddenException',
  'NotFoundException',
  'BadRequestException',
  'ConflictException',
  'HttpException',
] as const;

export type RequestFailureCategory = (typeof REQUEST_FAILURE_CATEGORIES)[number];

export function requestFailureCategory(name: string): RequestFailureCategory | 'Error' {
  return REQUEST_FAILURE_CATEGORIES.find((category) => category === name) ?? 'Error';
}
