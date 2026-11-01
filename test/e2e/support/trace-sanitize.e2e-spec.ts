import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sanitizeTraceFile } from './trace';

/**
 * S5-B2 (#269 AC-6) regresyon kilidi: trace redaksiyonu yalnız string
 * değerlere dokunmalı, sayısal alanları (ör. Chrome `ts`) bozmamalıdır.
 */
describe('trace sanitization', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-sanitize-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('redacts string PII while preserving numeric fields', () => {
    const file = path.join(dir, 'trace.json');
    const trace = [
      { name: 'event', ts: 5321234567, args: { email: 'gercek.kisi@example.com', phone: '0532 123 45 67' } },
      { name: 'safe', ts: 123, args: { note: 'sentetik@qa.invalid' } },
    ];
    fs.writeFileSync(file, JSON.stringify(trace), 'utf8');

    const result = sanitizeTraceFile(file);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof trace;

    expect(parsed[0].ts).toBe(5321234567);
    expect(parsed[0].args.email).toBe('<email-redacted>');
    expect(parsed[0].args.phone).toBe('<phone-redacted>');
    expect(parsed[1].args.note).toBe('sentetik@qa.invalid');
    expect(result.findings).not.toContain('trace-unparsed-fallback');
  });

  it('falls back to string-literal redaction without corrupting numbers', () => {
    const file = path.join(dir, 'partial-trace.json');
    fs.writeFileSync(file, '[{"ts":5321234567,"args":{"email":"gercek.kisi@example.com"}}', 'utf8');

    const result = sanitizeTraceFile(file);
    const sanitized = fs.readFileSync(file, 'utf8');

    expect(result.findings).toContain('trace-unparsed-fallback');
    expect(sanitized).toContain('"ts":5321234567');
    expect(sanitized).toContain('<email-redacted>');
    expect(sanitized).not.toContain('gercek.kisi@example.com');
  });
});
