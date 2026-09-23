/**
 * F1 (#269 / R10–R11 ön işi) — kabul VERDICT politikası (fail-closed).
 *
 * Tek doğruluk kaynağı: bir kabul adımı ya da negatif senaryo yalnız
 * `PASS | FAIL | NOT_IMPLEMENTED | BLOCKED` verdict'lerinden birini alabilir.
 * `SKIP` diye bir verdict YOKTUR; ham girdi olarak gelse bile (jest `skip`,
 * CI `neutral`, iptal edilmiş koşu) normalize edilirken **PASS olmayan** bir
 * değere düşer.
 *
 * Bu modül bilinçli olarak saf (fs/tarayıcı/DB bağımlılığı yok) tutulur:
 * hem gerçek harness (`test/e2e/`), hem statik guard
 * (`test/acceptance-guard/`) aynı kuralları çalıştırır.
 *
 * Faz 1b kuralı (master-prompt §10.4): "env unreachable / 404 / skip /
 * neutral / cancelled PASS değildir."
 */

export class EvidencePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidencePolicyError';
  }
}

/** İzinli verdict kümesi. Genişletmek serbesttir; DARALTMAK yasaktır. */
export type EvidenceVerdict = 'PASS' | 'FAIL' | 'NOT_IMPLEMENTED' | 'BLOCKED';

export const EVIDENCE_VERDICTS: ReadonlyArray<EvidenceVerdict> = Object.freeze([
  'PASS',
  'FAIL',
  'NOT_IMPLEMENTED',
  'BLOCKED',
]);

/** PASS dışındaki tüm verdict'ler; hiçbiri kabul kanıtı sayılmaz. */
export const NON_PASS_VERDICTS: ReadonlyArray<EvidenceVerdict> = Object.freeze([
  'FAIL',
  'NOT_IMPLEMENTED',
  'BLOCKED',
]);

/**
 * Ham/legacy etiketler ve normalize karşılıkları. Hiçbir karşılık `PASS`
 * DEĞİLDİR: "henüz yok", "atlandı", "belirsiz" ve "ulaşılamadı" durumlarının
 * hepsi kanıt üretmez.
 */
export const RAW_VERDICT_ALIASES: Readonly<Record<string, EvidenceVerdict>> = Object.freeze({
  pass: 'PASS',
  fail: 'FAIL',
  'not-implemented': 'NOT_IMPLEMENTED',
  not_implemented: 'NOT_IMPLEMENTED',
  notimplemented: 'NOT_IMPLEMENTED',
  unimplemented: 'NOT_IMPLEMENTED',
  'not-applicable': 'NOT_IMPLEMENTED',
  skip: 'NOT_IMPLEMENTED',
  skipped: 'NOT_IMPLEMENTED',
  pending: 'NOT_IMPLEMENTED',
  todo: 'NOT_IMPLEMENTED',
  neutral: 'NOT_IMPLEMENTED',
  cancelled: 'NOT_IMPLEMENTED',
  canceled: 'NOT_IMPLEMENTED',
  aborted: 'NOT_IMPLEMENTED',
  blocked: 'BLOCKED',
  unknown: 'BLOCKED',
  unreachable: 'BLOCKED',
  'env-unreachable': 'BLOCKED',
  'harness-error': 'BLOCKED',
  timeout: 'BLOCKED',
});

/**
 * Fail-closed normalize: tanınmayan her etiket `BLOCKED` olur, asla `PASS`.
 * `undefined`/boş da `BLOCKED`'dır (verdict yoksa kanıt da yoktur).
 */
export function normalizeVerdict(raw: unknown): EvidenceVerdict {
  if (typeof raw !== 'string') return 'BLOCKED';
  const key = raw.trim().toLowerCase().replace(/\s+/g, '-');
  const mapped = RAW_VERDICT_ALIASES[key];
  if (mapped !== undefined) return mapped;
  const upper = key.toUpperCase().replace(/-/g, '_');
  return (EVIDENCE_VERDICTS as ReadonlyArray<string>).includes(upper)
    ? (upper as EvidenceVerdict)
    : 'BLOCKED';
}

export function isPass(verdict: unknown): boolean {
  return normalizeVerdict(verdict) === 'PASS';
}
/**
 * Bir kabul adımının/senaryosunun kanıt kaydı.
 *
 * `PASS` iddiası serbest değildir: adımı gerçekten çalıştıran bir executor
 * (`executedBy`) ve boş olmayan kanıt satırları (`evidence`) zorunludur.
 * Aksi hâlde verdict `PASS` olarak RAPORLANAMAZ.
 */
export type StepEvidence = Readonly<{
  stepId: string;
  verdict: EvidenceVerdict;
  /** Adımı çalıştıran executor kimliği; NOT_IMPLEMENTED için `null`. */
  executedBy: string | null;
  /** PASS için zorunlu ve boş olamaz; aksi hâlde kanıt yoktur. */
  evidence: ReadonlyArray<string>;
  /** İnsan-okur gerekçe (TR). Boş olamaz. */
  detail: string;
}>;

/** Kanıt metinlerinin şişmesini engelleyen üst sınır. */
const MAX_EVIDENCE_ENTRIES = 24;

/**
 * Sahte PASS'ı engeller: `PASS` yalnız gerçek bir yürütücü + kanıt varsa
 * geçerlidir. İhlal `EvidencePolicyError` fırlatır (sessiz geçiş yok).
 */
export function assertPassProvenance(entry: StepEvidence): void {
  const verdict = normalizeVerdict(entry.verdict);
  if (entry.stepId.trim().length === 0) {
    throw new EvidencePolicyError('Evidence entry is missing a stepId.');
  }
  if (entry.detail.trim().length === 0) {
    throw new EvidencePolicyError(`Evidence entry '${entry.stepId}' is missing a detail string.`);
  }
  if (entry.evidence.length > MAX_EVIDENCE_ENTRIES) {
    throw new EvidencePolicyError(
      `Evidence entry '${entry.stepId}' carries ${entry.evidence.length} evidence lines (max ${MAX_EVIDENCE_ENTRIES}).`,
    );
  }
  if (verdict !== 'PASS') return;

  if (entry.executedBy === null || entry.executedBy.trim().length === 0) {
    throw new EvidencePolicyError(
      `Step '${entry.stepId}' claims PASS without an executor; fabricated PASS is not acceptance evidence.`,
    );
  }
  const usable = entry.evidence.filter((line) => line.trim().length > 0);
  if (usable.length === 0) {
    throw new EvidencePolicyError(
      `Step '${entry.stepId}' claims PASS with no evidence lines; fabricated PASS is not acceptance evidence.`,
    );
  }
}

export type JourneySummary = Readonly<{
  verdict: EvidenceVerdict;
  allPass: boolean;
  passCount: number;
  totalCount: number;
  /** PASS olmayan adımların kimlikleri (rapor bunu açıkça listeler). */
  unresolvedStepIds: ReadonlyArray<string>;
}>;

/**
 * Toplam verdict: tek bir PASS-olmayan adım bile nihai verdict'i PASS
 * olmaktan çıkarır (fail-closed toplama).
 */
export function summarizeJourney(entries: ReadonlyArray<StepEvidence>): JourneySummary {
  const normalized = entries.map((entry) => ({
    stepId: entry.stepId,
    verdict: normalizeVerdict(entry.verdict),
  }));
  const unresolvedStepIds = normalized
    .filter((entry) => entry.verdict !== 'PASS')
    .map((entry) => entry.stepId);
  const passCount = normalized.filter((entry) => entry.verdict === 'PASS').length;

  let verdict: EvidenceVerdict = 'PASS';
  if (normalized.length === 0) verdict = 'BLOCKED';
  else if (normalized.some((entry) => entry.verdict === 'FAIL')) verdict = 'FAIL';
  else if (normalized.some((entry) => entry.verdict === 'BLOCKED')) verdict = 'BLOCKED';
  else if (normalized.some((entry) => entry.verdict === 'NOT_IMPLEMENTED')) {
    verdict = 'NOT_IMPLEMENTED';
  }

  return Object.freeze({
    verdict,
    allPass: verdict === 'PASS',
    passCount,
    totalCount: normalized.length,
    unresolvedStepIds: Object.freeze(unresolvedStepIds),
  });
}



/* ------------------------------------------------------------------ */
/* Negatif matris politikası (R11 ön işi)                              */
/* ------------------------------------------------------------------ */

/**
 * Negatif senaryo için GÖZLENEN sonuç. `transport !== 'response'` (env
 * unreachable/timeout/engellendi) ve `outcomeKind !== 'observed'` (skip/
 * neutral/cancelled) hiçbir durumda PASS'a dönüşemez.
 */
export type NegativeObservation = Readonly<{
  transport: 'response' | 'unreachable' | 'timeout' | 'blocked-by-harness';
  /** HTTP durum kodu; `transport !== 'response'` ise 0. */
  status: number;
  bodyText: string;
  /** Nest'in kendi "rota yok" 404 imzası mı (yani senaryo yüzeyi hiç yok)? */
  routeMissingSignature: boolean;
  outcomeKind: 'observed' | 'skip' | 'neutral' | 'cancelled';
  uiTone?: string | null;
}>;

export type NegativeExpectation = Readonly<{
  statuses: ReadonlyArray<number>;
  /**
   * 404'ün meşru bir yetki reddi sayılabilmesi için yanıtın uygulama-şekilli
   * ve non-enumerating olması şartı. `false` iken 404 PASS değildir.
   */
  acceptsNotFoundAsDenial: boolean;
  /** Gövdede görünmemesi gereken desenler (varlık/kişi sızıntısı). */
  bodyMustNotContain: ReadonlyArray<string>;
  uiTone?: string;
}>;

export type NegativeOutcome = Readonly<{
  verdict: EvidenceVerdict;
  reasons: ReadonlyArray<string>;
}>;

/**
 * Negatif sonucu sınıflandırır. Kurallar fail-closed uygulanır: tek bir ihlal
 * verdict'i PASS olmaktan çıkarır ve gerekçesi listelenir.
 */
export function classifyNegativeOutcome(
  expectation: NegativeExpectation,
  observation: NegativeObservation,
): NegativeOutcome {
  const reasons: string[] = [];

  if (observation.outcomeKind !== 'observed') {
    reasons.push(`outcome-kind:${observation.outcomeKind}-is-not-pass`);
  }
  if (observation.transport !== 'response') {
    reasons.push(`transport:${observation.transport}-is-not-pass`);
  }
  if (observation.routeMissingSignature) {
    reasons.push('route-missing-signature-is-not-pass');
  }
  if (!expectation.statuses.includes(observation.status)) {
    reasons.push(
      `unexpected-status:${observation.status}-not-in[${expectation.statuses.join(',')}]`,
    );
  }
  if (observation.status === 404 && !expectation.acceptsNotFoundAsDenial) {
    reasons.push('404-is-not-accepted-as-denial-for-this-scenario');
  }
  for (const forbidden of expectation.bodyMustNotContain) {
    if (forbidden.length > 0 && observation.bodyText.includes(forbidden)) {
      reasons.push(`body-leaked:${forbidden}`);
    }
  }
  if (expectation.uiTone !== undefined && observation.uiTone !== expectation.uiTone) {
    reasons.push(`ui-tone:${String(observation.uiTone)}-expected:${expectation.uiTone}`);
  }

  return Object.freeze({
    verdict: reasons.length === 0 ? 'PASS' : 'FAIL',
    reasons: Object.freeze(reasons),
  });
}

/**
 * Ham CI/test etiketleri. Guard bu etiketlerin verdict olarak
 * kullanılmamasını tarar; "yeşil görünme" yolları isim isim yasaklıdır.
 */
export const NON_PASS_OUTCOME_TOKENS: ReadonlyArray<string> = Object.freeze([
  'SKIP',
  'SKIPPED',
  'NEUTRAL',
  'CANCELLED',
  'PENDING',
  'UNKNOWN',
]);

/** Kanıt metninden secret/PII taşıma riski olan parçaları kaldırır. */
export function redactEvidenceText(input: unknown): string {
  const value = typeof input === 'string' ? input : String(input);
  return value
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, 'postgres://<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, 'Bearer <redacted>')
    .replace(/eyJ[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{4,}\.[A-Za-z0-9._-]{2,}/g, '<jwt-redacted>')
    .replace(/(credential_hash|password|secret|token)\s*[=:]\s*\S+/gi, '$1=<redacted>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email-redacted>')
    .slice(0, 600);
}
