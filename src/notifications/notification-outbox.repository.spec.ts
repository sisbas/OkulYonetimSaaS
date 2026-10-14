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
        query: jest.fn().mockResolvedValue([
          [
            { id: input.expectedVersions[0].id, status: 'approved', version: 1 },
            { id: input.expectedVersions[1].id, status: 'approved', version: 1 },
          ],
          2,
        ]),
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
        query: jest.fn().mockResolvedValue([]),
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
  });
});