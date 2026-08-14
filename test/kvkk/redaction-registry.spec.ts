/**
 * OKUL-10 — KVKK merkezi redaction registry birim testleri
 *
 * `src/kvkk/redaction-registry.ts` OKUL-04 ile eklenen TEK KAYNAK (single source of
 * truth) maskeleme kayıt defteridir; audit export, notification payload redaction ve
 * audit metadata policy katmanlarının tamamı bu dosyadan türetilir.
 *
 * Bu test, CI coverage eşiği (OKUL-10) kapsamında registry'nin davranışını kilitler:
 * normalize edilmiş anahtar eşleşmesi, özyinelemeli nesne maskelemesi ve
 * mutasyona uğratmama garantisi.
 */
import {
  REDACTED,
  REDACTION_FIELDS,
  isSensitiveKey,
  redactObject,
  redactValue,
} from '../../src/kvkk/redaction-registry';

describe('OKUL-10 KVKK redaction registry', () => {
  describe('REDACTION_FIELDS', () => {
    it('boş olmamalı ve temel kimlik alanlarını içermeli', () => {
      expect(REDACTION_FIELDS.size).toBeGreaterThan(0);
      expect(REDACTION_FIELDS.has('parentEmail')).toBe(true);
    });
  });

  describe('isSensitiveKey', () => {
    it('kayıtlı bir hassas alanı tanır', () => {
      expect(isSensitiveKey('parentEmail')).toBe(true);
    });

    it('case ve ayırıcı varyantlarını normalize ederek tanır', () => {
      // normalizeKey küçük harfe indirir ve alfanümerik olmayanları atar
      expect(isSensitiveKey('PARENTEMAIL')).toBe(true);
      expect(isSensitiveKey('parent_email')).toBe(true);
      expect(isSensitiveKey('Parent-Email')).toBe(true);
    });

    it('hassas olmayan bir alan için false döner', () => {
      expect(isSensitiveKey('resultCode')).toBe(false);
      expect(isSensitiveKey('tenantId')).toBe(false);
    });

    it('boş anahtar için güvenli şekilde false döner', () => {
      expect(isSensitiveKey('')).toBe(false);
    });
  });

  describe('redactValue', () => {
    it('hassas alanın değerini maskeler', () => {
      expect(redactValue('parentEmail', 'veli@example.com')).toBe(REDACTED);
    });

    it('hassas olmayan alanın değerini olduğu gibi bırakır', () => {
      expect(redactValue('resultCode', 'OK')).toBe('OK');
      expect(redactValue('attempt', 3)).toBe(3);
    });
  });

  describe('redactObject', () => {
    it('düz nesnede yalnızca hassas alanları maskeler', () => {
      const out = redactObject({
        tenantId: 't-1',
        parentEmail: 'veli@example.com',
        resultCode: 'SENT',
      }) as Record<string, unknown>;

      expect(out.tenantId).toBe('t-1');
      expect(out.resultCode).toBe('SENT');
      expect(out.parentEmail).toBe(REDACTED);
    });

    it('iç içe nesnelerde özyinelemeli maskeleme yapar', () => {
      // NOT: sarmalayıcı anahtarlar ('audit', 'detay') bilinçli olarak hassas
      // OLMAYAN adlardır; aksi halde tüm alt ağaç tek seferde maskelenir.
      const out = redactObject({
        audit: { actorId: 'a-1', detay: { parentEmail: 'veli@example.com' } },
      }) as { audit: { actorId: string; detay: Record<string, unknown> } };

      expect(out.audit.actorId).toBe('a-1');
      expect(out.audit.detay.parentEmail).toBe(REDACTED);
    });

    it('hassas bir sarmalayıcı anahtarın tüm alt ağacını maskeler (fail-closed)', () => {
      // 'payload' registry'de hassas olarak kayıtlı olduğundan alt ağaç hiç
      // dolaşılmaz ve komple maskelenir — bu istenen fail-closed davranıştır.
      const out = redactObject({
        payload: { parentEmail: 'veli@example.com', mesaj: 'gizli' },
      }) as Record<string, unknown>;

      expect(out.payload).toBe(REDACTED);
    });

    it('dizi içindeki nesneleri de maskeler', () => {
      const out = redactObject([
        { parentEmail: 'a@example.com' },
        { parentEmail: 'b@example.com' },
      ]) as Array<Record<string, unknown>>;

      expect(out).toHaveLength(2);
      expect(out[0].parentEmail).toBe(REDACTED);
      expect(out[1].parentEmail).toBe(REDACTED);
    });

    it('orijinal nesneyi mutasyona uğratmaz', () => {
      const original = { parentEmail: 'veli@example.com', tenantId: 't-1' };
      redactObject(original);

      // Kaynak nesne bozulmamalı — salt okunur dönüşüm garantisi
      expect(original.parentEmail).toBe('veli@example.com');
    });

    it('ilkel (primitive) ve null değerleri olduğu gibi döndürür', () => {
      expect(redactObject('metin')).toBe('metin');
      expect(redactObject(42)).toBe(42);
      expect(redactObject(null)).toBeNull();
      expect(redactObject(undefined)).toBeUndefined();
    });
  });
});
