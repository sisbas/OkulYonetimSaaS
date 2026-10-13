import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { MAX_BULK_VERSIONS, NotificationOutboxRepository } from './notification-outbox.repository';

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

    const serverRows = [
      { id: input.expectedVersions[0].id, version: 0 },
      { id: input.expectedVersions[1].id, version: 0 },
    ];

    const updatedRows = [
      { id: input.expectedVersions[0].id, status: 'approved', version: 1 },
      { id: input.expectedVersions[1].id, status: 'approved', version: 1 },
    ];

    it('derives the server-side session set and updates every expected draft', async () => {
      const em = {
        query: jest.fn()
          .mockResolvedValueOnce(serverRows)
          .mockResolvedValueOnce([updatedRows, 2]),
      } as any;

      const result = await repository.transitionDraftsForSession(em, input);

      expect(result).toHaveLength(2);
      expect(result.every((row) => row.status === 'approved')).toBe(true);
      expect(em.query).toHaveBeenCalledTimes(2);
      expect(em.query.mock.calls[0][0]).toContain('FROM notification_outbox');
      expect(em.query.mock.calls[0][0]).toContain('LIMIT');
      expect(em.query.mock.calls[1][0]).toContain('unnest($4::uuid[], $5::int[])');
      expect(em.query.mock.calls[1][1]).toEqual([
        'approved',
        input.tenantId,
        input.sessionId,
        input.expectedVersions.map((v) => v.id),
        input.expectedVersions.map((v) => v.version),
        input.branchId,
        ['pending', 'blocked_consent'],
      ]);
    });

    it('rejects a truncated client list (page-size slice) with INCOMPLETE_LIST before any UPDATE', async () => {
      const em = {
        query: jest.fn().mockResolvedValueOnce(serverRows),
      } as any;

      await expect(
        repository.transitionDraftsForSession(em, {
          ...input,
          expectedVersions: [input.expectedVersions[0]],
        }),
      ).rejects.toThrow('NOTIFICATION_BULK_INCOMPLETE_LIST');
      expect(em.query).toHaveBeenCalledTimes(1);
    });

    it('rejects client ids missing from the server-side session set with INCOMPLETE_LIST', async () => {
      const em = {
        query: jest.fn().mockResolvedValueOnce([serverRows[0]]),
      } as any;

      await expect(
        repository.transitionDraftsForSession(em, {
          ...input,
          expectedVersions: input.expectedVersions,
        }),
      ).rejects.toThrow('NOTIFICATION_BULK_INCOMPLETE_LIST');
      expect(em.query).toHaveBeenCalledTimes(1);
    });

    it('rejects an oversized client version list before querying', async () => {
      const oversized = Array.from({ length: MAX_BULK_VERSIONS + 1 }, (_, index) => ({
        id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        version: 0,
      }));
      const em = { query: jest.fn() } as any;

      await expect(
        repository.transitionDraftsForSession(em, { ...input, expectedVersions: oversized }),
      ).rejects.toThrow('NOTIFICATION_BULK_VERSIONS_TOO_LARGE');
      expect(em.query).not.toHaveBeenCalled();
    });

    it('rejects duplicate ids in the client version list before querying', async () => {
      const em = { query: jest.fn() } as any;

      await expect(
        repository.transitionDraftsForSession(em, {
          ...input,
          expectedVersions: [input.expectedVersions[0], input.expectedVersions[0]],
        }),
      ).rejects.toThrow('NOTIFICATION_BULK_VERSIONS_DUPLICATE');
      expect(em.query).not.toHaveBeenCalled();
    });

    it('rejects a server-side session set above the bulk bound with SESSION_TOO_LARGE', async () => {
      const largeSet = Array.from({ length: MAX_BULK_VERSIONS + 1 }, (_, index) => ({
        id: `60000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        version: 0,
      }));
      const em = {
        query: jest.fn().mockResolvedValueOnce(largeSet),
      } as any;

      await expect(
        repository.transitionDraftsForSession(em, {
          ...input,
          expectedVersions: largeSet
            .slice(0, MAX_BULK_VERSIONS)
            .map((row) => ({ id: row.id, version: row.version })),
        }),
      ).rejects.toThrow('NOTIFICATION_BULK_SESSION_TOO_LARGE');
      expect(em.query).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException on stale version (all-or-nothing UPDATE guard)', async () => {
      const em = {
        query: jest.fn()
          .mockResolvedValueOnce(serverRows)
          .mockResolvedValueOnce([[], 0]),
      } as any;

      const error = await repository.transitionDraftsForSession(em, input).catch((e: Error) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toContain('version conflict');
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
});
