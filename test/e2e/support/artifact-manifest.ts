import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectArtifactFiles, scanArtifactDirectory } from './artifact-scan';

/**
 * F1 (#269 / §8 kanıt sözleşmesi) — artefakt manifestosu ve head-SHA bağı.
 *
 * Sözleşme: bir kabul koşusunun artefaktları (rapor, log, ekran görüntüsü,
 * DB denetimi) YALNIZ o koşuyu üreten exact commit'e bağlıdır ve PII/secret
 * taraması bulgu=0'dır. Manifesto bunu makine-okur biçimde kaydeder;
 * `verifyArtifactManifest` doğrulamayı fail-closed yapar (eksik dosya, başka
 * head, kapsam dışı dosya, PII bulgusu → ihlal).
 *
 * Not (bilinçli tasarım): dosya başına kriptografik özet (hex digest)
 * KOYULMAZ. Uzun hex dizileri harness'ın kendi "phone-like-value" PII
 * tarayıcısında yanlış pozitif üretir; kanıt sözleşmesinin istediği bağ
 * exact head SHA'dır. Bütünlük; kapsam (listed/unlisted), redaksiyon taraması
 * ve CI artefakt saklama ile korunur.
 */

export const ARTIFACT_MANIFEST_FILE = 'artifact-manifest.json';
export const ARTIFACT_MANIFEST_CONTRACT = 'acceptance-artifact-manifest/v1';

export type ArtifactRole = 'report' | 'log' | 'screenshot' | 'dbAudit' | 'trace' | 'video';

export type RoleCoverage =
  | Readonly<{ status: 'present'; files: ReadonlyArray<string> }>
  | Readonly<{ status: 'pending-slice'; reason: string }>;

export type ArtifactManifest = Readonly<{
  contract: string;
  slice: string;
  headSha: string;
  generatedAt: string;
  roles: Readonly<Partial<Record<ArtifactRole, RoleCoverage>>>;
  coverage: Readonly<{
    files: ReadonlyArray<string>;
    excludedPrefixes: ReadonlyArray<string>;
    complete: boolean;
  }>;
  redaction: Readonly<{
    findingCount: number;
    findings: Readonly<Record<string, ReadonlyArray<string>>>;
    scannedFiles: ReadonlyArray<string>;
    binarySkipped: ReadonlyArray<string>;
  }>;
  dbAudit: Readonly<{
    jobOutcomeRowsCreated: number;
    perTable: Readonly<Record<string, number>>;
  }>;
}>;

export type WriteManifestInput = Readonly<{
  root: string;
  slice: string;
  headSha: string;
  roles: Readonly<Partial<Record<ArtifactRole, RoleCoverage>>>;
  excludedPrefixes?: ReadonlyArray<string>;
  dbAudit: Readonly<{ jobOutcomeRowsCreated: number; perTable: Readonly<Record<string, number>> }>;
}>;

const SHA_LIKE = /^[0-9a-f]{40}$/i;

export function toPosixPath(value: string): string {
  return value.split('\\').join('/');
}

/** Manifestonun kendi dosyası ve hariç tutulan önekler dışındaki dosyalar. */
export function coveredArtifactFiles(
  root: string,
  excludedPrefixes: ReadonlyArray<string>,
): string[] {
  const excluded = excludedPrefixes.map(toPosixPath);
  return collectArtifactFiles(root).filter((relative) => {
    const normalized = toPosixPath(relative);
    if (normalized === ARTIFACT_MANIFEST_FILE) return false;
    return !excluded.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
  });
}

export function writeArtifactManifest(input: WriteManifestInput): ArtifactManifest {
  const excludedPrefixes = (input.excludedPrefixes ?? []).map(toPosixPath);
  const files = coveredArtifactFiles(input.root, excludedPrefixes);
  // Redaksiyon taraması KAPSAMLA hizalıdır: hariç tutulan alt ağaç taranmaz.
  const scan = scanArtifactDirectory(input.root, {
    exclude: [ARTIFACT_MANIFEST_FILE],
    excludePrefixes: excludedPrefixes,
  });

  const manifest: ArtifactManifest = Object.freeze({
    contract: ARTIFACT_MANIFEST_CONTRACT,
    slice: input.slice,
    headSha: input.headSha,
    generatedAt: new Date().toISOString(),
    roles: input.roles,
    coverage: Object.freeze({
      files: Object.freeze(files),
      excludedPrefixes: Object.freeze(excludedPrefixes),
      complete: true,
    }),
    redaction: Object.freeze({
      findingCount: scan.findingCount,
      findings: Object.freeze(scan.textFiles),
      scannedFiles: Object.freeze(Object.keys(scan.textFiles)),
      binarySkipped: Object.freeze(scan.skippedBinary),
    }),
    dbAudit: Object.freeze({
      jobOutcomeRowsCreated: input.dbAudit.jobOutcomeRowsCreated,
      perTable: Object.freeze({ ...input.dbAudit.perTable }),
    }),
  });

  fs.mkdirSync(input.root, { recursive: true });
  fs.writeFileSync(
    path.join(input.root, ARTIFACT_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return manifest;
}



/**
 * Manifestoyu okur ve doğrular. Dönen liste boşsa kanıt geçerlidir; her satır
 * bir ihlaldir (fail-closed).
 */
export function verifyArtifactManifest(
  root: string,
  options: Readonly<{ expectedHeadSha?: string }> = {},
): string[] {
  const violations: string[] = [];
  const manifestPath = path.join(root, ARTIFACT_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    return [`Missing ${ARTIFACT_MANIFEST_FILE} under ${toPosixPath(root)}.`];
  }

  let manifest: ArtifactManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ArtifactManifest;
  } catch (error) {
    return [
      `${ARTIFACT_MANIFEST_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }

  if (manifest.contract !== ARTIFACT_MANIFEST_CONTRACT) {
    violations.push(`Unexpected manifest contract '${String(manifest.contract)}'.`);
  }
  if (typeof manifest.headSha !== 'string' || !SHA_LIKE.test(manifest.headSha)) {
    violations.push(`headSha '${String(manifest.headSha)}' is not an exact 40-char commit SHA.`);
  }
  if (options.expectedHeadSha !== undefined && manifest.headSha !== options.expectedHeadSha) {
    violations.push(
      `Manifest is bound to head ${String(manifest.headSha)} but the run head is ${options.expectedHeadSha}.`,
    );
  }

  const listed = (manifest.coverage?.files ?? []).map(toPosixPath);
  if (listed.length === 0) violations.push('Manifest lists no artifact files.');
  for (const relative of listed) {
    if (!fs.existsSync(path.join(root, relative))) {
      violations.push(`Listed artifact is missing: ${relative}`);
    }
  }

  if (manifest.coverage?.complete === true) {
    const onDisk = new Set(
      coveredArtifactFiles(root, (manifest.coverage.excludedPrefixes ?? []).map(toPosixPath)),
    );
    for (const relative of onDisk) {
      if (!listed.includes(relative)) {
        violations.push(`Artifact is not covered by the manifest: ${relative}`);
      }
    }
  }

  if ((manifest.redaction?.findingCount ?? -1) !== 0) {
    violations.push(
      `Redaction scan reported ${String(manifest.redaction?.findingCount)} finding(s).`,
    );
  }
  if ((manifest.redaction?.scannedFiles ?? []).length === 0) {
    violations.push('Redaction scan covered no text artifact; a silent scan is not evidence.');
  }

  const roleNames = Object.keys(manifest.roles ?? {}) as ArtifactRole[];
  if (roleNames.length === 0) violations.push('Manifest declares no artifact roles.');
  for (const role of roleNames) {
    const coverage = manifest.roles[role];
    if (coverage === undefined) continue;
    if (coverage.status === 'present') {
      if (coverage.files.length === 0) {
        violations.push(`Role '${role}' is present but lists no file.`);
      }
      for (const relative of coverage.files.map(toPosixPath)) {
        if (!listed.includes(relative)) {
          violations.push(`Role '${role}' references an unlisted artifact: ${relative}`);
        }
      }
    } else if (coverage.reason.trim().length < 10) {
      violations.push(`Role '${role}' is pending without a substantive reason.`);
    }
  }

  return violations;
}
