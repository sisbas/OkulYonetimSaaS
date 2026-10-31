import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #259 P1B-02 AC-1 — "Production startup fails closed".
 *
 * `assertSecurityPostureAtStartup` fonksiyonel olarak ayrıca test edilir; bu
 * test ise gerçek runtime giriş noktasının (src/main.ts) doğrulamayı Nest
 * uygulaması oluşturulmadan ÖNCE çağırdığını garanti eder. Fonksiyon doğru
 * olsa bile entrypoint onu çağırmazsa fail-closed garanti yoktur.
 */
describe('runtime entrypoint security posture gate (#259 AC-1)', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');

  it('validates the security posture inside bootstrap()', () => {
    expect(source).toMatch(/const\s+posture\s*=\s*assertSecurityPostureAtStartup\(\)/);
  });

  it('validates the posture before the Nest application is created', () => {
    const gateIndex = source.search(/const\s+posture\s*=\s*assertSecurityPostureAtStartup\(\)/);
    const nestIndex = source.indexOf('NestFactory.create');
    const listenIndex = source.indexOf('app.listen');

    expect(gateIndex).toBeGreaterThan(-1);
    expect(nestIndex).toBeGreaterThan(-1);
    expect(listenIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(nestIndex);
    expect(gateIndex).toBeLessThan(listenIndex);
  });

  it('logs only non-secret posture identifiers', () => {
    expect(source).toMatch(/event:\s*'security\.posture\.validated'/);
    // Rapor alanları gizli değer taşımaz; secret alanı loglanmamalı.
    expect(source).not.toMatch(/accessSecret:.*posture/);
    expect(source).not.toMatch(/JWT_ACCESS_SECRET/);
  });
});
