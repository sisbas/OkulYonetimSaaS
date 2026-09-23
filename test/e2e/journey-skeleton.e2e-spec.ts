import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Browser } from 'puppeteer-core';
import { createUiSession, launchE2eBrowser, type UiSession } from './support/browser';
import { scanArtifactDirectory } from './support/artifact-scan';
import {
  ARTIFACT_MANIFEST_FILE,
  verifyArtifactManifest,
  writeArtifactManifest,
} from './support/artifact-manifest';
import {
  readE2eEnvironment,
  resolveSecondaryRuntimeTarget,
  type E2eEnvironment,
} from './support/env';
import { createPgClient, type PgClient } from './support/pg-client';
import {
  describeFixtureError,
  seedReferenceFixtures,
  type ReferenceFixture,
} from './support/reference-fixtures';
import { startRuntimeServer, type RuntimeServer } from './support/runtime-server';
import {
  F1_JOURNEY_EXECUTORS,
  JOURNEY_STEP_IDS,
  JOURNEY_STEPS,
  assertJourneyContractShape,
} from './support/journey-contract';
import { NEGATIVE_SCENARIOS, assertNegativeMatrixShape } from './support/negative-matrix';
import {
  probeJourneySurfaces,
  runJourneySteps,
  runNegativeMatrix,
  type JourneySurface,
  type SurfaceProbe,
} from './support/journey-runner';
import {
  EVIDENCE_VERDICTS,
  NON_PASS_OUTCOME_TOKENS,
  normalizeVerdict,
  redactEvidenceText,
  summarizeJourney,
  type StepEvidence,
} from './support/verdict-policy';
import { JOB_OUTCOME_TABLES } from './support/acceptance-tables';

/**
 * F1 (#269, R10 ön işi) — journey + negatif matris İSKELETİ.
 *
 * Bu spec ürün adımlarını PASS ilan ETMEZ. Kanıtladığı sözleşme:
 * - R10'un 7 adımı ve R11'in negatif senaryoları tek yerden, sıralı listelenir.
 * - Fresh DB + gerçek backend (`src/main.ts`) + gerçek tarayıcı altında çalışır.
 * - Yalnız REFERANS fixture seed edilir; iş sonucu satırı **seed aşamasında**
 *   üretilmez (`jobOutcomeRowsCreated = 0`).
 * - Executor'ı olmayan adım/senaryo `NOT_IMPLEMENTED` olur; `SKIP` yoktur ve
 *   atlanan adım PASS sayılmaz (toplam verdict non-PASS).
 * - Artefaktlar exact head SHA'ya bağlanır ve PII/secret taraması bulgu=0'dır.
 *
 * R10/R11 dilimleri geldikçe YALNIZ executor kaydı eklenir; adım sözleşmesi,
 * verdict kuralları ve artefakt sözleşmesi değişmez.
 */

jest.setTimeout(300_000);

const SLICE_ID = 'A4-F1';
const NAMESPACE = 'a4f1';
const SCREENSHOT_DIR_NAME = 'screenshots';

let environment: E2eEnvironment;
let runtimeTarget: Readonly<{ baseUrl: string; port: number }>;
let fixture: ReferenceFixture;
let server: RuntimeServer | undefined;
let browser: Browser | undefined;
let session: UiSession | undefined;
let dbClient: PgClient | undefined;
const startedAt = new Date().toISOString();
const screenshots: string[] = [];
const screenshotIndex = { value: 0 };



/**
 * Okuma amaçlı sayım; tablo yoksa (42P01) `absent` sayılır. Bu sayım
 * "seed ne üretti" sorusunu yanıtlar, kanıt üretmez.
 */
async function countJobOutcomeRows(
  client: PgClient,
  tenantId: string,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of JOB_OUTCOME_TABLES) {
    try {
      const query = await client.query(
        `SELECT count(*)::int AS total FROM ${table} WHERE tenant_id = $1::uuid`,
        [tenantId],
      );
      const total = query.rows[0]?.total;
      result[table] = typeof total === 'number' ? total : -1;
    } catch (error) {
      if ((error as { code?: string }).code === '42P01') {
        result[table] = -1;
        continue;
      }
      throw error;
    }
  }
  return result;
}

function seedDeltas(): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const table of JOB_OUTCOME_TABLES) {
    const before = jobOutcomeBeforeSeed[table] ?? 0;
    const after = jobOutcomeAfterSeed[table] ?? 0;
    deltas[table] = before < 0 || after < 0 ? 0 : after - before;
  }
  return deltas;
}

/** Seed aşamasının ürettiği iş sonucu satırı sayısı (0 olmalıdır). */
function rowsCreatedBySeed(): number {
  return Object.values(seedDeltas()).reduce((total, delta) => total + delta, 0);
}

function evidenceSummary(
  entries: ReadonlyArray<StepEvidence>,
): ReturnType<typeof summarizeJourney> {
  return summarizeJourney(entries);
}

let jobOutcomeBeforeSeed: Record<string, number> = {};
let jobOutcomeAfterSeed: Record<string, number> = {};
let journeyEvidence: ReadonlyArray<StepEvidence> = [];
let negativeEvidence: ReadonlyArray<StepEvidence> = [];
let surfaceProbes: ReadonlyArray<SurfaceProbe> = [];
function writeJourneyReport(): void {
  const journey = evidenceSummary(journeyEvidence);
  const negatives = evidenceSummary(negativeEvidence);
  const report = {
    slice: SLICE_ID,
    issue: 269,
    headSha: environment.headSha,
    baseUrl: runtimeTarget.baseUrl,
    isolatedPort: runtimeTarget.port,
    startedAt,
    finishedAt: new Date().toISOString(),
    journey: {
      stepIds: JOURNEY_STEP_IDS,
      verdict: journey.verdict,
      allPass: journey.allPass,
      passCount: journey.passCount,
      unresolvedStepIds: journey.unresolvedStepIds,
      steps: journeyEvidence,
    },
    negativeMatrix: {
      scenarioIds: NEGATIVE_SCENARIOS.map((scenario) => scenario.id),
      verdict: negatives.verdict,
      unresolvedScenarioIds: negatives.unresolvedStepIds,
      scenarios: negativeEvidence,
    },
    surfaceProbes: {
      note: "Bilgilendirici: seçici varlığı adımı PASS yapmaz (kanıt executor'dan gelir).",
      probes: surfaceProbes,
    },
    referenceOnlyFixtures: {
      seededTables: fixture.seededTables,
      jobOutcomeRowsBeforeSeed: jobOutcomeBeforeSeed,
      jobOutcomeRowsAfterSeed: jobOutcomeAfterSeed,
      seedDeltas: seedDeltas(),
      jobOutcomeRowsCreated: rowsCreatedBySeed(),
    },
  };
  fs.writeFileSync(
    path.join(environment.journeyArtifactDir, 'journey-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Artefakt manifestosunu yazar ve doğrular. Doğrulama ihlal verirse spec
 * kırmızıya döner (fail-closed): eksik dosya, kapsam dışı artefakt, PII
 * bulgusu veya head uyuşmazlığı gizlenemez.
 */
function writeAndVerifyManifest(): void {
  const root = environment.journeyArtifactDir;
  const logPath = 'backend.log';
  const relativeScreenshots = screenshots.map((file) =>
    path.relative(root, path.resolve(root, file)).split('\\').join('/'),
  );

  writeArtifactManifest({
    root,
    slice: SLICE_ID,
    headSha: environment.headSha,
    roles: {
      report: { status: 'present', files: ['journey-report.json'] },
      log: { status: 'present', files: fs.existsSync(path.join(root, logPath)) ? [logPath] : [] },
      screenshot: { status: 'present', files: relativeScreenshots },
      // DB denetimi raporun içinde makine-okur bölüm olarak taşınır.
      dbAudit: { status: 'present', files: ['journey-report.json'] },
      trace: {
        status: 'pending-slice',
        reason: 'Tarayıcı trace kanıtı R11 (negatif matris + canary) diliminde açılır.',
      },
      video: {
        status: 'pending-slice',
        reason: 'Video artefaktı R11 diliminde açılır; bu iskelet yalnız ekran görüntüsü üretir.',
      },
    },
    dbAudit: { jobOutcomeRowsCreated: rowsCreatedBySeed(), perTable: jobOutcomeAfterSeed },
  });

  const violations = verifyArtifactManifest(root, { expectedHeadSha: environment.headSha });
  if (violations.length > 0) {
    throw new Error(`Artifact manifest verification failed: ${violations.join(' | ')}`);
  }
}


beforeAll(async () => {
  environment = readE2eEnvironment();
  runtimeTarget = resolveSecondaryRuntimeTarget(environment);
  fs.mkdirSync(path.join(environment.journeyArtifactDir, SCREENSHOT_DIR_NAME), { recursive: true });

  dbClient = createPgClient(environment.databaseUrl);
  await dbClient.connect();

  // Referans-fixture-only kanıtı seed ÖNCESİ/SONRASI sayımla alınır: seed
  // aşamasının iş sonucu üretmediği koşunun kendi DB denetimidir.
  const tenantRow = await dbClient.query(`SELECT id::text AS id FROM tenants WHERE slug = $1`, [
    environment.seedTenantSlug,
  ]);
  const seededTenantId = tenantRow.rows[0]?.id;
  if (typeof seededTenantId !== 'string') {
    throw new Error(
      `Tenant '${environment.seedTenantSlug}' is missing. Run "npm run db:seed:permissions" before the acceptance harness.`,
    );
  }
  jobOutcomeBeforeSeed = await countJobOutcomeRows(dbClient, seededTenantId);

  fixture = await seedReferenceFixtures(dbClient, {
    tenantSlug: environment.seedTenantSlug,
    credential: environment.fixtureCredential,
    namespace: NAMESPACE,
  });
  jobOutcomeAfterSeed = await countJobOutcomeRows(dbClient, fixture.tenantId);

  // Journey kendi portunu kullanır: shell-auth spec'i aynı anda/art arda
  // koşsa bile port sahipliği kanıtı bozulmaz.
  server = await startRuntimeServer({
    baseUrl: runtimeTarget.baseUrl,
    port: runtimeTarget.port,
    artifactDir: environment.journeyArtifactDir,
  });

  browser = await launchE2eBrowser();
  session = await createUiSession({
    browser,
    baseUrl: runtimeTarget.baseUrl,
    screenshotDir: path.join(environment.journeyArtifactDir, SCREENSHOT_DIR_NAME),
    index: screenshotIndex,
  });
});

function surface(): JourneySurface {
  return {
    session: session as UiSession,
    fixture,
    environment,
    screenshots,
    artifactDir: environment.journeyArtifactDir,
  };
}

describe('F1 — journey + negatif matris iskeleti (fresh DB, gerçek backend, gerçek tarayıcı)', () => {
  it('R10 adım sözleşmesi 7 adımla birebir ve executor kaydı boş', () => {
    assertJourneyContractShape();
    expect(JOURNEY_STEPS.map((step) => step.id)).toEqual([...JOURNEY_STEP_IDS]);
    expect(JOURNEY_STEPS.map((step) => step.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // F1: hiçbir adım uygulanmadı → executor kaydı boş olmalı.
    expect(Object.keys(F1_JOURNEY_EXECUTORS)).toEqual([]);
    for (const step of JOURNEY_STEPS) {
      expect(step.pendingSlices.length).toBeGreaterThan(0);
    }
  });

  it('R11 negatif senaryo kataloğu eksiksiz ve sessiz atlama yok', () => {
    assertNegativeMatrixShape();
    const categories = new Set(NEGATIVE_SCENARIOS.map((scenario) => scenario.category));
    for (const required of [
      'unauthorized',
      'forbidden',
      'cross-tenant',
      'stale',
      'session-expiry',
      'expired',
      'offline',
      'invalid-input',
    ]) {
      expect(categories.has(required as never)).toBe(true);
    }
    for (const scenario of NEGATIVE_SCENARIOS) {
      if (scenario.executorId === null) {
        expect(scenario.pendingSlices.length).toBeGreaterThan(0);
      }
    }
  });

  it('seed aşaması hiçbir iş sonucu satırı üretmiyor (referans-fixture-only)', () => {
    expect(rowsCreatedBySeed()).toBe(0);
    for (const [table, delta] of Object.entries(seedDeltas())) {
      expect({ table, delta }).toEqual({ table, delta: 0 });
    }
    expect(fixture.seededTables.length).toBeGreaterThan(0);
    for (const table of fixture.seededTables) {
      expect(JOB_OUTCOME_TABLES).not.toContain(table);
    }
  });

  it('journey adımları çalıştırılıyor: executor yoksa NOT_IMPLEMENTED (skip değil)', async () => {
    expect(await session!.navigateToRuntime()).toBe(200);
    surfaceProbes = await probeJourneySurfaces(session!);
    expect(surfaceProbes.length).toBeGreaterThan(0);

    journeyEvidence = await runJourneySteps(surface(), F1_JOURNEY_EXECUTORS);

    expect(journeyEvidence.map((entry) => entry.stepId)).toEqual([...JOURNEY_STEP_IDS]);
    for (const entry of journeyEvidence) {
      expect(EVIDENCE_VERDICTS).toContain(entry.verdict);
      // Yasak etiketler verdict olarak ASLA görünmez.
      expect(NON_PASS_OUTCOME_TOKENS).not.toContain(entry.verdict);
      expect(entry.verdict).toBe('NOT_IMPLEMENTED');
      expect(entry.executedBy).toBeNull();
      expect(entry.detail.length).toBeGreaterThan(0);
    }

    const summary = evidenceSummary(journeyEvidence);
    expect(summary.verdict).toBe('NOT_IMPLEMENTED');
    expect(summary.allPass).toBe(false);
    expect(summary.passCount).toBe(0);
    expect(summary.unresolvedStepIds.length).toBe(JOURNEY_STEP_IDS.length);

    screenshots.push(await session!.screenshot('journey-skeleton-surface'));
  });

  it('negatif matris çalıştırma iskeleti kayıt üretiyor (PASS uydurulmuyor)', async () => {
    negativeEvidence = await runNegativeMatrix(surface(), {});

    expect(negativeEvidence.map((entry) => entry.stepId)).toEqual(
      NEGATIVE_SCENARIOS.map((scenario) => scenario.id),
    );
    for (const entry of negativeEvidence) {
      expect(entry.verdict).toBe('NOT_IMPLEMENTED');
      expect(entry.executedBy).toBeNull();
      expect(entry.detail.length).toBeGreaterThan(0);
    }

    const summary = evidenceSummary(negativeEvidence);
    expect(summary.verdict).toBe('NOT_IMPLEMENTED');
    expect(summary.allPass).toBe(false);
  });

  it('skip/neutral/cancelled etiketleri normalize edilirken PASS olmuyor', () => {
    for (const token of NON_PASS_OUTCOME_TOKENS) {
      expect(normalizeVerdict(token)).not.toBe('PASS');
    }
    expect(normalizeVerdict('SKIP')).toBe('NOT_IMPLEMENTED');
    expect(normalizeVerdict('neutral')).toBe('NOT_IMPLEMENTED');
    expect(normalizeVerdict('cancelled')).toBe('NOT_IMPLEMENTED');
    expect(normalizeVerdict('unreachable')).toBe('BLOCKED');
    expect(normalizeVerdict(undefined)).toBe('BLOCKED');
  });

  it('kabul artefaktları exact head SHA ya bağlı ve PII bulgusu yok', () => {
    writeJourneyReport();
    writeAndVerifyManifest();

    const manifest = JSON.parse(
      fs.readFileSync(path.join(environment.journeyArtifactDir, ARTIFACT_MANIFEST_FILE), 'utf8'),
    ) as { headSha?: string; redaction?: { findingCount?: number } };
    expect(manifest.headSha).toBe(environment.headSha);
    expect(manifest.redaction?.findingCount).toBe(0);

    const scan = scanArtifactDirectory(environment.journeyArtifactDir, {
      exclude: [ARTIFACT_MANIFEST_FILE],
    });
    expect(scan.findingCount).toBe(0);
    expect(
      verifyArtifactManifest(environment.journeyArtifactDir, {
        expectedHeadSha: environment.headSha,
      }),
    ).toEqual([]);
  });
});


afterAll(async () => {
  let failure: unknown;
  try {
    if (environment !== undefined) {
      writeJourneyReport();
      writeAndVerifyManifest();
    }
  } catch (error) {
    failure = new Error(
      `Journey evidence could not be finalised: ${redactEvidenceText(
        error instanceof Error ? error.message : String(error),
      )}`,
    );
  } finally {
    if (session !== undefined) await session.close().catch(() => undefined);
    if (browser !== undefined) await browser.close().catch(() => undefined);
    if (server !== undefined) await server.stop().catch(() => undefined);
    if (dbClient !== undefined) await dbClient.end().catch(() => undefined);
  }
  if (failure !== undefined) throw failure;
});

