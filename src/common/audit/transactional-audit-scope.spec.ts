import { EntityManager } from 'typeorm';

import { AuditLogRepository } from './audit-log.repository';
import {
  AUTH_AUDIT_EVENT_NAMES_SAFE,
  DATA_PROTECTION_AUDIT_EVENT_NAMES_SAFE,
  STUDENT_AUDIT_EVENT_NAMES_SAFE,
  TEACHER_AUDIT_EVENT_NAMES_SAFE,
} from './audit-metadata-policy';
import {
  FORBIDDEN_AUDIT_METADATA_KEYS,
  isTransactionalAuditEventName,
  validateTransactionalAuditMetadata,
} from './audit-metadata-policy';
import { AuditMetadataByEvent } from './transactional-audit.types';
import { TypeOrmTransactionalAuditWriter } from './transactional-audit-writer';

const TENANT_ID = '10000000-0000-4000-8000-000000000100';
const BRANCH_ID = '90000000-0000-4000-8000-000000000100';
const ACTOR_ID = '30000000-0000-4000-8000-000000000100';
const ENTITY_ID = '20000000-0000-4000-8000-000000000100';
const SESSION_ID = '40000000-0000-4000-8000-000000000100';

function redactionReceipt() {
  return {
    redactedFieldCount: 2,
    skippedFieldCount: 1,
    evaluatedFieldCount: 3,
    strategy: 'full-redact' as const,
    appliedAt: '2026-08-13T14:07:09.000Z',
  };
}

function authFailureMetadata(): AuditMetadataByEvent['auth.login.failure'] {
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    actorUserId: null,
    actorSessionId: SESSION_ID,
    requestId: 'auth-failure-unit',
    entityType: 'auth',
    entityId: ENTITY_ID,
    result: 'failure',
    changedFields: ['failureReason'],
  };
}

function dataProtectionMetadata(): AuditMetadataByEvent['dataprotection.export.redacted'] {
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    actorUserId: ACTOR_ID,
    actorSessionId: null,
    requestId: 'dataprotection-unit',
    entityType: 'dataprotection',
    entityId: ENTITY_ID,
    result: 'success',
    changedFields: ['purpose', 'format'],
    redactionReceipt: redactionReceipt(),
  };
}

function studentMetadata(): AuditMetadataByEvent['student.created'] {
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    actorUserId: ACTOR_ID,
    actorSessionId: null,
    requestId: 'student-unit',
    entityType: 'student',
    entityId: ENTITY_ID,
    result: 'success',
    changedFields: ['status', 'branchId'],
    branchId: BRANCH_ID,
  };
}

function teacherMetadata(): AuditMetadataByEvent['teacher.created'] {
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    actorUserId: ACTOR_ID,
    actorSessionId: null,
    requestId: 'teacher-unit',
    entityType: 'teacher',
    entityId: ENTITY_ID,
    result: 'success',
    changedFields: ['status', 'branchId'],
    branchId: BRANCH_ID,
  };
}

function attendanceMetadata(): AuditMetadataByEvent['attendance.record.marked'] {
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    actorUserId: ACTOR_ID,
    actorSessionId: SESSION_ID,
    requestId: 'attendance-unit',
    entityType: 'attendance',
    entityId: ENTITY_ID,
    result: 'success',
    changedFields: ['present', 'markedForStudentId'],
  };
}

function notificationMetadata(): AuditMetadataByEvent['notification.sent'] {
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    actorUserId: null,
    actorSessionId: null,
    requestId: 'notification-unit',
    entityType: 'notification',
    entityId: ENTITY_ID,
    result: 'success',
    changedFields: ['channel', 'status'],
  };
}

describe('okul-03-audit-scope: genişletilmiş action tipleri politikası', () => {
  it('auth başarısız giriş eventini (failure sonucu) kabul eder ve normalize eder', () => {
    expect(validateTransactionalAuditMetadata('auth.login.failure', authFailureMetadata())).toEqual({
      tenantId: TENANT_ID,
      actorUserId: null,
      actorSessionId: SESSION_ID,
      action: 'auth.login.failure',
      entityType: 'auth',
      entityId: ENTITY_ID,
      requestId: 'auth-failure-unit',
      metadataJson: {
        schemaVersion: 1,
        result: 'failure',
        changedFields: ['failureReason'],
      },
    });
  });

  it('auth eventinde geçersiz result değerini reddeder', () => {
    expect(() =>
      validateTransactionalAuditMetadata('auth.login.success', {
        ...authFailureMetadata(),
        result: 'pending' as 'success',
      }),
    ).toThrow(/result must be one of/);
  });

  // P2 (PR #227): event adı bir sonucu kodluyorsa (ör. '.success' / '.failure'),
  // result ile çelişemez. auth.login.success + result:'failure' gibi tutarsız
  // metadata KVKK kayıt tutarlılığı gereği reddedilir.
  function metadataWithResult(eventName: string, result: 'success' | 'failure') {
    const common = {
      schemaVersion: 1 as const,
      tenantId: TENANT_ID,
      actorUserId: null,
      actorSessionId: SESSION_ID,
      requestId: 'req-unit',
      entityId: ENTITY_ID,
    };
    // Event ailesinin beklediği entityType + changedFields ile tutarlı metadata üret
    // (aksi halde entityType/changedFields kontrolü result kontrolünden önce fırlatır).
    switch (eventName) {
      case 'notification.sent':
        return { ...common, entityType: 'notification', changedFields: ['channel'], result };
      case 'leave.approved.v1':
        return { ...common, entityType: 'leave_request', changedFields: ['status'], result };
      default:
        return { ...common, entityType: 'auth', changedFields: ['failureReason'], result };
    }
  }

  it.each([
    ['auth.login.success', 'failure'],
    ['auth.login.failure', 'success'],
    ['auth.account_locked', 'success'],
    ['notification.sent', 'failure'],
  ] as const)('event ailesi ile çelişen result değerini reddeder: %s + %s', (eventName, badResult) => {
    expect(() =>
      validateTransactionalAuditMetadata(eventName, metadataWithResult(eventName, badResult as 'success' | 'failure')),
    ).toThrow(/inconsistent audit metadata/);
  });

  it('event ailesi ile tutarlı result değerini kabul eder (auth.login.success + success)', () => {
    expect(
      validateTransactionalAuditMetadata('auth.login.success', metadataWithResult('auth.login.success', 'success')).action,
    ).toBe('auth.login.success');
  });

  it('KVKK dataprotection eventini redactionReceipt kanıtıyla kabul eder', () => {
    expect(validateTransactionalAuditMetadata('dataprotection.export.redacted', dataProtectionMetadata())).toEqual({
      tenantId: TENANT_ID,
      actorUserId: ACTOR_ID,
      actorSessionId: null,
      action: 'dataprotection.export.redacted',
      entityType: 'dataprotection',
      entityId: ENTITY_ID,
      requestId: 'dataprotection-unit',
      metadataJson: {
        schemaVersion: 1,
        result: 'success',
        changedFields: ['format', 'purpose'],
        redactionReceipt: redactionReceipt(),
      },
    });
  });

  it('redactionReceipt zorunluyken eksikse reddeder', () => {
    const { redactionReceipt: _omit, ...withoutReceipt } = dataProtectionMetadata() as Record<string, unknown>;
    expect(() =>
      validateTransactionalAuditMetadata('dataprotection.export.redacted', withoutReceipt),
    ).toThrow(/missing required keys: redactionReceipt/);
  });

  it('redactionReceipt muhasebesi tutarsızsa reddeder (redacted+skipped !== evaluated)', () => {
    const bad = {
      ...dataProtectionMetadata(),
      redactionReceipt: { ...redactionReceipt(), evaluatedFieldCount: 99 },
    };
    expect(() => validateTransactionalAuditMetadata('dataprotection.export.redacted', bad)).toThrow(
      /redactionReceipt accounting mismatch/,
    );
  });

  it('student eventi branch-scoped ve actor zorunlu; geçerli kaydı kabul eder', () => {
    expect(validateTransactionalAuditMetadata('student.created', studentMetadata())).toEqual({
      tenantId: TENANT_ID,
      actorUserId: ACTOR_ID,
      actorSessionId: null,
      action: 'student.created',
      entityType: 'student',
      entityId: ENTITY_ID,
      requestId: 'student-unit',
      metadataJson: {
        schemaVersion: 1,
        result: 'success',
        changedFields: ['branchId', 'status'],
        branchId: BRANCH_ID,
      },
    });
  });

  it('student eventinde actorUserId null ise reddeder (actorRequired)', () => {
    expect(() =>
      validateTransactionalAuditMetadata('student.created', { ...studentMetadata(), actorUserId: null }),
    ).toThrow(/actorUserId is required/);
  });

  it('teacher eventini kabul eder', () => {
    expect(validateTransactionalAuditMetadata('teacher.created', teacherMetadata()).action).toBe('teacher.created');
  });

  it('attendance eventini kabul eder', () => {
    expect(validateTransactionalAuditMetadata('attendance.record.marked', attendanceMetadata()).action).toBe(
      'attendance.record.marked',
    );
  });

  it('notification eventini (failure sonucu dahil) kabul eder', () => {
    expect(
      validateTransactionalAuditMetadata('notification.failed', { ...notificationMetadata(), result: 'failure' as const })
        .metadataJson.result,
    ).toBe('failure');
  });

  it.each(FORBIDDEN_AUDIT_METADATA_KEYS)(
    'yeni event ailelerinde yasaklı anahtarı reddeder: %s',
    (forbiddenKey) => {
      expect(() =>
        validateTransactionalAuditMetadata('student.updated', {
          ...studentMetadata(),
          [forbiddenKey]: 'must-not-enter-audit',
        }),
      ).toThrow(/non-allowlisted keys/);
    },
  );

  it('student eventinde PII değişen alanını (studentName) allowlist dışı tutar', () => {
    expect(() =>
      validateTransactionalAuditMetadata('student.updated', {
        ...studentMetadata(),
        changedFields: ['status', 'studentName'],
      }),
    ).toThrow(/changedFields contains non-allowlisted fields/);
  });

  it('isTransactionalAuditEventName yeni event adlarını tanır', () => {
    const names = [...AUTH_AUDIT_EVENT_NAMES_SAFE, ...DATA_PROTECTION_AUDIT_EVENT_NAMES_SAFE];
    expect(names.every((name) => isTransactionalAuditEventName(name))).toBe(true);
  });

  it('unknown event adını reddeder', () => {
    expect(isTransactionalAuditEventName('not.a.real.event')).toBe(false);
  });
});

describe('okul-03-audit-scope: genişletilmiş eventler için writer entegrasyonu', () => {
  it('dataprotection eventini repository insert ile yazar (redactionReceipt korunur)', async () => {
    const inserts: unknown[] = [];
    const repository = {
      insert: jest.fn((_m: EntityManager, record: unknown) => {
        inserts.push(record);
        return Promise.resolve();
      }),
    } as unknown as AuditLogRepository;
    const writer = new TypeOrmTransactionalAuditWriter(repository);

    await writer.write({} as EntityManager, 'dataprotection.export.redacted', dataProtectionMetadata());

    expect(inserts).toHaveLength(1);
    expect((inserts[0] as { action: string }).action).toBe('dataprotection.export.redacted');
    expect((inserts[0] as { metadataJson: { redactionReceipt: unknown } }).metadataJson.redactionReceipt).toEqual(
      redactionReceipt(),
    );
  });

  it('redactionReceipt eksikse writer insert çağrılmadan hata fırlatır', async () => {
    const repository = { insert: jest.fn() } as unknown as AuditLogRepository;
    const writer = new TypeOrmTransactionalAuditWriter(repository);

    const { redactionReceipt: _omit, ...withoutReceipt } = dataProtectionMetadata() as Record<string, unknown>;
    await expect(
      writer.write({} as EntityManager, 'dataprotection.export.redacted', withoutReceipt as never),
    ).rejects.toThrow(/missing required keys: redactionReceipt/);
    expect(repository.insert).not.toHaveBeenCalled();
  });
});
