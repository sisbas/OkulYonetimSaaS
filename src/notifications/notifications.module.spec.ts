import 'reflect-metadata';

import { TRANSACTIONAL_AUDIT_WRITER } from '../common/audit/transactional-audit-writer';
import { NotificationsModule } from './notifications.module';

type ProviderEntry =
  | Function
  | { provide: unknown; useExisting?: unknown; useClass?: unknown; useValue?: unknown };

function providersOf(moduleType: object): ProviderEntry[] {
  return (Reflect.getMetadata('providers', moduleType) as ProviderEntry[] | undefined) ?? [];
}

/**
 * #266 R5 — Modül kablolama sözleşmesi.
 *
 * `TypeOrmTransactionalAuditWriter` constructor'ında `AuditLogRepository` ister;
 * sağlayıcı kayıtlı değilse hata DI çözümlemesinde (uygulama BOOT'unda) ortaya
 * çıkar ve unit testler bunu yakalamaz. Bu test, sözleşmeyi statik olarak
 * sabitler (attendance/leaves modülleriyle aynı desen).
 */
describe('NotificationsModule wiring (#266 R5)', () => {
  it('registers the transactional audit writer with its repository dependency', () => {
    const providers = providersOf(NotificationsModule);
    const tokenNames = providers.map((provider) => {
      if (typeof provider === 'function') return provider.name;
      if (provider && typeof provider === 'object' && 'provide' in provider) {
        const token = (provider as { provide: unknown }).provide;
        return typeof token === 'function' ? token.name : String(token);
      }
      return 'unknown';
    });

    expect(tokenNames).toContain('AuditLogRepository');
    expect(tokenNames).toContain('TypeOrmTransactionalAuditWriter');
    expect(tokenNames).toContain(String(TRANSACTIONAL_AUDIT_WRITER));
  });

  it('registers the consent surface, its service and the outbox port', () => {
    const providers = providersOf(NotificationsModule).map((provider) =>
      typeof provider === 'function' ? provider.name : 'object',
    );

    expect(providers).toContain('ConsentLifecycleService');
    expect(providers).toContain('NotificationOutboxRepository');
  });

  it('declares the consent controller', () => {
    const controllers = Reflect.getMetadata('controllers', NotificationsModule) as
      | Array<{ name: string }>
      | undefined;

    expect((controllers ?? []).map((controller) => controller.name)).toEqual([
      'NotificationConsentController',
    ]);
  });
});
