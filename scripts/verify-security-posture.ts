/**
 * #259 P1B-02 — deploy öncesi güvenlik duruşu doğrulaması.
 *
 * Kullanım:
 *   NODE_ENV=production JWT_ACCESS_SECRET=... npx ts-node scripts/verify-security-posture.ts
 *
 * Süreç `src/main.ts` ile aynı fail-closed doğrulamayı çalıştırır. Exit kodu:
 *   0 → duruş geçerli (rapor stdout'a JSON olarak yazılır; gizli değer içermez)
 *   1 → fail-closed ihlal (tüm problemler stderr'e yazılır)
 *
 * Uyarılar (ör. parent-contact anahtarının henüz tanımlanmamış olması) exit
 * kodunu DEĞİŞTİRMEZ; raporda `warnings` altında görünür.
 */
import { assertSecurityPostureAtStartup } from '../src/common/security/security-bootstrap';

function main(): void {
  try {
    const report = assertSecurityPostureAtStartup(process.env);
    process.stdout.write(`${JSON.stringify({ ok: true, report }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

main();
