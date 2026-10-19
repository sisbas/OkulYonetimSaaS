import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RequestContext } from '../common/context/request-context';
import { TransactionalAuditWriter } from '../common/audit/transactional-audit-writer';
import { ConsentManagerService } from './consent-manager.service';

describe('ConsentManagerService', () => {
  let service: ConsentManagerService;
  let audit: { write: jest.Mock };

  const CONSENT_ID = 'c1000000-0000-4000-8000-000000000001';
  const ACTOR_USER_ID = '90000000-0000-4000-8000-000000000001';

  const ctx: RequestContext = {
    requestId: 'test-req',
    tenantId: '10000000-0000-4000-8000-000000000001',
    branchId: '20000000-0000-4000-8000-000000000001',
    userId: ACTOR_USER_ID,
    user: { userId: ACTOR_USER_ID, tenantId: '10000000-0000-4000-8000-000000000001', roleIds: [], permissions: [] },
  };

  beforeEach(() => {
    audit = { write: jest.fn().mockResolvedValue(undefined) };
    service = new ConsentManagerService(audit as unknown as TransactionalAuditWriter);
  });

  describe('listConsents', () => {
    it('selects tenant-scoped consent rows and maps snapshots without PII', async () => {
      const em = {
        query: jest.fn().mockResolvedValue([
          {
            consent_id: 'c1',
            subject_type: 'student',
            subject_ref_id: '60000000-0000-4000-8000-000000000001',
            consent_type: 'PARENT_NOTIFICATION',
            status: 'approved',
            version: 1,
            revoked_at: null,
            expires_at: null,
            created_at: new Date('2026-10-05T12:00:00Z'),
            legal_basis: 'consent',
            retention_days: 3650,
          },
        ]),
      } as any;

      const result = await service.listConsents(em, ctx, 'student');

      expect(em.query).toHaveBeenCalledWith(
        expect.stringContaining('kvkk_consents'),
        [ctx.tenantId, 'student'],
      );
      expect(result).toEqual([
        {
          consentId: 'c1',
          subjectType: 'student',
          subjectRefId: '60000000-0000-4000-8000-000000000001',
          consentType: 'PARENT_NOTIFICATION',
          status: 'approved',
          version: 1,
          revokedAt: null,
          expiresAt: null,
          createdAt: '2026-10-05T12:00:00.000Z',
          legalBasis: 'consent',
          retentionDays: 3650,
        },
      ]);
      // PR #414 Q7: hassas consent yüzeyine dayanıklı okuma audit'i (aynı transaction).
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(audit.write).toHaveBeenCalledWith(
        em,
        'dataprotection.consent.read',
        expect.objectContaining({
          schemaVersion: 1,
          tenantId: ctx.tenantId,
          actorUserId: ACTOR_USER_ID,
          entityType: 'dataprotection',
          entityId: ctx.tenantId,
          result: 'success',
          changedFields: [],
          redactionReceipt: expect.objectContaining({
            strategy: 'none',
            redactedFieldCount: 0,
          }),
        }),
      );
    });

    it('throws when tenant scope is missing', async () => {
      await expect(
        service.listConsents({} as any, { requestId: 'r' } as RequestContext, 'student'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('revokeConsent', () => {
    it('revokes the latest approved row and writes dataprotection.consent.revoked in the same transaction', async () => {
      const em = {
        query: jest.fn().mockResolvedValue([
          [{ id: CONSENT_ID, consent_type: 'PARENT_NOTIFICATION', status: 'revoked', version: 2 }],
          1,
        ]),
      } as any;

      const result = await service.revokeConsent(em, ctx, {
        subjectRefId: '60000000-0000-4000-8000-000000000001',
        subjectType: 'student',
        consentType: 'PARENT_NOTIFICATION',
      });

      expect(em.query).toHaveBeenCalledWith(
        expect.stringContaining('status = \'revoked\''),
        [ctx.tenantId, '60000000-0000-4000-8000-000000000001', 'student', 'PARENT_NOTIFICATION'],
      );
      expect(result).toEqual({
        consentId: CONSENT_ID,
        subjectType: 'student',
        subjectRefId: '60000000-0000-4000-8000-000000000001',
        consentType: 'PARENT_NOTIFICATION',
        status: 'revoked',
        version: 2,
      });
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(audit.write).toHaveBeenCalledWith(
        em,
        'dataprotection.consent.revoked',
        expect.objectContaining({
          schemaVersion: 1,
          tenantId: ctx.tenantId,
          actorUserId: ACTOR_USER_ID,
          actorSessionId: null,
          requestId: 'test-req',
          entityType: 'dataprotection',
          entityId: CONSENT_ID,
          result: 'success',
          // PR #414 K-19: revoke'un GERÇEKTE değiştirdiği kolonlar, gerçek kolon
          // adlarıyla (dürüst kanıt): status, revoked_at, updated_at, version.
          changedFields: ['status', 'revoked_at', 'updated_at', 'version'],
          redactionReceipt: expect.objectContaining({
            strategy: 'none',
            evaluatedFieldCount: 9,
            redactedFieldCount: 0,
            skippedFieldCount: 9,
          }),
        }),
      );
    });

    it('throws ConflictException when no approved row is updated', async () => {
      const em = { query: jest.fn().mockResolvedValue([]) } as any;
      await expect(
        service.revokeConsent(em, ctx, {
          subjectRefId: '60000000-0000-4000-8000-000000000001',
          subjectType: 'student',
          consentType: 'PARENT_NOTIFICATION',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the UPDATE matches no row ([rows, rowCount] driver tuple)', async () => {
      const em = { query: jest.fn().mockResolvedValue([[], 0]) } as any;
      await expect(
        service.revokeConsent(em, ctx, {
          subjectRefId: '60000000-0000-4000-8000-000000000001',
          subjectType: 'student',
          consentType: 'PARENT_NOTIFICATION',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('propagates an audit write failure so the revoke cannot outlive its audit record', async () => {
      const em = {
        query: jest.fn().mockResolvedValue([
          [{ id: CONSENT_ID, consent_type: 'PARENT_NOTIFICATION', status: 'revoked', version: 2 }],
          1,
        ]),
      } as any;
      audit.write.mockRejectedValueOnce(new Error('audit chain unavailable'));

      await expect(
        service.revokeConsent(em, ctx, {
          subjectRefId: '60000000-0000-4000-8000-000000000001',
          subjectType: 'student',
          consentType: 'PARENT_NOTIFICATION',
        }),
      ).rejects.toThrow('audit chain unavailable');
    });

    it('throws when tenant scope is missing', async () => {
      await expect(
        service.revokeConsent({} as any, { requestId: 'r' } as RequestContext, {
          subjectRefId: '60000000-0000-4000-8000-000000000001',
          subjectType: 'student',
          consentType: 'PARENT_NOTIFICATION',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(audit.write).not.toHaveBeenCalled();
    });
  });
});