import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { NotificationOutboxRepository } from './notification-outbox.repository';

const APPROVED_CONSENTS = [
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

function emFor(input: {
  pending: Array<Record<string, unknown>>;
  updated: unknown;
  consents?: Array<Record<string, unknown>>;
}) {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE OF o')) return input.pending;
      if (sql.includes('FROM kvkk_consents')) return input.consents ?? APPROVED_CONSENTS;
      return input.updated;
    }),
  } as any;
}

describe('NotificationOutboxRepository', () => {
  let repository: NotificationOutboxRepository;

  beforeEach(() => {
    repository = new NotificationOutboxRepository();
  });

  describe('transitionDraftsForSession', () => {
    const input = {
      tenantId: '10000000-0000-4000-8000-000000000001',
      branchId: '20000000-0000-4000-8000-000000000001',
      sessionId: '30000000-0000-4000-8000-000000000001',
      targetStatus: 'approved' as const,
      expectedVersions: [
        { id: '40000000-0000-4000-8000-000000000001', version: 0 },
        { id: '40000000-0000-4000-8000-000000000002', version: 0 },
      ],
    };

    it('re-checks consent and updates every expected draft', async () => {
      const em = emFor({
        pending: input.expectedVersions.map((row) => ({
          id: row.id,
          studentId: '50000000-0000-4000-8000-000000000001',
          channel: 'sms',
        })),
        updated: [
          [
            { id: input.expectedVersions[0].id, status: 'approved', version: 1 },
            { id: input.expectedVersions[1].id, status: 'approved', version: 1 },
          ],
          2,
        ],
      });

      const result = await repository.transitionDraftsForSession(em, input);

      expect(result).toHaveLength(2);
      expect(result.every((row) => row.status === 'approved')).toBe(true);
      expect(em.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE OF o'),
        [
          input.tenantId,
          input.sessionId,
          input.expectedVersions.map((v) => v.id),
          input.expectedVersions.map((v) => v.version),
          input.branchId,
          ['pending', 'blocked_consent'],
        ],
      );
      // Consent authority her satır için bir kez çalışır.
      expect(
        em.query.mock.calls.filter(([sql]: [string]) => sql.includes('FROM kvkk_consents')),
      ).toHaveLength(2);
      expect(em.query).toHaveBeenCalledWith(
        expect.stringContaining('unnest($4::uuid[], $5::int[])'),
        [
          'approved',
          input.tenantId,
          input.sessionId,
          input.expectedVersions.map((v) => v.id),
          input.expectedVersions.map((v) => v.version),
          input.branchId,
          ['pending', 'blocked_consent'],
        ],
      );
    });

    it('throws ConflictException on version mismatch (all-or-nothing)', async () => {
      const em = emFor({ pending: [], updated: [] });

      await expect(repository.transitionDraftsForSession(em, input)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses bulk approval when current consent is not approved', async () => {
      const em = emFor({
        pending: input.expectedVersions.map((row) => ({
          id: row.id,
          studentId: '50000000-0000-4000-8000-000000000001',
          channel: 'sms',
        })),
        consents: [
          {
            consent_type: 'parent_notification',
            status: 'revoked',
            revoked_at: new Date('2026-10-01T00:00:00Z'),
            expires_at: null,
            version: 2,
          },
        ],
        updated: [
          [
            { id: input.expectedVersions[0].id, status: 'approved', version: 1 },
            { id: input.expectedVersions[1].id, status: 'approved', version: 1 },
          ],
          2,
        ],
      });

      await expect(repository.transitionDraftsForSession(em, input)).rejects.toMatchObject({
        response: { code: 'NOTIFICATION_CONSENT_REQUIRED', reason: 'blocked_consent' },
      });
      expect(
        em.query.mock.calls.some(([sql]: [string]) => sql.includes('UPDATE notification_outbox')),
      ).toBe(false);
    });

    it('rejects empty expectedVersions', async () => {
      await expect(
        repository.transitionDraftsForSession({} as any, { ...input, expectedVersions: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException when tenant/branch/session scope is missing', async () => {
      await expect(
        repository.transitionDraftsForSession({} as any, { ...input, tenantId: '  ' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('transitionDraft', () => {
    const input = {
      tenantId: '10000000-0000-4000-8000-000000000001',
      branchId: '20000000-0000-4000-8000-000000000001',
      id: '40000000-0000-4000-8000-000000000001',
      expectedVersion: 0,
    };

    it('re-checks consent before approving a single draft', async () => {
      const em = emFor({
        pending: [{
          id: input.id,
          studentId: '50000000-0000-4000-8000-000000000001',
          channel: 'sms',
        }],
        updated: [[{ id: input.id, status: 'approved', version: 1 }], 1],
      });

      const result = await repository.transitionDraft(em, { ...input, targetStatus: 'approved' });

      expect(result).toEqual({ id: input.id, status: 'approved', version: 1 });
      expect(em.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM kvkk_consents'),
        expect.anything(),
      );
    });

    it('refuses a single approval when channel consent is missing', async () => {
      const em = emFor({
        pending: [{
          id: input.id,
          studentId: '50000000-0000-4000-8000-000000000001',
          channel: 'sms',
        }],
        consents: [
          {
            consent_type: 'parent_notification',
            status: 'approved',
            revoked_at: null,
            expires_at: null,
          },
        ],
        updated: [[{ id: input.id, status: 'approved', version: 1 }], 1],
      });

      await expect(
        repository.transitionDraft(em, { ...input, targetStatus: 'approved' }),
      ).rejects.toMatchObject({
        response: { code: 'NOTIFICATION_CONSENT_REQUIRED', reason: 'blocked_channel_consent' },
      });
      expect(
        em.query.mock.calls.some(([sql]: [string]) => sql.includes('UPDATE notification_outbox')),
      ).toBe(false);
    });

    it('does not consult consent when closing a draft', async () => {
      const em = emFor({
        pending: [],
        updated: [[{ id: input.id, status: 'closed', version: 1 }], 1],
      });

      await repository.transitionDraft(em, { ...input, targetStatus: 'closed' });

      expect(
        em.query.mock.calls.some(([sql]: [string]) => sql.includes('FROM kvkk_consents')),
      ).toBe(false);
    });
  });
});
