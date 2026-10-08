import { ConflictException, ForbiddenException } from '@nestjs/common';
import { SecurityAuditService } from '../common/audit/security-audit.service';
import { RequestContext } from '../common/context/request-context';
import { ConsentManagerService } from './consent-manager.service';

describe('ConsentManagerService', () => {
  let service: ConsentManagerService;
  let audit: jest.Mocked<SecurityAuditService>;

  const ctx: RequestContext = {
    requestId: 'test-req',
    tenantId: '10000000-0000-4000-8000-000000000001',
    branchId: '20000000-0000-4000-8000-000000000001',
    user: { userId: '90000000-0000-4000-8000-000000000001', tenantId: '10000000-0000-4000-8000-000000000001', roleIds: [], permissions: [] },
  };

  beforeEach(() => {
    audit = {
      emitDataProtectionEvent: jest.fn(),
      logger: { log: jest.fn() },
    } as unknown as jest.Mocked<SecurityAuditService>;
    service = new ConsentManagerService(audit);
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
        },
      ]);
    });

    it('throws when tenant scope is missing', async () => {
      await expect(
        service.listConsents({} as any, { requestId: 'r' } as RequestContext, 'student'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('revokeConsent', () => {
    it('revokes the latest approved row and emits dataprotection.consent.revoked', async () => {
      const em = {
        query: jest.fn().mockResolvedValue([
          { id: 'c1', consent_type: 'PARENT_NOTIFICATION', status: 'revoked', version: 2 },
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
        consentId: 'c1',
        subjectType: 'student',
        subjectRefId: '60000000-0000-4000-8000-000000000001',
        consentType: 'PARENT_NOTIFICATION',
        status: 'revoked',
        version: 2,
      });
      expect(audit.emitDataProtectionEvent).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ eventName: 'dataprotection.consent.revoked', purpose: 'notification_consent_authority_revoke' }),
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
      expect(audit.emitDataProtectionEvent).not.toHaveBeenCalled();
    });

    it('throws when tenant scope is missing', async () => {
      await expect(
        service.revokeConsent({} as any, { requestId: 'r' } as RequestContext, {
          subjectRefId: '60000000-0000-4000-8000-000000000001',
          subjectType: 'student',
          consentType: 'PARENT_NOTIFICATION',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});