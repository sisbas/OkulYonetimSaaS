import { PseudonymKey, pseudonymize, resolvePseudonymKey } from './pseudonym';

/**
 * #266 R5 — Hassas okuma audit'i için PII'siz özne referansı.
 *
 * Durable audit kaydı (`dataprotection.export.redacted`) `entityId` alanını
 * **UUID** olarak doğrular (audit metadata policy). Ham öğrenci UUID'sini audit'e
 * yazmak ise #266 review P2'nin düzelttiği sızıntı sınıfıdır (öğrenciye
 * bağlanabilir kalıcı kimlik, log/audit/artefakt yüzeyinde istenmez).
 *
 * Çözüm: aynı pseudonym anahtarından türetilen **deterministik UUID**.
 * - `pseudonymize()` çıktısının 128-bit HMAC özeti UUID biçimine sokulur.
 * - Aynı (tenant, öğrenci) → aynı değer: "şu öğrencinin onayı kimler tarafından
 *   okundu" sorusu kayıtlar arasında korele edilebilir.
 * - Kiracıya kilitli (tenantId HMAC girdisinde) → kiracılar arası eşleştirme yok.
 * - Anahtar olmadan ham kimliğe geri döndürülemez; ham UUID hiçbir yüzeye yazılmaz.
 *
 * Fail-closed: pseudonym anahtarı production'da eksik/zayıf ise `pseudonymize`
 * hata fırlatır (bkz. src/kvkk/pseudonym.ts).
 */

const PSEUDONYM_DIGEST_PATTERN = /([0-9a-f]{32})$/;
const UUID_HEX_LENGTH = 32;

export function auditSubjectRefUuid(input: {
  tenantId: string;
  studentId: string;
  /** Test/DI amaçlı anahtar enjeksiyonu; verilmezse ortamdan fail-closed çözülür. */
  key?: PseudonymKey;
}): string {
  const pseudonym = pseudonymize(
    { tenantId: input.tenantId, scope: 'student', rawId: input.studentId },
    input.key ?? resolvePseudonymKey(),
  );

  const digest = PSEUDONYM_DIGEST_PATTERN.exec(pseudonym)?.[1];
  if (!digest || digest.length !== UUID_HEX_LENGTH) {
    // Savunma: pseudonym sözleşmesi bozulursa audit'e öngörülemeyen değer yazmayız.
    throw new TypeError('auditSubjectRefUuid: pseudonym digest must be 128-bit hex');
  }

  const hex = digest.toLowerCase();
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
