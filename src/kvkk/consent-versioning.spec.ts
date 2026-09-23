import {
  CHANNEL_CONSENT_TYPE,
  CONSENT_GATED_CHANNELS,
  ConsentRowSnapshot,
  NOTIFICATION_CONSENT_TYPES,
  describeConsentLifecycle,
  evaluateNotificationConsent,
  governingConsent,
  isConsentActiveAt,
  summarizeNotificationChannels,
} from './consent-versioning';

/**
 * #266 R5 — Sürüm bazlı onay kararı (#266 AC: "consent geri çekilince kanal
 * kullanılamaz", "consent versiyonu izlenebilir").
 */
describe('consent-versioning (#266 R5)', () => {
  const NOW = new Date('2026-09-23T12:00:00.000Z');

  const row = (overrides: Partial<ConsentRowSnapshot> = {}): ConsentRowSnapshot => ({
    consentType: 'parent_notification',
    version: 1,
    status: 'approved',
    revokedAt: null,
    expiresAt: null,
    ...overrides,
  });

  describe('isConsentActiveAt', () => {
    it('requires approved status without revocation or expiry', () => {
      expect(isConsentActiveAt(row(), NOW)).toBe(true);
      expect(isConsentActiveAt(row({ status: 'pending' }), NOW)).toBe(false);
      expect(isConsentActiveAt(row({ status: 'rejected' }), NOW)).toBe(false);
      expect(isConsentActiveAt(row({ revokedAt: new Date('2026-09-01T00:00:00.000Z') }), NOW)).toBe(false);
    });

    it('treats an expiry at or before now as inactive (fail-closed boundary)', () => {
      expect(isConsentActiveAt(row({ expiresAt: new Date(NOW) }), NOW)).toBe(false);
      expect(isConsentActiveAt(row({ expiresAt: new Date('2026-09-23T11:59:59.000Z') }), NOW)).toBe(false);
      expect(isConsentActiveAt(row({ expiresAt: new Date('2026-09-23T12:00:01.000Z') }), NOW)).toBe(true);
    });

    it('rejects rows whose version is not a positive integer', () => {
      expect(isConsentActiveAt(row({ version: Number.NaN }), NOW)).toBe(false);
      expect(isConsentActiveAt(row({ version: 0 }), NOW)).toBe(false);
      expect(isConsentActiveAt(row({ version: 1.5 }), NOW)).toBe(false);
    });
  });

  describe('governingConsent', () => {
    it('selects the highest version as the governing row', () => {
      const decision = governingConsent(
        [row({ version: 1 }), row({ version: 3, status: 'pending' }), row({ version: 2 })],
        'parent_notification',
        NOW,
      );

      expect(decision.latest?.version).toBe(3);
      expect(decision.active).toBe(false);
      expect(decision.ambiguous).toBe(false);
    });

    it('fails closed when two rows share the highest version with conflicting states', () => {
      const decision = governingConsent(
        [row({ version: 2 }), row({ version: 2, revokedAt: new Date('2026-09-01T00:00:00.000Z') })],
        'parent_notification',
        NOW,
      );

      expect(decision.ambiguous).toBe(true);
      expect(decision.active).toBe(false);
    });

    it('fails closed when a row carries an invalid version', () => {
      const decision = governingConsent(
        [row({ version: Number.NaN })],
        'parent_notification',
        NOW,
      );

      expect(decision.ambiguous).toBe(true);
      expect(decision.active).toBe(false);
    });

    it('returns an empty decision when the type has no rows', () => {
      const decision = governingConsent([], 'parent_notification', NOW);
      expect(decision).toMatchObject({ latest: null, active: false, ambiguous: false });
    });
  });

  describe('evaluateNotificationConsent', () => {
    it('allows the channel when parent and channel consents are active, tracing the parent version', () => {
      const decision = evaluateNotificationConsent({
        rows: [
          row({ consentType: 'parent_notification', version: 4 }),
          row({ consentType: 'sms_notification', version: 2 }),
        ],
        channel: 'sms',
        now: NOW,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBeNull();
      expect(decision.consentVersion).toBe(4);
      expect(decision.versions).toEqual({ parentNotification: 4, channelNotification: 2 });
      expect(decision.ambiguous).toBe(false);
    });

    it('keeps the channel blocked when the governing version is revoked even though an older version is approved', () => {
      const decision = evaluateNotificationConsent({
        rows: [
          row({ consentType: 'parent_notification', version: 1 }),
          row({
            consentType: 'parent_notification',
            version: 2,
            status: 'revoked',
            revokedAt: new Date('2026-09-20T00:00:00.000Z'),
          }),
          row({ consentType: 'sms_notification', version: 1 }),
        ],
        channel: 'sms',
        now: NOW,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('blocked_consent');
      expect(decision.consentVersion).toBe(2);
      expect(isConsentActiveAt(row({ version: 1 }), NOW)).toBe(true);
    });

    it('blocks with blocked_consent and a null trace when no consent row exists at all', () => {
      const decision = evaluateNotificationConsent({ rows: [], channel: 'sms', now: NOW });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('blocked_consent');
      expect(decision.consentVersion).toBeNull();
      expect(decision.versions).toEqual({ parentNotification: null, channelNotification: null });
    });

    it('blocks with blocked_channel_consent and traces the channel version when only the channel consent is withdrawn', () => {
      const decision = evaluateNotificationConsent({
        rows: [
          row({ consentType: 'parent_notification', version: 3 }),
          row({
            consentType: 'whatsapp_notification',
            version: 5,
            status: 'revoked',
            revokedAt: new Date('2026-09-22T00:00:00.000Z'),
          }),
        ],
        channel: 'whatsapp',
        now: NOW,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('blocked_channel_consent');
      expect(decision.consentVersion).toBe(5);
    });

    it('blocks the channel when its governing version is expired', () => {
      const decision = evaluateNotificationConsent({
        rows: [
          row({ consentType: 'parent_notification', version: 1 }),
          row({
            consentType: 'email_notification',
            version: 1,
            expiresAt: new Date('2026-09-01T00:00:00.000Z'),
          }),
        ],
        channel: 'email',
        now: NOW,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('blocked_channel_consent');
    });

    it('does not require a channel consent for channels outside the gate matrix', () => {
      const decision = evaluateNotificationConsent({
        rows: [row({ consentType: 'parent_notification', version: 1 })],
        channel: 'pigeon',
        now: NOW,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.versions.channelNotification).toBeNull();
    });

    it('propagates ambiguity from either gate as a blocking decision', () => {
      const decision = evaluateNotificationConsent({
        rows: [
          row({ consentType: 'parent_notification', version: 2 }),
          row({ consentType: 'parent_notification', version: 2, status: 'pending' }),
        ],
        channel: 'sms',
        now: NOW,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.ambiguous).toBe(true);
      expect(decision.reason).toBe('blocked_consent');
    });
  });

  describe('summarizeNotificationChannels', () => {
    it('reports one decision per gated channel using the same gate as delivery', () => {
      const summary = summarizeNotificationChannels(
        [
          row({ consentType: 'parent_notification', version: 7 }),
          row({ consentType: 'sms_notification', version: 1 }),
        ],
        NOW,
      );

      expect(Object.keys(summary).sort()).toEqual([...CONSENT_GATED_CHANNELS].sort());
      expect(summary.sms).toMatchObject({ allowed: true, consentVersion: 7 });
      expect(summary.whatsapp).toMatchObject({ allowed: false, reason: 'blocked_channel_consent' });
      expect(summary.email).toMatchObject({ allowed: false, reason: 'blocked_channel_consent' });
    });
  });

  describe('describeConsentLifecycle', () => {
    it('labels active, revoked, expired, not_approved and invalid rows', () => {
      expect(describeConsentLifecycle(row(), NOW)).toBe('active');
      expect(describeConsentLifecycle(row({ revokedAt: new Date('2026-09-01T00:00:00.000Z') }), NOW)).toBe('revoked');
      expect(describeConsentLifecycle(row({ expiresAt: new Date('2026-09-01T00:00:00.000Z') }), NOW)).toBe('expired');
      expect(describeConsentLifecycle(row({ status: 'pending' }), NOW)).toBe('not_approved');
      expect(describeConsentLifecycle(row({ version: 0 }), NOW)).toBe('invalid');
    });
  });

  it('keeps the closed consent-type and channel dictionaries stable', () => {
    expect([...NOTIFICATION_CONSENT_TYPES]).toEqual([
      'parent_notification',
      'sms_notification',
      'whatsapp_notification',
      'email_notification',
    ]);
    expect(CHANNEL_CONSENT_TYPE).toEqual({
      sms: 'sms_notification',
      whatsapp: 'whatsapp_notification',
      email: 'email_notification',
    });
  });
});
