import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { NotificationOutboxRepository } from './notification-outbox.repository';

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

    it('updates every expected draft and returns rows', async () => {
      const em = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ pending: 2 }])
          .mockResolvedValueOnce([
            [
              { id: input.expectedVersions[0].id, status: 'approved', version: 1 },
              { id: input.expectedVersions[1].id, status: 'approved', version: 1 },
            ],
            2,
          ])
          .mockResolvedValueOnce([{ pending: 0 }]),
      } as any;

      const result = await repository.transitionDraftsForSession(em, input);

      expect(result).toHaveLength(2);
      expect(result.every((row) => row.status === 'approved')).toBe(true);
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
      const em = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ pending: 2 }])
          .mockResolvedValueOnce([]),
      } as any;

      await expect(repository.transitionDraftsForSession(em, input)).rejects.toBeInstanceOf(
        ConflictException,
      );
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

    it('rejects oversized batches instead of silently approving only a prefix (#464)', async () => {
      const em = { query: jest.fn() } as any;
      await expect(
        repository.transitionDraftsForSession(em, {
          ...input,
          expectedVersions: Array.from({ length: 201 }, (_, index) => ({
            id: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            version: 0,
          })),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(em.query).not.toHaveBeenCalled();
    });

    it('rejects a page-sized subset before touching any row (#464)', async () => {
      const em = { query: jest.fn().mockResolvedValueOnce([{ pending: 3 }]) } as any;

      await expect(repository.transitionDraftsForSession(em, input)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(em.query).toHaveBeenCalledTimes(1);
    });

    it('rolls back when a draft appears between the completeness check and the update (#464)', async () => {
      const em = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ pending: 2 }])
          .mockResolvedValueOnce([
            [
              { id: input.expectedVersions[0].id, status: 'approved', version: 1 },
              { id: input.expectedVersions[1].id, status: 'approved', version: 1 },
            ],
            2,
          ])
          .mockResolvedValueOnce([{ pending: 1 }]),
      } as any;

      await expect(repository.transitionDraftsForSession(em, input)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});