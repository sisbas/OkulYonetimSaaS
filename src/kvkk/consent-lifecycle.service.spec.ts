import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { auditSubjectRefUuid } from './consent-audit-reference';
import { ConsentLifecycleService } from './consent-lifecycle.service';

/**
 * #266 R5 — Consent yaşam döngüsü servisi: hassas okuma (maskeleme + durable
 * audit), geri çekme (withdrawable, tek transaction) ve tenant izolasyonu.
 */
describe('ConsentLifecycleService (#266 R5)', () => {
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '99999999-9999-4999-8999-999999999999';
  const STUDENT_A = '44444444-4444-4444-8444-444444444444';
  const CONSENT_ID = '66666666-6666-4666-8666-666666666666';
  const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
  const RAW_PHONE = '+905551112233';
  const MASKED_PHONE = '+9*********33';
  const MASKED_EMAIL = 'a***@***.com';
  const ACTOR = {
    actorUserId: ACTOR_ID,
    actorSessionId: null,
    requestId: 'req-r5-1',
  };

  type Query = { sql: string; params: unknown[] };

  function makeService(options: { rows?: unknown[]; updateResult?: unknown[] } = {}) {
    const queries: Query[] = [];
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        if (sql.includes('UPDATE kvkk_consents')) return options.updateResult ?? [];
        if (sql.includes('FROM kvkk_consents')) return options.rows ?? [];
        return [];
      }),
    } as unknown as EntityManager;
    const transaction = jest.fn(async (run: (m: EntityManager) => Promise<unknown>) =>
      run(manager),
    );
    const dataSource = { transaction } as unknown as DataSource;
    const auditWriter = { write: jest.fn(async () => undefined) };

    return {
      service: new ConsentLifecycleService(dataSource, auditWriter as never),
      manager,
      transaction,
      auditWriter,
      queries,
    };
  }

  const consentRow = (overrides: Record<string, unknown> = {}) => ({
    id: CONSENT_ID,
    consent_type: 'parent_notification',
    version: 2,
    status: 'approved',
    revoked_at: null,
    expires_at: null,
    subject_status: 'active',
    contact_phone_masked: null,
    contact_email_masked: null,
    ...overrides,
  });

  describe('listStudentConsentStatus (hassas okuma)', () => {
    it('masks raw contact values on the read path and never returns raw PII', async () => {
      const { service, auditWriter } = makeService({
        rows: [
          consentRow({ contact_phone_masked: RAW_PHONE, contact_email_masked: MASKED_EMAIL }),
        ],
      });

      const result = await service.listStudentConsentStatus({
        tenantId: TENANT_A,
        studentId: STUDENT_A,
        actor: ACTOR,
      });

      expect(JSON.stringify(result)).not.toContain(RAW_PHONE);
      expect(result.consents[0].contactPhoneMasked).toBe(MASKED_PHONE);
      expect(result.consents[0].contactEmailMasked).toBe(MASKED_EMAIL);
      expect(result.consents[0].remaskedFields).toEqual(['contactPhone']);
      expect(auditWriter.write).toHaveBeenCalledTimes(1);
    });

    it('keeps already masked values untouched and reports the lifecycle state', async () => {
      const { service } = makeService({
        rows: [
          consentRow({
            contact_phone_masked: MASKED_PHONE,
            contact_email_masked: MASKED_EMAIL,
            version: 3,
          }),
        ],
      });

      const result = await service.listStudentConsentStatus({
        tenantId: TENANT_A,
        studentId: STUDENT_A,
        actor: ACTOR,
      });

      expect(result.consents[0].remaskedFields).toEqual([]);
      expect(result.consents[0].contactPhoneMasked).toBe(MASKED_PHONE);
      expect(result.consents[0]).toMatchObject({ version: 3, state: 'active', status: 'approved' });
      expect(result.subjectStatus).toBe('active');
    });

    it('writes a redaction receipt whose field accounting matches the evaluated surface', async () => {
      const { service, auditWriter } = makeService({
        rows: [
          consentRow({ contact_phone_masked: RAW_PHONE, contact_email_masked: MASKED_EMAIL }),
          consentRow({ id: '77777777-7777-4777-8777-777777777777', consent_type: 'sms_notification', version: 1 }),
        ],
      });

      const result = await service.listStudentConsentStatus({
        tenantId: TENANT_A,
        studentId: STUDENT_A,
        actor: ACTOR,
      });

      // 2 dolu iletişim alanı (maskeli), 10 PII'siz alan + 2 boş iletişim alanı atlandı.
      expect(result.receipt).toMatchObject({
        redactedFieldCount: 2,
        skippedFieldCount: 12,
        evaluatedFieldCount: 14,
        strategy: 'partial-mask',
      });
      const metadata = (auditWriter.write as jest.Mock).mock.calls[0][2];
      expect(metadata.redactionReceipt).toEqual(result.receipt);
      expect(
        metadata.redactionReceipt.redactedFieldCount + metadata.redactionReceipt.skippedFieldCount,
      ).toBe(metadata.redactionReceipt.evaluatedFieldCount);
    });

    it('audits the sensitive read with a PII-free entity reference (never the raw student id)', async () => {
      const { service, auditWriter } = makeService({ rows: [consentRow()] });

      await service.listStudentConsentStatus({
        tenantId: TENANT_A,
        studentId: STUDENT_A,
        actor: ACTOR,
      });

      const [, eventName, metadata] = (auditWriter.write as jest.Mock).mock.calls[0];
      expect(eventName).toBe('dataprotection.export.redacted');
      expect(metadata).toMatchObject({
        schemaVersion: 1,
        tenantId: TENANT_A,
        actorUserId: ACTOR_ID,
        entityType: 'dataprotection',
        result: 'success',
        changedFields: ['purpose', 'format', 'recordCount', 'redactionStrategy'],
      });
      expect(metadata.entityId).not.toBe(STUDENT_A);
      expect(metadata.entityId).toBe(
        auditSubjectRefUuid({ tenantId: TENANT_A, studentId: STUDENT_A }),
      );
      expect(JSON.stringify(metadata)).not.toContain(STUDENT_A);
    });

    it('scopes every read to the caller tenant and returns nothing for a foreign student (BOLA negative)', async () => {
      const { service, queries, auditWriter } = makeService({ rows: [] });

      const result = await service.listStudentConsentStatus({
        tenantId: TENANT_B,
        studentId: STUDENT_A,
        actor: ACTOR,
      });

      const select = queries.find((query) => query.sql.includes('FROM kvkk_consents'));
      expect(select?.sql).toContain('c.tenant_id = $1');
      expect(select?.params[0]).toBe(TENANT_B);
      expect(select?.params[1]).toBe(STUDENT_A);
      expect(result.consents).toEqual([]);
      expect(result.subjectStatus).toBeNull();
      expect(result.receipt).toMatchObject({
        redactedFieldCount: 0,
        skippedFieldCount: 0,
        evaluatedFieldCount: 0,
        strategy: 'none',
      });
      // Erişim denemesi de denetlenir; kiracı istekten değil context'ten gelir.
      expect(auditWriter.write).toHaveBeenCalledTimes(1);
      expect((auditWriter.write as jest.Mock).mock.calls[0][2].tenantId).toBe(TENANT_B);
    });

    it('summarizes channel decisions from the same version-based gate', async () => {
      const { service } = makeService({
        rows: [
          consentRow({ version: 4 }),
          consentRow({
            id: '88888888-8888-4888-8888-888888888888',
            consent_type: 'sms_notification',
            version: 2,
          }),
        ],
      });

      const result = await service.listStudentConsentStatus({
        tenantId: TENANT_A,
        studentId: STUDENT_A,
        actor: ACTOR,
      });

      expect(result.channels.sms).toMatchObject({ allowed: true, consentVersion: 4 });
      expect(result.channels.whatsapp).toMatchObject({
        allowed: false,
        reason: 'blocked_channel_consent',
      });
    });
  });

  describe('withdrawConsent (withdrawable)', () => {
    it('revokes the governing version, records the consent event and audits in the same transaction', async () => {
      const { service, transaction, queries, auditWriter } = makeService({
        rows: [consentRow()],
        updateResult: [{ version: 2 }],
      });

      const result = await service.withdrawConsent({
        tenantId: TENANT_A,
        studentId: STUDENT_A,
        consentType: 'parent_notification',
        actor: ACTOR,
      });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ outcome: 'revoked', consentType: 'parent_notification', version: 2 });
      expect(result.revokedAt).not.toBeNull();

      const update = queries.find((query) => query.sql.includes('UPDATE kvkk_consents'));
      expect(update?.sql).toContain('WHERE tenant_id = $1 AND id = $2 AND version = $3');
      expect(update?.sql).toContain("status <> 'revoked'");
      expect(update?.params.slice(0, 3)).toEqual([TENANT_A, CONSENT_ID, 2]);

      const event = queries.find((query) => query.sql.includes('INSERT INTO kvkk_consent_events'));
      expect(event?.params[0]).toBe(TENANT_A);
      expect(event?.params[1]).toBe(CONSENT_ID);
      expect(event?.params[4]).toBe(JSON.stringify({ schemaVersion: 1, version: 2 }));

      const [, eventName, metadata] = (auditWriter.write as jest.Mock).mock.calls[0];
      expect(eventName).toBe('dataprotection.consent.revoked');
      expect(metadata).toMatchObject({ tenantId: TENANT_A, entityId: CONSENT_ID, result: 'success' });
      expect(JSON.stringify(metadata)).not.toContain(STUDENT_A);
    });

    it('produces a single transition under concurrent withdrawal (no_change writes no audit or event)', async () => {
      const { service, queries, auditWriter } = makeService({
        rows: [consentRow({ status: 'revoked', revoked_at: new Date('2026-09-20T00:00:00.000Z') })],
        updateResult: [],
      });

      const result = await service.withdrawConsent({
        tenantId: TENANT_A,
        studentId: STUDENT_A,
        consentType: 'parent_notification',
        actor: ACTOR,
      });

      expect(result.outcome).toBe('no_change');
      expect(result.revokedAt).toBe('2026-09-20T00:00:00.000Z');
      expect(auditWriter.write).not.toHaveBeenCalled();
      expect(queries.some((query) => query.sql.includes('INSERT INTO kvkk_consent_events'))).toBe(false);
    });

    it('returns not_found without leaking whether the student exists in another tenant', async () => {
      const { service, queries, auditWriter } = makeService({ rows: [] });

      const result = await service.withdrawConsent({
        tenantId: TENANT_B,
        studentId: STUDENT_A,
        consentType: 'sms_notification',
        actor: ACTOR,
      });

      expect(result).toEqual({
        outcome: 'not_found',
        consentType: 'sms_notification',
        version: null,
        revokedAt: null,
      });
      expect(queries.some((query) => query.sql.includes('UPDATE kvkk_consents'))).toBe(false);
      expect(auditWriter.write).not.toHaveBeenCalled();
      expect(queries[0].params[0]).toBe(TENANT_B);
    });

    it('rejects an out-of-dictionary consent type before touching the database', async () => {
      const { service, transaction } = makeService();

      await expect(
        service.withdrawConsent({
          tenantId: TENANT_A,
          studentId: STUDENT_A,
          consentType: 'marketing_sms' as never,
          actor: ACTOR,
        }),
      ).rejects.toThrow(TypeError);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('keeps raw identifiers out of the withdrawal log line', async () => {
      const { service } = makeService({ rows: [consentRow()], updateResult: [{ version: 2 }] });
      const logged: string[] = [];
      const spy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation((message?: unknown) => {
          logged.push(String(message));
        });
      try {
        await service.withdrawConsent({
          tenantId: TENANT_A,
          studentId: STUDENT_A,
          consentType: 'parent_notification',
          actor: ACTOR,
        });

        const output = logged.join('\n');
        expect(output).toContain('kvkk.consent.withdrawn');
        expect(output).toContain('consentVersion');
        expect(output).not.toContain(STUDENT_A);
        expect(output).not.toContain(CONSENT_ID);
        expect(output).not.toContain(ACTOR_ID);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('auditSubjectRefUuid', () => {
    it('is a deterministic, tenant-locked, irreversible UUID reference', () => {
      const first = auditSubjectRefUuid({ tenantId: TENANT_A, studentId: STUDENT_A });
      const again = auditSubjectRefUuid({ tenantId: TENANT_A, studentId: STUDENT_A });
      const otherStudent = auditSubjectRefUuid({
        tenantId: TENANT_A,
        studentId: '55555555-5555-4555-8555-555555555555',
      });
      const otherTenant = auditSubjectRefUuid({ tenantId: TENANT_B, studentId: STUDENT_A });

      expect(first).toBe(again);
      expect(first).not.toBe(otherStudent);
      expect(first).not.toBe(otherTenant);
      expect(first).not.toContain(STUDENT_A);
      expect(first).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });
});
