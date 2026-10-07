import { NotificationDraftService } from './notification-draft.service';
import {
  NotificationOutboxRepository,
  NotificationDraftRow,
} from './notification-outbox.repository';
import { RequestContext } from '../common/context/request-context';

describe('NotificationDraftService', () => {
  let service: NotificationDraftService;
  let outbox: jest.Mocked<NotificationOutboxRepository>;

  const ctx: RequestContext = {
    requestId: 'test-req',
    tenantId: '10000000-0000-4000-8000-000000000001',
    branchId: '20000000-0000-4000-8000-000000000001',
  };

  const tenantId = ctx.tenantId!;

  const mockDraft: NotificationDraftRow = {
    id: 'draft-1',
    tenantId: '10000000-0000-4000-8000-000000000001',
    dedupeKey: 'attendance.absent:session:student',
    eventType: 'attendance.absent.locked',
    channel: 'sms',
    status: 'pending',
    payloadMasked: { eventType: 'attendance.absent.locked' },
    reason: null,
    consentVersion: 1,
    snapshot: {
      source: { sessionRef: 'p1:session:abc', studentRef: 'p1:student:def' },
      contact: { channel: 'sms', maskedDisplay: null, verificationStatus: null },
      consent: { approved: true, reason: null, consentId: 'c1', consentVersion: 1 },
      template: { eventType: 'attendance.absent.locked', channel: 'sms', templateRef: 'attendance.absent.locked:sms' },
      enqueuedAt: '2026-10-05T12:00:00.000Z',
    },
    version: 0,
    availableAt: new Date('2026-10-05T12:00:00Z'),
    createdAt: new Date('2026-10-05T12:00:00Z'),
  };

  beforeEach(() => {
    outbox = {
      findDrafts: jest.fn(),
      findDraftById: jest.fn(),
      transitionDraft: jest.fn(),
    } as unknown as jest.Mocked<NotificationOutboxRepository>;
    service = new NotificationDraftService(outbox);
  });

  describe('listDrafts', () => {
    it('delegates to outbox.findDrafts with context and pagination', async () => {
      outbox.findDrafts.mockResolvedValue([mockDraft]);
      const result = await service.listDrafts({} as any, ctx, 20, 0);
      expect(outbox.findDrafts).toHaveBeenCalledWith({}, ctx, 20, 0);
      expect(result).toEqual([mockDraft]);
    });

    it('defaults offset to 0', async () => {
      outbox.findDrafts.mockResolvedValue([]);
      await service.listDrafts({} as any, ctx, 10);
      expect(outbox.findDrafts).toHaveBeenCalledWith({}, ctx, 10, 0);
    });
  });

  describe('getDraft', () => {
    it('delegates to outbox.findDraftById', async () => {
      outbox.findDraftById.mockResolvedValue(mockDraft);
      const result = await service.getDraft({} as any, ctx, 'draft-1');
      expect(outbox.findDraftById).toHaveBeenCalledWith({}, ctx, 'draft-1');
      expect(result).toEqual(mockDraft);
    });

    it('returns null when not found', async () => {
      outbox.findDraftById.mockResolvedValue(null);
      const result = await service.getDraft({} as any, ctx, 'missing');
      expect(result).toBeNull();
    });
  });

  describe('approveDraft', () => {
    it('transitions to approved with optimistic concurrency', async () => {
      outbox.transitionDraft.mockResolvedValue({ id: 'draft-1', status: 'approved', version: 1 });
      const result = await service.approveDraft({} as any, {
        tenantId,
        branchId: ctx.branchId!,
        id: 'draft-1',
        expectedVersion: 0,
      });
      expect(outbox.transitionDraft).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          tenantId,
          branchId: ctx.branchId,
          id: 'draft-1',
          targetStatus: 'approved',
          expectedVersion: 0,
        }),
      );
      expect(result.status).toBe('approved');
    });
  });

  describe('closeDraft', () => {
    it('transitions to closed with optimistic concurrency', async () => {
      outbox.transitionDraft.mockResolvedValue({ id: 'draft-1', status: 'closed', version: 1 });
      const result = await service.closeDraft({} as any, {
        tenantId,
        branchId: ctx.branchId!,
        id: 'draft-1',
        expectedVersion: 0,
      });
      expect(outbox.transitionDraft).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          tenantId,
          branchId: ctx.branchId,
          id: 'draft-1',
          targetStatus: 'closed',
          expectedVersion: 0,
        }),
      );
      expect(result.status).toBe('closed');
    });
  });
});
