import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { RequestContext } from '../common/context/request-context';
import {
  availableActionsFor,
  NotificationDispatchService,
} from './notification-dispatch.service';
import {
  backoffMsForAttempts,
  NotificationDispatchRepository,
  MAX_ATTEMPTS,
} from './notification-dispatch.repository';
import { NotificationSimulatorService } from './notification-simulator.service';

const ctx = { tenantId: 't1', branchId: 'b1' } as RequestContext;

const claimFixture = {
  id: 'o1',
  tenantId: 't1',
  studentId: 's1',
  channel: 'sms',
  eventType: 'attendance.absent.locked',
  snapshot: null,
  attempt: 1,
  fencingToken: 1,
  claimToken: 'c-1',
  version: 1,
};

describe('NotificationDispatchService', () => {
  let dataSource: jest.Mocked<Pick<DataSource, 'transaction'>>;
  let outbox: jest.Mocked<NotificationDispatchRepository>;
  let simulator: jest.Mocked<NotificationSimulatorService>;
  let service: NotificationDispatchService;
  let consent: { approved: boolean; reason: string | null; consentVersion: number | null };

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (cb: (em: EntityManager) => unknown) =>
        cb({} as EntityManager),
      ) as unknown as jest.Mocked<Pick<DataSource, 'transaction'>>['transaction'],
    } as jest.Mocked<Pick<DataSource, 'transaction'>>;
    outbox = {
      claim: jest.fn(),
      currentClaimBasis: jest.fn(),
      transitionToBlockedConsent: jest.fn(),
      applyOutcome: jest.fn(),
      insertReceipt: jest.fn(),
      findLatestReceipt: jest.fn(),
      findReceipts: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      rearmForRetry: jest.fn(),
      cancel: jest.fn(),
    } as unknown as jest.Mocked<NotificationDispatchRepository>;
    simulator = {
      simulate: jest.fn().mockReturnValue({
        outcome: 'provider_accepted',
        mode: 'accept',
        providerRef: 'sim:o1:1',
        errorCode: null,
      }),
    } as unknown as jest.Mocked<NotificationSimulatorService>;
    service = new NotificationDispatchService(
      dataSource as unknown as DataSource,
      outbox,
      simulator,
    );
    consent = { approved: true, reason: null, consentVersion: 2 };
    (service as unknown as { consentAuthority: unknown }).consentAuthority = {
      resolveNotificationConsent: jest
        .fn()
        .mockImplementation(async () => consent),
    };
  });

  describe('availableActionsFor (server-authoritative)', () => {
    it('maps every status to its allowed actions', () => {
      expect(availableActionsFor('pending')).toEqual(['approve', 'close']);
      expect(availableActionsFor('blocked_consent')).toEqual(['approve']);
      expect(availableActionsFor('approved')).toEqual(['execute', 'cancel']);
      expect(availableActionsFor('failed')).toEqual(['execute', 'cancel']);
      expect(availableActionsFor('dead_lettered')).toEqual(['retry', 'cancel']);
      expect(availableActionsFor('uncertain')).toEqual(['retry', 'cancel']);
      expect(availableActionsFor('dispatched')).toEqual([]);
      expect(availableActionsFor('cancelled')).toEqual([]);
      expect(availableActionsFor('closed')).toEqual([]);
    });
  });

  describe('backoffMsForAttempts', () => {
    it('grows exponentially from 5s and caps at 300s', () => {
      expect(backoffMsForAttempts(1)).toBe(5_000);
      expect(backoffMsForAttempts(2)).toBe(10_000);
      expect(backoffMsForAttempts(3)).toBe(20_000);
      expect(backoffMsForAttempts(20)).toBe(300_000);
      expect(MAX_ATTEMPTS).toBe(3);
    });
  });

  describe('execute', () => {
    it('happy path: claim → consent recheck → simulate → transition → receipt', async () => {
      outbox.claim.mockResolvedValue(claimFixture);
      outbox.applyOutcome.mockResolvedValue({ status: 'dispatched', version: 2 });
      outbox.insertReceipt.mockResolvedValue({ id: 'r1' } as never);

      const result = await service.execute(ctx, 'o1');

      expect(outbox.claim).toHaveBeenCalledWith(expect.anything(), {
        tenantId: 't1',
        id: 'o1',
      });
      expect(outbox.transitionToBlockedConsent).not.toHaveBeenCalled();
      expect(simulator.simulate).toHaveBeenCalledWith({
        outboxId: 'o1',
        attempt: 1,
        eventType: 'attendance.absent.locked',
        channel: 'sms',
      });
      expect(outbox.applyOutcome).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ claimToken: 'c-1', outcome: 'provider_accepted' }),
      );
      expect(result.status).toBe('dispatched');
      expect(result.idempotent).toBe(false);
      expect(result.receipt).toEqual({ id: 'r1' });
    });

    it('blocked at dispatch: no simulator call, no receipt, zero provider effect', async () => {
      consent = { approved: false, reason: 'blocked_consent', consentVersion: 2 };
      outbox.claim.mockResolvedValue(claimFixture);
      outbox.transitionToBlockedConsent.mockResolvedValue({ version: 2 });

      const result = await service.execute(ctx, 'o1');

      expect(simulator.simulate).not.toHaveBeenCalled();
      expect(outbox.applyOutcome).not.toHaveBeenCalled();
      expect(outbox.insertReceipt).not.toHaveBeenCalled();
      expect(result.status).toBe('blocked_consent');
      expect(result.reason).toBe('blocked_consent');
      expect(result.receipt).toBeNull();
    });

    it('idempotent: claim miss on dispatched row returns existing receipt (no new effect)', async () => {
      outbox.claim.mockResolvedValue(null);
      outbox.currentClaimBasis.mockResolvedValue({
        status: 'dispatched',
        version: 4,
        attempts: 1,
        claimActive: false,
        backoffUntil: new Date(),
      });
      outbox.findLatestReceipt.mockResolvedValue({ id: 'r1' } as never);

      const result = await service.execute(ctx, 'o1');

      expect(result.idempotent).toBe(true);
      expect(result.receipt).toEqual({ id: 'r1' });
      expect(simulator.simulate).not.toHaveBeenCalled();
      expect(outbox.insertReceipt).not.toHaveBeenCalled();
    });

    it('claim miss during active lease → CLAIM_ACTIVE conflict', async () => {
      outbox.claim.mockResolvedValue(null);
      outbox.currentClaimBasis.mockResolvedValue({
        status: 'approved',
        version: 1,
        attempts: 1,
        claimActive: true,
        backoffUntil: new Date(),
      });

      await expect(service.execute(ctx, 'o1')).rejects.toThrow(
        new ConflictException('CLAIM_ACTIVE:o1'),
      );
    });

    it('claim miss during backoff → BACKOFF_ACTIVE conflict', async () => {
      outbox.claim.mockResolvedValue(null);
      outbox.currentClaimBasis.mockResolvedValue({
        status: 'failed',
        version: 2,
        attempts: 1,
        claimActive: false,
        backoffUntil: new Date(Date.now() + 60_000),
      });

      await expect(service.execute(ctx, 'o1')).rejects.toThrow(
        new ConflictException('BACKOFF_ACTIVE:o1'),
      );
    });

    it('claim lost in tx2 (cancel race) → CLAIM_LOST conflict, receipt rolled back', async () => {
      outbox.claim.mockResolvedValue(claimFixture);
      outbox.applyOutcome.mockResolvedValue(null);

      await expect(service.execute(ctx, 'o1')).rejects.toThrow(
        new ConflictException('CLAIM_LOST:o1'),
      );
      expect(outbox.insertReceipt).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it('rearms dead_lettered rows preserving evidence', async () => {
      outbox.rearmForRetry.mockResolvedValue({ status: 'approved', version: 7 });
      const result = await service.retry(ctx, 'o1');
      expect(result).toEqual({ id: 'o1', status: 'approved', version: 7 });
    });

    it('rejects retry from non-retryable status', async () => {
      outbox.rearmForRetry.mockResolvedValue(null);
      outbox.currentClaimBasis.mockResolvedValue({
        status: 'dispatched',
        version: 4,
        attempts: 1,
        claimActive: false,
        backoffUntil: new Date(),
      });
      await expect(service.retry(ctx, 'o1')).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel', () => {
    it('cancels conditional on status', async () => {
      outbox.cancel.mockResolvedValue({ status: 'cancelled', version: 3 });
      const result = await service.cancel(ctx, 'o1');
      expect(result).toEqual({ id: 'o1', status: 'cancelled', version: 3 });
    });

    it('rejects cancel of a dispatched row', async () => {
      outbox.cancel.mockResolvedValue(null);
      outbox.currentClaimBasis.mockResolvedValue({
        status: 'dispatched',
        version: 4,
        attempts: 1,
        claimActive: false,
        backoffUntil: new Date(),
      });
      await expect(service.cancel(ctx, 'o1')).rejects.toThrow(ConflictException);
    });
  });

  describe('detail', () => {
    it('returns server-computed actions and gates receipts by permission', async () => {
      outbox.findById.mockResolvedValue({
        id: 'o1',
        status: 'approved',
        tenantId: 't1',
      } as never);

      const withPerm = await service.detail(ctx, 'o1', true);
      expect(withPerm.availableActions).toEqual(['execute', 'cancel']);
      expect(outbox.findReceipts).toHaveBeenCalled();

      const withoutPerm = await service.detail(ctx, 'o1', false);
      expect(withoutPerm.receipts).toEqual([]);
    });
  });
});
