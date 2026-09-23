import type { EvidenceVerdict } from './verdict-policy';
import {
  JOURNEY_OUTCOME_TABLES,
  assertJourneyOutcomeMembership,
} from './acceptance-tables';

/**
 * F1 (#269 / R10 ön işi) — journey sözleşmesi.
 *
 * R10'un 7 adımı burada TEK YERDE, sıralı ve makine-okur biçimde tanımlanır.
 * Amaç: bir adımın "geçti/atlandı/belirsiz" durumunu yorumlamaya bırakmamak.
 * Her adımın ya gerçek bir executor'ı vardır (`executorId`) ya da
 * `NOT_IMPLEMENTED`'dır ve bunu açan dilim(ler) yazılıdır. `SKIP` diye bir
 * durum YOKTUR (bkz. `verdict-policy`).
 *
 * `uiSurface.selectors` adımın KABUL EDİLDİĞİ görünür UI sözleşmesidir;
 * harness yalnız bu seçiciler üzerinden yazar/tıklar. Adımın yüzeyi henüz
 * yoksa `pendingSlices` hangi dilimin açacağını söyler.
 */

export const JOURNEY_STEP_IDS = Object.freeze([
  'schedule-publish',
  'leave-request',
  'manager-approval',
  'impact-candidates',
  'candidate-assign-clear',
  'attendance-lock',
  'notification-draft',
] as const);

export type JourneyStepId = (typeof JOURNEY_STEP_IDS)[number];

export type JourneyStepDefinition = Readonly<{
  id: JourneyStepId;
  /** R10 brief'indeki 1..7 sırası; rapor bunu doğrular. */
  order: number;
  title: string;
  /** Adımın görünür UI yüzeyi (rota + zorunlu seçiciler). */
  uiSurface: Readonly<{ route: string; selectors: ReadonlyArray<string> }>;
  /** Adımı açan dilim(ler). Boş dizi = bugün çalıştırılabilir. */
  pendingSlices: ReadonlyArray<string>;
  /** Adımın ürettiği iş sonucu tabloları; SQL ile ÜRETİLEMEZ. */
  outcomeTables: ReadonlyArray<string>;
}>;

/**
 * Adımın beklediği iş sonucu tablolarının KAYNAĞI kanonik sözleşmedir
 * (`JOURNEY_OUTCOME_TABLES`). Böylece adım tanımları `JOB_OUTCOME_TABLES`'ın
 * elle tutulan ikinci bir kopyasını taşımaz ve sessizce ayrışamaz.
 */
function outcomeTablesFor(stepId: JourneyStepId): ReadonlyArray<string> {
  const tables = JOURNEY_OUTCOME_TABLES[stepId];
  if (tables === undefined) {
    throw new Error(`Journey step '${stepId}' has no entry in JOURNEY_OUTCOME_TABLES.`);
  }
  assertJourneyOutcomeMembership(`Journey step '${stepId}'`, tables);
  return tables;
}

/**
 * Adım yürütücüsünün döndürdüğü gözlem. `evidence` boş ve verdict PASS ise
 * `assertPassProvenance` sahte PASS'ı reddeder.
 */
export type JourneyStepObservation = Readonly<{
  verdict: EvidenceVerdict;
  evidence: ReadonlyArray<string>;
  detail: string;
}>;

export const JOURNEY_STEPS: ReadonlyArray<JourneyStepDefinition> = Object.freeze([
  {
    id: 'schedule-publish',
    order: 1,
    title: 'Program taslağı → yayınla (UI)',
    uiSurface: { route: '/runtime/', selectors: ['#schedule-draft-action', '#schedule-publish'] },
    pendingSlices: ['R10 (program yayın UI yüzeyi; #269)'],
    outcomeTables: outcomeTablesFor('schedule-publish'),
  },
  {
    id: 'leave-request',
    order: 2,
    title: 'Öğretmen izin talebi (UI form)',
    uiSurface: { route: '/runtime/', selectors: ['#leave-form', '#teacher-output'] },
    pendingSlices: ['#263 / R1–R3 (izin karar + impact kapısı)'],
    outcomeTables: outcomeTablesFor('leave-request'),
  },
  {
    id: 'manager-approval',
    order: 3,
    title: 'Yönetici onayı + impact görünürlüğü (UI)',
    uiSurface: { route: '/runtime/', selectors: ['#decision-heading', '#impact-output'] },
    pendingSlices: ['#263 / R1–R3 (onay/red state machine, impact analizi)'],
    outcomeTables: outcomeTablesFor('manager-approval'),
  },
  {
    id: 'impact-candidates',
    order: 4,
    title: 'Etki listesi + aday listesi (sunucu çıktısı)',
    uiSurface: { route: '/runtime/', selectors: ['#queue-output', '#selected-lesson-context'] },
    pendingSlices: ['#263 / R2 (impact projeksiyonu + aday listesi)'],
    outcomeTables: outcomeTablesFor('impact-candidates'),
  },
  {
    id: 'candidate-assign-clear',
    order: 5,
    title: 'Aday görevlendir → temizle (If-Match)',
    uiSurface: { route: '/runtime/', selectors: ['#candidate-output'] },
    pendingSlices: ['#263 / R3 (koşullu görevlendirme + If-Match)'],
    outcomeTables: outcomeTablesFor('candidate-assign-clear'),
  },
  {
    id: 'attendance-lock',
    order: 6,
    title: 'Yoklama gönder → kilitle (UI)',
    uiSurface: { route: '/runtime/', selectors: ['#attendance-form', '#attendance-lock-action'] },
    pendingSlices: ['R10 (yoklama UI yüzeyi); #265 lifecycle hazır olanı kapsar'],
    outcomeTables: outcomeTablesFor('attendance-lock'),
  },
  {
    id: 'notification-draft',
    order: 7,
    title: 'Bildirim taslağını görüntüle (maskeli)',
    uiSurface: { route: '/runtime/', selectors: ['#notification-draft-output'] },
    pendingSlices: ['#266 / R5–R7 (consent + outbox + taslak görünümü)'],
    outcomeTables: outcomeTablesFor('notification-draft'),
  },
]);

/** Adım sırası ve kimlikleri R10 brief'iyle birebir olmalıdır. */
export function assertJourneyContractShape(): void {
  const orders = JOURNEY_STEPS.map((step) => step.order);
  const expected = JOURNEY_STEP_IDS.map((_, index) => index + 1);
  if (orders.join(',') !== expected.join(',')) {
    throw new Error(
      `Journey step order drifted: [${orders.join(',')}] (expected [${expected.join(',')}]).`,
    );
  }
  if (JOURNEY_STEPS.length !== JOURNEY_STEP_IDS.length) {
    throw new Error('Journey step count drifted from JOURNEY_STEP_IDS.');
  }
  for (const step of JOURNEY_STEPS) {
    if (step.uiSurface.selectors.length === 0) {
      throw new Error(`Journey step '${step.id}' declares no UI selectors.`);
    }
    if (step.outcomeTables.length === 0) {
      throw new Error(`Journey step '${step.id}' declares no outcome table.`);
    }
    assertJourneyOutcomeMembership(`Journey step '${step.id}'`, step.outcomeTables);
  }

  // Tablo sözleşmesi ile adım kimlikleri BİREBİR eşleşmelidir: ne eksik ne fazla.
  const declaredIds = Object.keys(JOURNEY_OUTCOME_TABLES).sort();
  const stepIds = [...JOURNEY_STEP_IDS].sort();
  if (declaredIds.join(',') !== stepIds.join(',')) {
    throw new Error(
      `JOURNEY_OUTCOME_TABLES keys [${declaredIds.join(',')}] do not match journey step ids ` +
        `[${stepIds.join(',')}].`,
    );
  }
}

/**
 * Executor kaydı. F1'de BOŞTUR: hiçbir adım uygulanmadığı için adımların
 * tamamı dürüst biçimde `NOT_IMPLEMENTED` raporlanır. R10 dilimleri geldikçe
 * yalnız bu tabloya executor eklenir; adım tanımı ve verdict kuralları
 * değişmez.
 */
export type JourneyExecutor = (
  context: unknown,
) => Promise<JourneyStepObservation> | JourneyStepObservation;

export type JourneyExecutorRegistry = Readonly<Record<string, JourneyExecutor>>;

export const F1_JOURNEY_EXECUTORS: JourneyExecutorRegistry = Object.freeze({});

export function resolveStepExecutor(
  step: JourneyStepDefinition,
  registry: JourneyExecutorRegistry,
): JourneyExecutor | undefined {
  return registry[step.id];
}
