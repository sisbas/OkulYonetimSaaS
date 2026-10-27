import { PHONE_LEAK_PATTERN, scanTextForLeaks } from './browser';

/**
 * P0 browser E2E sızıntı taraması regresyon kilidi.
 *
 * Kabul artefaktlarındaki `studentRef` gibi deterministik hex özetler 10
 * haneli rastgele diziler içerebilir (ör. `5471383712fd76…`). Bu diziler
 * gerçek telefon değildir; tarayıcı bunları `phone-like-value` olarak
 * işaretlerse P0 E2E rastgele kırılır. Aynı tarama gerçek telefonları
 * kaçırmamalıdır.
 */
describe('P0 leak scan — phone-like value', () => {
  const hexRefs = [
    'local-test:student:5471383712fd76a23e1ee4728f679631',
    'local-test:student:05471234567abcdef0123456789abcdef',
    '{"studentRef":"local-test:student:5471383712fd76a23e1ee4728f679631"}',
    'sessionId=9759117759505123456789abcdef',
  ];

  const realPhones = [
    '+90 532 123 45 67',
    '05321234567',
    '0532 123 45 67',
    '0532-123-45-67',
    'Telefon: 0090 532 123 45 67',
  ];

  it.each(hexRefs)('does not flag hex identifiers as phone numbers: %s', (value) => {
    expect(PHONE_LEAK_PATTERN.test(value)).toBe(false);
    expect(scanTextForLeaks(value)).toEqual([]);
  });

  it.each(realPhones)('still flags real phone numbers: %s', (value) => {
    expect(PHONE_LEAK_PATTERN.test(value)).toBe(true);
    expect(scanTextForLeaks(value)).toContain('phone-like-value');
  });
});
