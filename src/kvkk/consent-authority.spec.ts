import { ConsentAuthority } from './consent-authority';

/**
 * Authoritative versioned consent authority (#266 N1b):
 * özne başına `(consent_type)` bazında **en yüksek version**'lı
 * satır güncel karardır; resurrection (geçmiş onay satırının
 * yeni iptal karşısında onay vermesi) engellenir.
 */
describe('ConsentAuthority (#266 N1b)', () => {
  const TENANT_ID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_ID = '44444444-4444-4444-8444-444444444444';
  const PARENT_ID = '66666666-6666-4666-8666-666666666666';
  const REVOKED_ID = '77777777-7777-4777-8777-777777777777';
  const SMS_ID = '88888888-8888-4888-8888-888888888888';

  function makeManager(rows: Array<Record<string, unknown>>) {
    return {
      query: jest.fn(async () => rows),
    } as never;
  }

  function makeRow(
    id: string,
    consentType: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      consent_type: consentType,
      status: 'approved',
      revoked_at: null,
      expires_at: null,
      version: 1,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  const subject = {
    tenantId: TENANT_ID,
    subjectType: 'student' as const,
    subjectRefId: STUDENT_ID,
  };

  it('approves when the current parent and channel consents are active', async () => {
    const authority = new ConsentAuthority();
    const decision = await authority.resolveNotificationConsent(
      makeManager([makeRow(PARENT_ID, 'parent_notification'), makeRow(SMS_ID, 'sms_notification')]),
      { subject, channel: 'sms' },
    );

    expect(decision).toEqual({
      approved: true,
      reason: null,
      consentId: PARENT_ID,
      consentVersion: 1,
    });
  });

  it('does not resurrect consent: the max-version row wins (revoked v2 over approved v1)', async () => {
    const authority = new ConsentAuthority();
    const decision = await authority.resolveNotificationConsent(
      makeManager([
        makeRow(PARENT_ID, 'parent_notification', { version: 1 }),
        makeRow(REVOKED_ID, 'parent_notification', {
          status: 'revoked',
          revoked_at: new Date('2026-02-01T00:00:00.000Z'),
          version: 2,
          created_at: new Date('2026-02-01T00:00:00.000Z'),
        }),
        makeRow(SMS_ID, 'sms_notification'),
      ]),
      { subject, channel: 'sms' },
    );

    expect(decision).toEqual({
      approved: false,
      reason: 'blocked_consent',
      consentId: REVOKED_ID,
      consentVersion: 2,
    });
  });

  it('rejects when the current consent is expired', async () => {
    const authority = new ConsentAuthority();
    const decision = await authority.resolveNotificationConsent(
      makeManager([
        makeRow(PARENT_ID, 'parent_notification', {
          expires_at: new Date('2020-01-01T00:00:00.000Z'),
        }),
        makeRow(SMS_ID, 'sms_notification'),
      ]),
      { subject, channel: 'sms' },
    );

    expect(decision.approved).toBe(false);
    expect(decision.reason).toBe('blocked_consent');
  });

  it('blocks when the channel consent is missing or revoked', async () => {
    const authority = new ConsentAuthority();

    const missing = await authority.resolveNotificationConsent(
      makeManager([makeRow(PARENT_ID, 'parent_notification')]),
      { subject, channel: 'sms' },
    );
    expect(missing).toMatchObject({ approved: false, reason: 'blocked_channel_consent' });

    const revoked = await authority.resolveNotificationConsent(
      makeManager([
        makeRow(PARENT_ID, 'parent_notification'),
        makeRow(SMS_ID, 'sms_notification', {
          status: 'revoked',
          revoked_at: new Date('2026-02-01T00:00:00.000Z'),
        }),
      ]),
      { subject, channel: 'sms' },
    );
    expect(revoked).toMatchObject({ approved: false, reason: 'blocked_channel_consent' });
  });

  it('requires only parent_notification for an unmapped channel', async () => {
    const authority = new ConsentAuthority();
    const decision = await authority.resolveNotificationConsent(
      makeManager([makeRow(PARENT_ID, 'parent_notification')]),
      { subject, channel: 'paper' },
    );

    expect(decision).toMatchObject({ approved: true, reason: null });
  });

  it('fails closed when no consent rows exist', async () => {
    const authority = new ConsentAuthority();
    const decision = await authority.resolveNotificationConsent(
      makeManager([]),
      { subject, channel: 'sms' },
    );

    expect(decision).toEqual({
      approved: false,
      reason: 'blocked_consent',
      consentId: null,
      consentVersion: null,
    });
  });

  it('scopes the query by tenant, subject ref and subject type', async () => {
    const queryMock = jest.fn(
      async (_sql: string, _params: unknown[]) => [],
    );
    const manager = { query: queryMock } as never;
    const authority = new ConsentAuthority();
    await authority.resolveNotificationConsent(manager, {
      subject,
      channel: 'sms',
    });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('kvkk_consents');
    expect(sql).toContain('kvkk_consent_subjects');
    expect(params).toEqual([TENANT_ID, STUDENT_ID, 'student', 'sms_notification']);
  });

  it('breaks same-version ties by created_at then id', async () => {
    const authority = new ConsentAuthority();
    const older = makeRow(PARENT_ID, 'parent_notification', {
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
    const newer = makeRow(SMS_ID, 'parent_notification', {
      created_at: new Date('2026-01-02T00:00:00.000Z'),
    });

    const byDate = await authority.resolveNotificationConsent(
      makeManager([older, newer]),
      { subject, channel: 'paper' },
    );
    expect(byDate.consentId).toBe(SMS_ID);

    const tieA = makeRow('aaaa0000-0000-4000-8000-00000000000a', 'parent_notification', {
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
    const tieB = makeRow('bbbb0000-0000-4000-8000-00000000000b', 'parent_notification', {
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
    const byId = await authority.resolveNotificationConsent(
      makeManager([tieA, tieB]),
      { subject, channel: 'paper' },
    );
    expect(byId.consentId).toBe('bbbb0000-0000-4000-8000-00000000000b');
  });
});
