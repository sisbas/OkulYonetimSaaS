import { AbsenceNotificationService } from './absence-notification.service';
import { NotificationOutboxRepository } from './notification-outbox.repository';

/**
 * Devamsızlık → outbox olayı (#266, #265 AC-6): yalnız LOCKED oturum,
 * idempotent dedupe anahtarı, KVKK onay kapısı ve PII'siz payload.
 */
describe('AbsenceNotificationService (#266)', () => {
  const TENANT_ID = '11111111-1111-4111-8111-111111111111';
  const SESSION_ID = '22222222-2222-4222-8222-222222222222';
  const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
  const STUDENT_A = '44444444-4444-4444-8444-444444444444';
  const STUDENT_B = '55555555-5555-4555-8555-555555555555';

  const outbox = {
    enqueueMany: jest.fn(async (_em: unknown, rows: unknown[]) => rows.length),
  } as unknown as NotificationOutboxRepository;

  function makeManager(handlers: {
    sessionStatus: string;
    absent: string[];
    consents: Array<Record<string, unknown>>;
  }) {
    return {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM attendance_sessions')) {
          return [{ status: handlers.sessionStatus }];
        }
        if (sql.includes('FROM attendance_records')) {
          return handlers.absent.map((student_id) => ({ student_id }));
        }
        if (sql.includes('FROM kvkk_consents')) {
          return handlers.consents;
        }
        return [];
      }),
    };
  }

  const approvedConsents = [
    {
      consent_type: 'parent_notification',
      status: 'approved',
      revoked_at: null,
      expires_at: null,
    },
    {
      consent_type: 'sms_notification',
      status: 'approved',
      revoked_at: null,
      expires_at: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (outbox.enqueueMany as jest.Mock).mockImplementation(
      async (_em: unknown, rows: unknown[]) => rows.length,
    );
  });

  it('does not enqueue anything when the session is not locked (fail-closed)', async () => {
    for (const status of ['draft', 'published']) {
      const manager = makeManager({
        sessionStatus: status,
        absent: [STUDENT_A],
        consents: [],
      });
      const service = new AbsenceNotificationService(outbox);

      const result = await service.enqueueLockedAbsenceNotifications(
        manager as never,
        { tenantId: TENANT_ID, sessionId: SESSION_ID, actorUserId: ACTOR_ID },
      );

      expect(result).toMatchObject({
        sessionStatus: status,
        insertedRows: 0,
        absentStudents: 0,
      });
      expect(outbox.enqueueMany).not.toHaveBeenCalled();
    }
  });

  it('enqueues one pending row per absent student with a stable dedupe key', async () => {
    const manager = makeManager({
      sessionStatus: 'locked',
      absent: [STUDENT_A, STUDENT_B],
      consents: approvedConsents,
    });
    const service = new AbsenceNotificationService(outbox);

    const result = await service.enqueueLockedAbsenceNotifications(
      manager as never,
      { tenantId: TENANT_ID, sessionId: SESSION_ID, actorUserId: ACTOR_ID },
    );

    expect(result).toMatchObject({
      sessionStatus: 'locked',
      absentStudents: 2,
      intendedPending: 2,
      intendedBlockedConsent: 0,
      insertedRows: 2,
      duplicatesSkipped: 0,
    });

    const rows = (outbox.enqueueMany as jest.Mock).mock.calls[0][1] as Array<
      Record<string, unknown>
    >;
    expect(rows.map((row) => row.dedupeKey)).toEqual([
      `attendance.absent:${SESSION_ID}:${STUDENT_A}`,
      `attendance.absent:${SESSION_ID}:${STUDENT_B}`,
    ]);
    expect(rows.every((row) => row.status === 'pending')).toBe(true);
    // KVKK: payload yalnız kimlik/kod taşır (isim, telefon, serbest metin yok).
    expect(JSON.stringify(rows[0].payloadMasked)).not.toMatch(/name|phone|notes|body/i);
    expect(rows[0].payloadMasked).toMatchObject({
      eventType: 'attendance.absent.locked',
      sessionId: SESSION_ID,
      studentId: STUDENT_A,
      status: 'absent',
      channel: 'sms',
    });
  });

  it('blocks enqueue when parent_notification consent is missing', async () => {
    const manager = makeManager({
      sessionStatus: 'locked',
      absent: [STUDENT_A],
      consents: [
        {
          consent_type: 'sms_notification',
          status: 'approved',
          revoked_at: null,
          expires_at: null,
        },
      ],
    });
    const service = new AbsenceNotificationService(outbox);

    const result = await service.enqueueLockedAbsenceNotifications(
      manager as never,
      { tenantId: TENANT_ID, sessionId: SESSION_ID, actorUserId: ACTOR_ID },
    );

    expect(result).toMatchObject({ intendedBlockedConsent: 1, intendedPending: 0 });
    const rows = (outbox.enqueueMany as jest.Mock).mock.calls[0][1] as Array<
      Record<string, unknown>
    >;
    expect(rows[0].status).toBe('blocked_consent');
    expect(rows[0].reason).toBe('blocked_consent');
  });

  it('blocks enqueue when the channel consent is revoked or expired', async () => {
    const manager = makeManager({
      sessionStatus: 'locked',
      absent: [STUDENT_A],
      consents: [
        {
          consent_type: 'parent_notification',
          status: 'approved',
          revoked_at: null,
          expires_at: null,
        },
        {
          consent_type: 'sms_notification',
          status: 'approved',
          revoked_at: new Date('2026-01-01T00:00:00.000Z'),
          expires_at: null,
        },
      ],
    });
    const service = new AbsenceNotificationService(outbox);

    const result = await service.enqueueLockedAbsenceNotifications(
      manager as never,
      { tenantId: TENANT_ID, sessionId: SESSION_ID, actorUserId: ACTOR_ID },
    );

    expect(result).toMatchObject({ intendedBlockedConsent: 1 });
    const rows = (outbox.enqueueMany as jest.Mock).mock.calls[0][1] as Array<
      Record<string, unknown>
    >;
    expect(rows[0].reason).toBe('blocked_channel_consent');
  });

  it('reports duplicates as skipped (idempotent re-processing)', async () => {
    (outbox.enqueueMany as jest.Mock).mockResolvedValue(0);
    const manager = makeManager({
      sessionStatus: 'locked',
      absent: [STUDENT_A],
      consents: approvedConsents,
    });
    const service = new AbsenceNotificationService(outbox);

    const result = await service.enqueueLockedAbsenceNotifications(
      manager as never,
      { tenantId: TENANT_ID, sessionId: SESSION_ID, actorUserId: ACTOR_ID },
    );

    expect(result).toMatchObject({
      insertedRows: 0,
      duplicatesSkipped: 1,
      intendedPending: 1,
    });
  });
});
