import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanTextForLeaks } from './browser';

/**
 * S0-A1 — kabul artefaktlarının GERÇEK sızıntı taraması (review bulgusu P2).
 *
 * Önceki sürüm `report.json` içinde boş bir `artifacts: []` alanı raporluyordu;
 * yani "tarandı" izlenimi veren ama hiç taramayan bir alan vardı. Bu modül
 * artefakt dizinini gerçekten okur, metin dosyalarını PII/secret desenleriyle
 * tarar ve ikili dosyaları (PNG) açıkça "metin taraması dışı" olarak raporlar.
 *
 * PNG'ler için tarama yerine **inşa gereği maskeleme** uygulanır: ekran
 * görüntüsünden önce kimlik alanları gerçek klavye etkileşimiyle temizlenir
 * (`maskCredentialInputs`). Bu ayrım raporda açıkça yazılır.
 */

const TEXT_EXTENSIONS = new Set(['.log', '.json', '.txt', '.md', '.html', '.csv', '.tsv']);

export type ArtifactScanResult = Readonly<{
  /** Dosya adı -> bulunan sızıntı türleri (boş dizi = temiz). */
  textFiles: Record<string, string[]>;
  /** Metin taramasına girmeyen dosyalar (ör. PNG) ve gerekçesi. */
  skippedBinary: string[];
  /** Bulgu sayısı (0 ise temiz). */
  findingCount: number;
}>;

/**
 * Artefakt dizinindeki tüm dosyaları (göreli yol, POSIX ayraçlı) döner.
 * Manifesto kapsam denetimi de bu fonksiyonu kullanır; iki liste ayrışamaz.
 */
export function collectArtifactFiles(dir: string, base = dir): string[] {
  return collectFiles(dir, base);
}

function collectFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(absolute, base));
    else if (entry.isFile()) files.push(path.relative(base, absolute));
  }
  return files.sort();
}

export function scanArtifactDirectory(
  directory: string,
  options: Readonly<{
    exclude?: ReadonlyArray<string>;
    /** Dizin önekleri: `journey/...` gibi alt ağaçları tümüyle dışlar. */
    excludePrefixes?: ReadonlyArray<string>;
  }> = {},
): ArtifactScanResult {
  const excluded = new Set((options.exclude ?? []).map((name) => name.split('\\').join('/')));
  const excludedPrefixes = (options.excludePrefixes ?? []).map((name) =>
    name.split('\\').join('/').replace(/\/$/, ''),
  );
  const textFiles: Record<string, string[]> = {};
  const skippedBinary: string[] = [];

  for (const relative of collectFiles(directory)) {
    const normalizedName = relative.split('\\').join('/');
    if (
      excluded.has(normalizedName) ||
      excludedPrefixes.some(
        (prefix) => normalizedName === prefix || normalizedName.startsWith(`${prefix}/`),
      )
    ) {
      continue;
    }
    if (!TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
      skippedBinary.push(`${normalizedName} (text scan not applicable)`);
      continue;
    }
    textFiles[normalizedName] = scanTextForLeaks(fs.readFileSync(path.join(directory, relative), 'utf8'));
  }

  return Object.freeze({
    textFiles,
    skippedBinary,
    findingCount: Object.values(textFiles).reduce((total, findings) => total + findings.length, 0),
  });
}
