/**
 * #266 R5 — İletişim verisi maskeleme (hassas okuma savunması).
 *
 * `kvkk_consent_subjects` sözleşmesi gereği yalnız **maskeli** iletişim değeri
 * saklar (`contact_phone_masked` / `contact_email_masked`). Ancak bu bir *veri*
 * sözleşmesidir: bir gün ham değer yazılırsa (legacy satır, elle müdahale, hatalı
 * import) API yanıtı ham PII döndürürdü. Bu yüzden okuma yolunda **ikinci bir
 * savunma katmanı** uygulanır: değer zaten maskeli değilse maskeleme burada
 * yapılır ve `remasked: true` olarak raporlanır (denetlenebilir kanıt).
 *
 * PII: bu modül değeri döndürmez etmez — maskeler; log tutmaz, ham değeri
 * hata mesajına/çağırana yazmaz.
 */

/** Maskeleme stratejisi türü; KVKK redaction receipt ile aynı sözlük. */
export type ContactFieldKind = 'phone' | 'email';

export const REDACTED_PLACEHOLDER = '[REDACTED]';

/** Maskeli kabul edilen biçim: maske karakteri ya da tam redaksiyon yer tutucusu. */
export function isMaskedContactValue(value: string): boolean {
  return value.includes('*') || value.includes(REDACTED_PLACEHOLDER);
}

/**
 * Telefon maskesi: ilk 2 ve son 2 karakter korunur, aradaki her karakter `*`.
 * Ham numara (ör. `+905551112233`) çıktıda hiçbir zaman tam olarak bulunmaz.
 */
export function maskPhoneValue(value: string): string {
  const chars = [...value];
  if (chars.length === 0) return '';
  if (chars.length <= 4) return '*'.repeat(chars.length);
  return `${chars.slice(0, 2).join('')}${'*'.repeat(chars.length - 4)}${chars.slice(-2).join('')}`;
}

/**
 * E-posta maskesi: yerel parçanın ilk karakteri + alanın son etiketi korunur.
 * `ali.veli@example.com` → `a***@***.com` (tam adres çıktıda bulunmaz).
 */
export function maskEmailValue(value: string): string {
  const at = value.lastIndexOf('@');
  if (at <= 0) return '*'.repeat(Math.max(value.length, 3));

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const lastDot = domain.lastIndexOf('.');
  const maskedDomain = lastDot > 0 ? `***${domain.slice(lastDot)}` : '***';
  const visibleLocal = [...local][0] ?? '';
  return `${visibleLocal}***@${maskedDomain}`;
}

export type MaskedContactField = Readonly<{
  /** Yanıta gidecek (maskeli) değer; alan yoksa null. */
  value: string | null;
  /** Değer okuma yolunda yeniden maskelendi mi (ham veri yakalandı kanıtı). */
  remasked: boolean;
}>;

/**
 * Tek bir iletişim alanını fail-closed maskeler: maske biçimi zaten uygunsa
 * değere dokunulmaz (`remasked: false`); değilse maskelenir (`remasked: true`).
 */
export function maskContactField(
  value: string | null | undefined,
  kind: ContactFieldKind,
): MaskedContactField {
  if (value === null || value === undefined || value === '') {
    return { value: null, remasked: false };
  }
  if (isMaskedContactValue(value)) {
    return { value, remasked: false };
  }
  return {
    value: kind === 'phone' ? maskPhoneValue(value) : maskEmailValue(value),
    remasked: true,
  };
}
