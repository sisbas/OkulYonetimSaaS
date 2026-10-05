import { maskContactValue, maskEmail, maskPhone } from './contact-masking';

describe('contact masking (#266 N1a)', () => {
  describe('maskPhone', () => {
    it('keeps the + prefix and last two digits, masks all other digits', () => {
      expect(maskPhone('+90-555-123-45-67')).toBe('+**********67');
      expect(maskPhone('+90 555 123 45 67')).toBe('+**********67');
    });

    it('fully masks too-short or invalid input (fail-safe)', () => {
      expect(maskPhone('12')).toBe('***');
      expect(maskPhone('')).toBe('***');
    });
  });

  describe('maskEmail', () => {
    it('keeps the first character and the domain', () => {
      expect(maskEmail('ahmet@example.com')).toBe('a***@example.com');
      expect(maskEmail('  Ahmet.Yesil@Okul.edu.tr ')).toBe(
        'A***@Okul.edu.tr',
      );
    });

    it('fully masks invalid input (fail-safe)', () => {
      expect(maskEmail('no-at-sign')).toBe('***');
      expect(maskEmail('@domain.com')).toBe('***');
      expect(maskEmail('')).toBe('***');
    });
  });

  describe('maskContactValue (channel-aware)', () => {
    it('masks phone channels as phone', () => {
      expect(maskContactValue('sms', '+905551234567')).toBe(
        '+**********67',
      );
      expect(maskContactValue('whatsapp', '+905551234567')).toBe(
        '+**********67',
      );
    });

    it('masks email channel as email', () => {
      expect(maskContactValue('email', 'ahmet@example.com')).toBe(
        'a***@example.com',
      );
    });

    it('fully masks an unknown channel (fail-safe)', () => {
      expect(maskContactValue('carrier-pigeon', 'secret')).toBe('***');
    });
  });
});
