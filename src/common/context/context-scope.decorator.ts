import { SetMetadata } from '@nestjs/common';

/**
 * Handler'ın "oturum bağlamı" (self-scope) erişim sınıfını bildirir (#339 R4).
 *
 * Bu dekoratörü taşıyan route iş kaynağı izni (`@Permissions`) gerektirmez;
 * yalnızca kimliği doğrulanmış + sunucudan çözülmüş bağlam gerektirir ve
 * SADECE çağıranın kendi erişebildiği kayıtları döndürebilir. Default-deny
 * gereği bu işaret (ya da `@Permissions`) YOKSA route kapalıdır.
 */
export const CONTEXT_SCOPE_KEY = 'security_context_scope';

export const ContextScoped = () => SetMetadata(CONTEXT_SCOPE_KEY, true);
