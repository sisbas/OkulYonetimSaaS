import type { UiSession } from './browser';
import type { E2eEnvironment } from './env';
import type { ReferenceFixture } from './reference-fixtures';
import {
  JOURNEY_STEPS,
  resolveStepExecutor,
  type JourneyExecutorRegistry,
  type JourneyStepDefinition,
} from './journey-contract';
import { NEGATIVE_SCENARIOS, type NegativeScenario } from './negative-matrix';
import {
  assertPassProvenance,
  classifyNegativeOutcome,
  normalizeVerdict,
  redactEvidenceText,
  type EvidenceVerdict,
  type NegativeObservation,
  type StepEvidence,
} from './verdict-policy';

/**
 * F1 (#269 / R10–R11 ön işi) — journey + negatif matris ÇALIŞTIRMA iskeleti.
 *
 * Sözleşme:
 * - Executor'ı olmayan adım `NOT_IMPLEMENTED` raporlanır; `SKIP` üretilmez ve
 *   atlanan adım PASS sayılmaz. Hangi dilimin açacağı gerekçeye yazılır.
 * - Executor `PASS` iddia ediyorsa kanıt + yürütücü zorunludur
 *   (`assertPassProvenance`); ihlal sessizce geçmez, `FAIL`'e indirilir.
 * - Executor hatası `FAIL`'dir ve mesaj redakte edilerek yazılır (secret/PII
 *   artefakta taşınmaz).
 *
 * Bu modül yalnızca TİP importu yapar (tarayıcı/DB yüklemez); böylece statik
 * guard spec'i aynı iskeleti gerçek ürün yüzeyi olmadan test edebilir.
 */

export type JourneySurface = Readonly<{
  session: UiSession;
  fixture: ReferenceFixture;
  environment: E2eEnvironment;
  screenshots: string[];
  artifactDir: string;
}>;

export type SurfaceProbe = Readonly<{ stepId: string; selector: string; present: boolean }>;

function buildEvidence(input: Readonly<{
  stepId: string;
  executedBy: string | null;
  verdict: EvidenceVerdict;
  evidence: ReadonlyArray<string>;
  detail: string;
}>): StepEvidence {
  const entry: StepEvidence = Object.freeze({
    stepId: input.stepId,
    verdict: normalizeVerdict(input.verdict),
    executedBy: input.executedBy,
    evidence: Object.freeze(input.evidence.map((line) => redactEvidenceText(line))),
    detail: redactEvidenceText(input.detail),
  });

  try {
    assertPassProvenance(entry);
    return entry;
  } catch (error) {
    // Sahte PASS (yürütücüsüz ya da kanıtsız) sessizce geçemez: verdict FAIL'e
    // indirilir ve gerekçe kanıt satırı olarak kaydedilir.
    const reason = error instanceof Error ? error.message : String(error);
    return Object.freeze({
      stepId: input.stepId,
      verdict: 'FAIL',
      executedBy: input.executedBy,
      evidence: Object.freeze([`policy-violation:${redactEvidenceText(reason)}`]),
      detail: 'PASS iddiası kanıt sözleşmesini karşılamadı (fail-closed).',
    });
  }
}

function pendingDetail(reason: string, pendingSlices: ReadonlyArray<string>): string {
  const slices = pendingSlices.join(' · ');
  return `${reason} (non-PASS). Açacak dilim(ler): ${slices.length > 0 ? slices : 'tanımsız'}.`;
}

/**
 * R10 adımlarını sırayla yürütür. Executor yoksa adım dürüstçe
 * `NOT_IMPLEMENTED` olur; hiçbir adım sessizce atlanmaz.
 */
export async function runJourneySteps(
  surface: JourneySurface,
  registry: JourneyExecutorRegistry,
): Promise<ReadonlyArray<StepEvidence>> {
  const entries: StepEvidence[] = [];

  for (const step of JOURNEY_STEPS as ReadonlyArray<JourneyStepDefinition>) {
    const executor = resolveStepExecutor(step, registry);
    if (executor === undefined) {
      entries.push(
        buildEvidence({
          stepId: step.id,
          executedBy: null,
          verdict: 'NOT_IMPLEMENTED',
          evidence: [],
          detail: pendingDetail(`"${step.title}" adımı uygulanmadı`, step.pendingSlices),
        }),
      );
      continue;
    }

    try {
      const observation = await executor(surface);
      entries.push(
        buildEvidence({
          stepId: step.id,
          executedBy: `journey:${step.id}`,
          verdict: observation.verdict,
          evidence: observation.evidence,
          detail: observation.detail,
        }),
      );
    } catch (error) {
      entries.push(
        buildEvidence({
          stepId: step.id,
          executedBy: `journey:${step.id}`,
          verdict: 'FAIL',
          evidence: [],
          detail: `Executor hata verdi: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
  }

  return Object.freeze(entries);
}

/**
 * Adım yüzeylerinin kabukta var olup olmadığını ölçer. Bu çıktı
 * BİLGİLENDİRİCİDİR: bir seçicinin varlığı adımı PASS yapmaz (kanıt yalnız
 * executor'dan gelir).
 */
export async function probeJourneySurfaces(
  session: UiSession,
): Promise<ReadonlyArray<SurfaceProbe>> {
  const probes: SurfaceProbe[] = [];
  for (const step of JOURNEY_STEPS) {
    for (const selector of step.uiSurface.selectors) {
      let present = false;
      try {
        present = await session.exists(selector);
      } catch {
        present = false;
      }
      probes.push(Object.freeze({ stepId: step.id, selector, present }));
    }
  }
  return Object.freeze(probes);
}

export type NegativeExecutorResult = Readonly<{
  observation: NegativeObservation;
  evidence: ReadonlyArray<string>;
}>;

export type NegativeExecutor = (
  surface: JourneySurface,
  scenario: NegativeScenario,
) => Promise<NegativeExecutorResult>;

/**
 * Negatif matrisi çalıştırır. Sınıflandırma kararı
 * `classifyNegativeOutcome`'dadır; runner yalnız kaydı üretir. Executor'ı
 * olmayan senaryo `NOT_IMPLEMENTED`'dır ve PASS sayılmaz.
 */
export async function runNegativeMatrix(
  surface: JourneySurface,
  registry: Readonly<Record<string, NegativeExecutor>>,
): Promise<ReadonlyArray<StepEvidence>> {
  const entries: StepEvidence[] = [];

  for (const scenario of NEGATIVE_SCENARIOS) {
    const executor = registry[scenario.id];
    if (executor === undefined) {
      entries.push(
        buildEvidence({
          stepId: scenario.id,
          executedBy: null,
          verdict: 'NOT_IMPLEMENTED',
          evidence: [],
          detail: pendingDetail(
            `"${scenario.title}" senaryosu çalıştırılmadı`,
            scenario.pendingSlices,
          ),
        }),
      );
      continue;
    }

    try {
      const result = await executor(surface, scenario);
      const outcome = classifyNegativeOutcome(scenario.expectation, result.observation);
      entries.push(
        buildEvidence({
          stepId: scenario.id,
          executedBy: `negative:${scenario.id}`,
          verdict: outcome.verdict,
          evidence: [
            ...result.evidence,
            `transport:${result.observation.transport}`,
            `status:${result.observation.status}`,
            `classification:${outcome.verdict}`,
            `reasons:${outcome.reasons.length > 0 ? outcome.reasons.join('|') : 'none'}`,
          ],
          detail:
            outcome.verdict === 'PASS'
              ? `Beklenen negatif davranış gözlendi (${scenario.expectation.statuses.join('/')}).`
              : `Negatif senaryo beklenen davranışı göstermedi: ${outcome.reasons.join(', ')}.`,
        }),
      );
    } catch (error) {
      entries.push(
        buildEvidence({
          stepId: scenario.id,
          executedBy: `negative:${scenario.id}`,
          verdict: 'FAIL',
          evidence: [],
          detail: `Senaryo çalıştırılamadı: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }),
      );
    }
  }

  return Object.freeze(entries);
}
