import type { NegativeExpectation } from './verdict-policy';

/**
 * F1 (#269 / R11 ön işi) — negatif matris KATALOĞU.
 *
 * R11'de çalıştırılacak negatif senaryolar burada listelenir; çalıştırma
 * iskeleti (`journey-runner`) her senaryoyu ya gerçek executor'ıyla koşar ya
 * da `NOT_IMPLEMENTED` olarak raporlar. Sınıflandırma kararı burada DEĞİL,
 * `verdict-policy.classifyNegativeOutcome` içinde verilir; böylece
 * "env unreachable / 404 / skip / neutral / cancelled = PASS değil" kuralı
 * tek noktadan, test edilebilir biçimde uygulanır.
 */

export type NegativeCategory =
  | 'unauthorized'
  | 'forbidden'
  | 'cross-tenant'
  | 'stale'
  | 'session-expiry'
  | 'expired'
  | 'offline'
  | 'invalid-input';

export type NegativeScenario = Readonly<{
  id: string;
  category: NegativeCategory;
  title: string;
  /** Beklenen durum; sınıflandırıcı bu sözleşmeye göre karar verir. */
  expectation: NegativeExpectation;
  /** Senaryoyu çalıştıran executor kimliği; `null` ise NOT_IMPLEMENTED. */
  executorId: string | null;
  /** Senaryoyu açan dilim(ler) (executor yoksa zorunlu gerekçe). */
  pendingSlices: ReadonlyArray<string>;
}>;

/**
 * Ortak "sızıntı yok" sözleşmesi: gövdede ham backend detayı, başka kiracının
 * kimliği veya PII görünmemelidir.
 */
const NO_ENTITY_LEAK: ReadonlyArray<string> = Object.freeze([
  'QueryFailedError',
  'Invalid credentials',
  'credential_hash',
  'SELECT ',
]);

export const NEGATIVE_SCENARIOS: ReadonlyArray<NegativeScenario> = Object.freeze([
  {
    id: 'unauthorized-no-session',
    category: 'unauthorized',
    title: 'Oturum yokken korumalı işlem yapılamaz',
    expectation: {
      statuses: [401],
      acceptsNotFoundAsDenial: false,
      bodyMustNotContain: NO_ENTITY_LEAK,
      uiTone: 'danger',
    },
    // Bu senaryo bugünkü kabukla çalıştırılabilir (fail-safe durum kanıtı).
    executorId: 'unauthorized-no-session',
    pendingSlices: [],
  },
  {
    id: 'forbidden-role-scope',
    category: 'forbidden',
    title: 'Öğretmen rolü operasyon işlemini yapamaz (403)',
    expectation: {
      statuses: [403],
      acceptsNotFoundAsDenial: true,
      bodyMustNotContain: NO_ENTITY_LEAK,
      uiTone: 'danger',
    },
    executorId: null,
    pendingSlices: ['#339 / R4 (server-authoritative rol bağlamı + default-deny)'],
  },
  {
    id: 'cross-tenant-branch',
    category: 'cross-tenant',
    title: 'Başka kurumun/şubesinin verisine erişim reddedilir (non-enumerating)',
    expectation: {
      statuses: [403, 404],
      acceptsNotFoundAsDenial: true,
      bodyMustNotContain: NO_ENTITY_LEAK,
    },
    executorId: null,
    pendingSlices: ['#339 / R4 (kurum/şube bağlamı) + R11 canary'],
  },
  {
    id: 'stale-if-match-clear',
    category: 'stale',
    title: 'Eskimiş If-Match ile görevlendirme temizliği 409 döner',
    expectation: {
      statuses: [409],
      acceptsNotFoundAsDenial: false,
      bodyMustNotContain: NO_ENTITY_LEAK,
    },
    executorId: null,
    pendingSlices: ['#263 / R3 (koşullu mutasyon + If-Match) ve jetondan ikinci oturum'],
  },
  {
    id: 'session-expiry-after-logout',
    category: 'session-expiry',
    title: 'Oturum kapatıldıktan sonra işlem fail-closed biter',
    expectation: {
      statuses: [401],
      acceptsNotFoundAsDenial: false,
      bodyMustNotContain: NO_ENTITY_LEAK,
      uiTone: 'danger',
    },
    executorId: null,
    pendingSlices: ['R11 (oturum ömrü provası) — bugünkü kabukta açık kontrol yok'],
  },
  {
    id: 'expired-access-token',
    category: 'expired',
    title: 'Süresi geçmiş erişim jetonu reddedilir',
    expectation: {
      statuses: [401],
      acceptsNotFoundAsDenial: false,
      bodyMustNotContain: NO_ENTITY_LEAK,
    },
    executorId: null,
    pendingSlices: ['R11 — sahte/süresi geçmiş jeton ancak UI dışı kurulumla üretilebilir (ürün kararı)'],
  },
  {
    id: 'offline-request',
    category: 'offline',
    title: 'Ağ yokken UI açık hata gösterir, sahte başarı üretmez',
    expectation: {
      statuses: [0],
      acceptsNotFoundAsDenial: false,
      bodyMustNotContain: NO_ENTITY_LEAK,
      uiTone: 'danger',
    },
    executorId: null,
    pendingSlices: ['R11 (istek kesme/offline provası; harness yeteneği eklenecek)'],
  },
  {
    id: 'invalid-leave-window',
    category: 'invalid-input',
    title: 'Geçersiz izin aralığı doğrulama hatasıyla reddedilir',
    expectation: {
      statuses: [400, 422],
      acceptsNotFoundAsDenial: false,
      bodyMustNotContain: NO_ENTITY_LEAK,
    },
    executorId: null,
    pendingSlices: ['#263 (izin penceresi doğrulaması)'],
  },
]);

export const NEGATIVE_SCENARIO_IDS: ReadonlyArray<string> = Object.freeze(
  NEGATIVE_SCENARIOS.map((scenario) => scenario.id),
);

/** Katalog tutarlılığı: kimlik tekliği + executor varsa bekçi dilimi yok. */
export function assertNegativeMatrixShape(): void {
  const seen = new Set<string>();
  for (const scenario of NEGATIVE_SCENARIOS) {
    if (seen.has(scenario.id)) throw new Error(`Duplicate negative scenario id '${scenario.id}'.`);
    seen.add(scenario.id);
    if (scenario.expectation.statuses.length === 0) {
      throw new Error(`Negative scenario '${scenario.id}' declares no expected status.`);
    }
    if (scenario.executorId === null && scenario.pendingSlices.length === 0) {
      throw new Error(
        `Negative scenario '${scenario.id}' has no executor and no pending slice; that would be a silent skip.`,
      );
    }
  }
}
