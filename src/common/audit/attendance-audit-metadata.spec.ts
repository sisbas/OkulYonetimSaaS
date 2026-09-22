import { validateTransactionalAuditMetadata } from './audit-metadata-policy';

/**
 * Attendance audit kanıt değerleri (#259, review P1).
 *
 * `changedFields` yalnız alan ADLARINI taşır; düzeltmenin denetlenebilir
 * kanıtı (gerekçe kodu, düzeltme sayısı, önceki/yeni durum) allowlist'lenmiş
 * skaler `valueEvidence` altında saklanır. PII/serbest metin reddedilir.
 */
describe('attendance audit value evidence (#259)', () => {
  const base = {
    schemaVersion: 1 as const,
    tenantId: '11111111-1111-4111-8111-111111111111',
    actorUserId: '22222222-2222-4222-8222-222222222222',
    actorSessionId: null,
    requestId: 'req-1',
    entityType: 'attendance' as const,
    entityId: '33333333-3333-4333-8333-333333333333',
    result: 'success' as const,
  };

  it('persists the correction evidence values, not only field names', () => {
    const record = validateTransactionalAuditMetadata('attendance.record.corrected', {
      ...base,
      changedFields: ['status', 'reasonCode', 'correctionCount'],
      reasonCode: 'excused_document',
      correctionCount: 2,
      previousStatus: 'absent',
      newStatus: 'excused',
    });

    expect(record.metadataJson.valueEvidence).toEqual({
      reasonCode: 'excused_document',
      correctionCount: 2,
      previousStatus: 'absent',
      newStatus: 'excused',
    });
  });

  it('persists status and roster size evidence for session open', () => {
    const record = validateTransactionalAuditMetadata('attendance.session.opened', {
      ...base,
      changedFields: ['openedAt'],
      newStatus: 'published',
      rosterSize: 24,
    });

    expect(record.metadataJson.valueEvidence).toEqual({
      newStatus: 'published',
      rosterSize: 24,
    });
  });

  it('omits valueEvidence when no evidence value is supplied', () => {
    const record = validateTransactionalAuditMetadata('attendance.record.marked', {
      ...base,
      changedFields: ['status', 'markedForStudentId'],
    });

    expect(record.metadataJson.valueEvidence).toBeUndefined();
  });

  it('rejects non-scalar evidence (no smuggling free text into audit)', () => {
    expect(() =>
      validateTransactionalAuditMetadata('attendance.record.corrected', {
        ...base,
        changedFields: ['reasonCode'],
        reasonCode: { freeText: 'Veli 0532 111 22 33 numarasından arandı' },
      }),
    ).toThrow(/must be a string, number or boolean/);
  });

  it('rejects keys outside the attendance allowlist', () => {
    expect(() =>
      validateTransactionalAuditMetadata('attendance.record.marked', {
        ...base,
        changedFields: ['status'],
        notes: 'Veli ile görüşüldü',
      }),
    ).toThrow(/non-allowlisted/i);
  });
});
