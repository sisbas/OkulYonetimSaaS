/**
 * Public (kimlik doğrulaması gerektirmeyen) route sözleşmesi — #339 R4.
 *
 * Default-deny kuralı: bu listede AÇIKÇA yer almayan her route korumalıdır.
 * Liste kasıtlı olarak dar ve exact tutulur; handler kimliği (controller +
 * handler adı) ile eşleşir, istemcinin gönderdiği hiçbir değerle eşleşmez.
 *
 * `routeKey` alanı `test/rbac/controller-enforcement-consistency.spec.ts`
 * içindeki `PUBLIC_ROUTES` allowlist'i ile birebir aynı olmalıdır; test bu iki
 * kaynağın senkron olduğunu ve bayat girdi içermediğini doğrular.
 */
export type PublicRouteDeclaration = {
  controller: string;
  handler: string;
  /** `<dosya> <method> <path>` biçiminde statik allowlist anahtarı. */
  routeKey: string;
};

export const PUBLIC_ROUTE_DECLARATIONS: ReadonlyArray<PublicRouteDeclaration> = [
  { controller: 'HealthController', handler: 'check', routeKey: 'src/health/health.controller.ts get ' },
  { controller: 'AuthController', handler: 'login', routeKey: 'src/auth/auth.controller.ts post login' },
  { controller: 'AuthController', handler: 'refresh', routeKey: 'src/auth/auth.controller.ts post refresh' },
];

export const PUBLIC_ROUTE_KEYS: ReadonlyArray<string> = PUBLIC_ROUTE_DECLARATIONS.map(
  (declaration) => declaration.routeKey,
);

/** Route korumasız mı? Yalnızca yukarıdaki exact listede yer alanlar. */
export function isPublicRouteHandler(
  controllerName: string | undefined,
  handlerName: string | undefined,
): boolean {
  if (!controllerName || !handlerName) return false;
  return PUBLIC_ROUTE_DECLARATIONS.some(
    (declaration) =>
      declaration.controller === controllerName && declaration.handler === handlerName,
  );
}
