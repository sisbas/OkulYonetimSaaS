/**
 * #266 N1a — Masked/minimized contact projection (KVKK).
 *
 * Public read yanıtları yalnız maskelenmiş projeksiyon taşır;
 * ham contact değeri (telefon/eposta) hiçbir zaman döndürülmez.
 * Bu fonksiyonlar deterministiktir ve girdi ham değerini
 * gerektirmez — DB'deki `masked_display` sütunu bu projeksiyonla
 * doldurulur.
 */

export type MaskedContactProjection = Readonly<{
  channel: string;
  maskedDisplay: string;
  verificationStatus: string;
  verificationEvidenceRef: string | null;
}>;

/**
 * Telefon maskleme: `+` öneki bulunuyorsa korunur, son 2
 * hane hariç tüm rakamlar yıldızlanır. Örnek:
 * `+90-555-123-45-67` -> `+**********67`.
 *
 * Ülke kodu uzunluğu (1-3 hane) numaradan tek başına
 * belirsiz olduğundan, doğru bir sınır çizmek yerine
 * **tüm** rakamlar masked edilir (KVKK minimization);
 * yalnız son 2 hane ve `+` görünür kalır. Sadece rakam
 * ve `+` kabul edilir; diğer karakterler normalize edilir.
 * Bilinmeyen/çok kısa girdi tamamen maskelenir.
 */
export function maskPhone(raw: string): string {
  const withPlus = raw.replace(/[^0-9+]/g, '');
  const numeric = withPlus.replace(/\D/g, '');
  if (numeric.length < 4) return '***';

  const plusPrefix = withPlus.startsWith('+') ? '+' : '';
  const lastTwo = numeric.slice(-2);
  const masked = '*'.repeat(numeric.length - 2);
  return `${plusPrefix}${masked}${lastTwo}`;
}

/**
 * E-posta maskleme: ilk karakter + `***@domain`. Örnek:
 * `ahmet@example.com` -> `a***@example.com`.
 *
 * Geçersiz/eksik girdi tamamen maskelenir.
 */
export function maskEmail(raw: string): string {
  const trimmed = raw.trim();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return '***';
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const first = local[0] ?? '*';
  return `${first}***@${domain}`;
}

/**
 * Kanal bazlı maskelenmiş projeksiyon üretir.
 * Bilinmeyen kanal tam maskelenir (fail-safe).
 */
export function maskContactValue(
  channel: string,
  raw: string,
): string {
  switch (channel) {
    case 'sms':
    case 'whatsapp':
      return maskPhone(raw);
    case 'email':
      return maskEmail(raw);
    default:
      return '***';
  }
}
