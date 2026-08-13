import {
  AuditMetadataByEvent,
  AuthAuditEventName,
  DataProtectionAuditEventName,
  PersistableAuditRecord,
  RedactionReceipt,
  StudentAuditEventName,
  TeacherAuditEventName,
  TransactionalAuditEventName,
} from './transactional-audit.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COMMON_KEYS = [
  'schemaVersion',
  'tenantId',
  'actorUserId',
  'actorSessionId',
  'requestId',
  'entityType',
  'entityId',
  'result',
  'changedFields',
] as const;

const BRANCH_SCOPED_KEYS = [...COMMON_KEYS, 'branchId'] as const;

const COURSE_CHANGED_FIELDS = ['name', 'code', 'description', 'status', 'deactivatedAt'] as const;
const ROOM_CHANGED_FIELDS = ['branchId', 'name', 'code', 'capacity', 'description', 'status', 'deactivatedAt'] as const;
const TIME_SLOT_CHANGED_FIELDS = [
  'branchId',
  'name',
  'dayOfWeek',
  'startTime',
  'endTime',
  'orderIndex',
  'status',
  'archivedAt',
] as const;
const LEAVE_CHANGED_FIELDS = [
  'status',
  'coverageStatus',
  'durationKind',
  'reasonCode',
  'startAt',
  'endAt',
  'substitutionAssignment',
  'dailyOperationsProjection',
  'version',
] as const;

// --- Yeni event aileleri için değişen alan allowlist'leri ---
const AUTH_CHANGED_FIELDS = ['reason', 'failureReason', 'lockReason', 'mfaMethod'] as const;
const DATA_PROTECTION_CHANGED_FIELDS = [
  'purpose',
  'format',
  'recordCount',
  'redactionStrategy',
  'legalBasis',
  'erasureScope',
] as const;
const STUDENT_CHANGED_FIELDS = [
  'status',
  'enrollmentStatus',
  'branchId',
  'studentGroupId',
  'deactivatedAt',
  'transferredAt',
] as const;
const TEACHER_CHANGED_FIELDS = ['status', 'branchId', 'employmentStatus', 'deactivatedAt'] as const;
const ATTENDANCE_CHANGED_FIELDS = [
  'status',
  'openedAt',
  'closedAt',
  'markedForStudentId',
  'present',
  'lateMinutes',
] as const;
const NOTIFICATION_CHANGED_FIELDS = ['channel', 'status', 'templateId', 'recipientRole', 'preferenceKey'] as const;

export const FORBIDDEN_AUDIT_METADATA_KEYS = [
  'requestBody',
  'responseBody',
  'authorization',
  'cookie',
  'setCookie',
  'password',
  'credential',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  // KVKK — doğrudan tanımlayıcı / özel nitelikli kişisel veri
  'studentName',
  'studentIdentity',
  'studentTcKimlikNo',
  'nationalId',
  'identityNumber',
  'tcKimlikNo',
  'birthDate',
  'address',
  'iban',
  'parentName',
  'parentPhone',
  'parentEmail',
  'parentContact',
  'guardianName',
  'guardianPhone',
  'guardianEmail',
  'guardianContact',
  'teacherName',
  'teacherEmail',
  'teacherPhone',
  'leaveDetail',
  'healthDetail',
  'healthNote',
  'medicalNote',
  'diagnosis',
  'healthInfo',
  'freeTextReason',
  'notificationPayload',
  'notificationBody',
  'messageBody',
  'guidanceNote',
  'counselingNote',
] as const;

type AuditResultValue = 'success' | 'failure';

type AuditMetadataPolicy = Readonly<{
  entityType:
    | 'course'
    | 'room'
    | 'time_slot'
    | 'leave_request'
    | 'auth'
    | 'dataprotection'
    | 'student'
    | 'teacher'
    | 'attendance'
    | 'notification';
  allowedKeys: readonly string[];
  allowedChangedFields: readonly string[];
  branchScoped: boolean;
  actorRequired?: boolean;
  resultAllowlist: readonly AuditResultValue[];
  redactionReceiptRequired?: boolean;
}>;

const LEAVE_EVENT_POLICY: AuditMetadataPolicy = {
  entityType: 'leave_request',
  allowedKeys: COMMON_KEYS,
  allowedChangedFields: LEAVE_CHANGED_FIELDS,
  branchScoped: false,
  actorRequired: true,
  resultAllowlist: ['success'],
};

// Kimlik doğrulama politikası: başarısız giriş/hesap kilidi `failure` sonucuna izin verir.
const AUTH_POLICY: AuditMetadataPolicy = {
  entityType: 'auth',
  allowedKeys: COMMON_KEYS,
  allowedChangedFields: AUTH_CHANGED_FIELDS,
  branchScoped: false,
  actorRequired: false,
  resultAllowlist: ['success', 'failure'],
};

// KVKK veri koruma politikası: `redactionReceipt` ZORUNLUDUR (PII maskelendi kanıtı).
const DATA_PROTECTION_POLICY: AuditMetadataPolicy = {
  entityType: 'dataprotection',
  allowedKeys: [...COMMON_KEYS, 'redactionReceipt'],
  allowedChangedFields: DATA_PROTECTION_CHANGED_FIELDS,
  branchScoped: false,
  actorRequired: true,
  resultAllowlist: ['success', 'failure'],
  redactionReceiptRequired: true,
};

const STUDENT_POLICY: AuditMetadataPolicy = {
  entityType: 'student',
  allowedKeys: BRANCH_SCOPED_KEYS,
  allowedChangedFields: STUDENT_CHANGED_FIELDS,
  branchScoped: true,
  actorRequired: true,
  resultAllowlist: ['success'],
};

const TEACHER_POLICY: AuditMetadataPolicy = {
  entityType: 'teacher',
  allowedKeys: BRANCH_SCOPED_KEYS,
  allowedChangedFields: TEACHER_CHANGED_FIELDS,
  branchScoped: true,
  actorRequired: true,
  resultAllowlist: ['success'],
};

const ATTENDANCE_POLICY: AuditMetadataPolicy = {
  entityType: 'attendance',
  allowedKeys: COMMON_KEYS,
  allowedChangedFields: ATTENDANCE_CHANGED_FIELDS,
  branchScoped: false,
  actorRequired: true,
  resultAllowlist: ['success'],
};

const NOTIFICATION_POLICY: AuditMetadataPolicy = {
  entityType: 'notification',
  allowedKeys: COMMON_KEYS,
  allowedChangedFields: NOTIFICATION_CHANGED_FIELDS,
  branchScoped: false,
  actorRequired: false,
  resultAllowlist: ['success', 'failure'],
};

const POLICY_BY_EVENT: Record<TransactionalAuditEventName, AuditMetadataPolicy> = {
  'course.created': {
    entityType: 'course',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: COURSE_CHANGED_FIELDS,
    branchScoped: false,
    resultAllowlist: ['success'],
  },
  'course.updated': {
    entityType: 'course',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: COURSE_CHANGED_FIELDS,
    branchScoped: false,
    resultAllowlist: ['success'],
  },
  'course.deactivated': {
    entityType: 'course',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: COURSE_CHANGED_FIELDS,
    branchScoped: false,
    resultAllowlist: ['success'],
  },
  'course.reactivated': {
    entityType: 'course',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: COURSE_CHANGED_FIELDS,
    branchScoped: false,
    resultAllowlist: ['success'],
  },
  'room.created': {
    entityType: 'room',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: ROOM_CHANGED_FIELDS,
    branchScoped: true,
    resultAllowlist: ['success'],
  },
  'room.updated': {
    entityType: 'room',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: ROOM_CHANGED_FIELDS,
    branchScoped: true,
    resultAllowlist: ['success'],
  },
  'room.archived': {
    entityType: 'room',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: ROOM_CHANGED_FIELDS,
    branchScoped: true,
    resultAllowlist: ['success'],
  },
  'room.reactivated': {
    entityType: 'room',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: ROOM_CHANGED_FIELDS,
    branchScoped: true,
    resultAllowlist: ['success'],
  },
  'time_slot.created': {
    entityType: 'time_slot',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: TIME_SLOT_CHANGED_FIELDS,
    branchScoped: true,
    resultAllowlist: ['success'],
  },
  'time_slot.updated': {
    entityType: 'time_slot',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: TIME_SLOT_CHANGED_FIELDS,
    branchScoped: true,
    resultAllowlist: ['success'],
  },
  'time_slot.archived': {
    entityType: 'time_slot',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: TIME_SLOT_CHANGED_FIELDS,
    branchScoped: true,
    resultAllowlist: ['success'],
  },
  'time_slot.reactivated': {
    entityType: 'time_slot',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: TIME_SLOT_CHANGED_FIELDS,
    branchScoped: true,
    resultAllowlist: ['success'],
  },
  'leave.requested.v1': LEAVE_EVENT_POLICY,
  'leave.approved.v1': LEAVE_EVENT_POLICY,
  'leave.rejected.v1': LEAVE_EVENT_POLICY,
  'leave.substitution_assigned.v1': LEAVE_EVENT_POLICY,
  'leave.substitution_cleared.v1': LEAVE_EVENT_POLICY,
  'daily_operations.projected.v1': LEAVE_EVENT_POLICY,
  // --- Genişletilmiş action tipleri (okul-03-audit-scope) ---
  'auth.login.success': AUTH_POLICY,
  'auth.login.failure': AUTH_POLICY,
  'auth.logout': AUTH_POLICY,
  'auth.token_refreshed': AUTH_POLICY,
  'auth.account_locked': AUTH_POLICY,
  'dataprotection.export.redacted': DATA_PROTECTION_POLICY,
  'dataprotection.subject_access_request.served': DATA_PROTECTION_POLICY,
  'dataprotection.erasure.requested': DATA_PROTECTION_POLICY,
  'dataprotection.erasure.completed': DATA_PROTECTION_POLICY,
  'dataprotection.consent.revoked': DATA_PROTECTION_POLICY,
  'student.created': STUDENT_POLICY,
  'student.updated': STUDENT_POLICY,
  'student.deactivated': STUDENT_POLICY,
  'student.transferred': STUDENT_POLICY,
  'teacher.created': TEACHER_POLICY,
  'teacher.updated': TEACHER_POLICY,
  'teacher.deactivated': TEACHER_POLICY,
  'attendance.session.opened': ATTENDANCE_POLICY,
  'attendance.session.closed': ATTENDANCE_POLICY,
  'attendance.record.marked': ATTENDANCE_POLICY,
  'notification.sent': NOTIFICATION_POLICY,
  'notification.failed': NOTIFICATION_POLICY,
  'notification.preferences.updated': NOTIFICATION_POLICY,
};

function assertKnownEventName(eventName: string): asserts eventName is TransactionalAuditEventName {
  if (!Object.prototype.hasOwnProperty.call(POLICY_BY_EVENT, eventName)) {
    throw new TypeError(`Unsupported transactional audit event: ${eventName}`);
  }
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Audit metadata must be a plain object');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Audit metadata must be a plain object');
  }
  if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) {
    throw new TypeError('Audit metadata cannot contain symbol keys');
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(metadata: Record<string, unknown>, allowedKeys: readonly string[]): void {
  const actualKeys = Object.keys(metadata);
  const unknownKeys = actualKeys.filter((key) => !allowedKeys.includes(key));
  const missingKeys = allowedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(metadata, key));

  if (unknownKeys.length > 0) {
    throw new TypeError(`Audit metadata contains non-allowlisted keys: ${unknownKeys.sort().join(', ')}`);
  }
  if (missingKeys.length > 0) {
    throw new TypeError(`Audit metadata is missing required keys: ${missingKeys.sort().join(', ')}`);
  }
}

function assertUuid(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${fieldName} must be a UUID`);
  }
  return value;
}

function assertNullableUuid(value: unknown, fieldName: string): string | null {
  if (value === null) return null;
  return assertUuid(value, fieldName);
}

function assertRequestId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 120) {
    throw new TypeError('requestId must be between 1 and 120 characters');
  }
  return value;
}

function assertChangedFields(value: unknown, allowedFields: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((field) => typeof field !== 'string')) {
    throw new TypeError('changedFields must be a non-empty string array');
  }

  const unknownFields = value.filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    throw new TypeError(`changedFields contains non-allowlisted fields: ${[...new Set(unknownFields)].sort().join(', ')}`);
  }

  return [...new Set(value)].sort();
}

const REDACTION_STRATEGIES: ReadonlySet<string> = new Set(['partial-mask', 'full-redact', 'hash', 'none']);

/**
 * KVKK redaction kanıt kaydını doğrular. Kanıt, maskeleme mantığının denetlenebilir
 * olmasını sağlar: incelenen alanların tamamı ya maskelenmiş ya da PII değil olarak
 * işaretlenmiş olmalıdır (redactedFieldCount + skippedFieldCount === evaluatedFieldCount).
 */
function assertRedactionReceipt(value: unknown): RedactionReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('redactionReceipt must be a plain object');
  }
  const receipt = value as Record<string, unknown>;
  const redactedFieldCount = receipt.redactedFieldCount;
  const skippedFieldCount = receipt.skippedFieldCount;
  const evaluatedFieldCount = receipt.evaluatedFieldCount;
  const strategy = receipt.strategy;
  const appliedAt = receipt.appliedAt;

  if (typeof redactedFieldCount !== 'number' || !Number.isInteger(redactedFieldCount) || redactedFieldCount < 0) {
    throw new TypeError('redactionReceipt.redactedFieldCount must be a non-negative integer');
  }
  if (typeof skippedFieldCount !== 'number' || !Number.isInteger(skippedFieldCount) || skippedFieldCount < 0) {
    throw new TypeError('redactionReceipt.skippedFieldCount must be a non-negative integer');
  }
  if (typeof evaluatedFieldCount !== 'number' || !Number.isInteger(evaluatedFieldCount) || evaluatedFieldCount < 0) {
    throw new TypeError('redactionReceipt.evaluatedFieldCount must be a non-negative integer');
  }
  if (redactedFieldCount + skippedFieldCount !== evaluatedFieldCount) {
    throw new TypeError(
      'redactionReceipt accounting mismatch: redactedFieldCount + skippedFieldCount must equal evaluatedFieldCount',
    );
  }
  if (typeof strategy !== 'string' || !REDACTION_STRATEGIES.has(strategy)) {
    throw new TypeError(`redactionReceipt.strategy must be one of: ${[...REDACTION_STRATEGIES].join(', ')}`);
  }
  if (typeof appliedAt !== 'string' || appliedAt.length === 0) {
    throw new TypeError('redactionReceipt.appliedAt must be a non-empty string');
  }

  return {
    redactedFieldCount,
    skippedFieldCount,
    evaluatedFieldCount,
    strategy: strategy as RedactionReceipt['strategy'],
    appliedAt,
  };
}

export function validateTransactionalAuditMetadata<E extends TransactionalAuditEventName>(
  eventName: E,
  metadataInput: AuditMetadataByEvent[E] | unknown,
): PersistableAuditRecord {
  assertKnownEventName(eventName);
  const policy = POLICY_BY_EVENT[eventName];
  const metadata = asPlainRecord(metadataInput);
  assertExactKeys(metadata, policy.allowedKeys);

  if (metadata.schemaVersion !== 1) throw new TypeError('schemaVersion must be 1');
  if (metadata.entityType !== policy.entityType) throw new TypeError(`entityType must be ${policy.entityType}`);
  if (typeof metadata.result !== 'string' || !policy.resultAllowlist.includes(metadata.result as AuditResultValue)) {
    throw new TypeError(`result must be one of: ${policy.resultAllowlist.join(', ')}`);
  }

  for (const forbidden of FORBIDDEN_AUDIT_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(metadata, forbidden)) {
      throw new TypeError(`Audit metadata contains forbidden key: ${forbidden}`);
    }
  }

  const tenantId = assertUuid(metadata.tenantId, 'tenantId');
  const actorUserId = assertNullableUuid(metadata.actorUserId, 'actorUserId');
  if (policy.actorRequired && actorUserId === null) {
    throw new TypeError(`actorUserId is required for ${eventName} audit events`);
  }
  const actorSessionId = assertNullableUuid(metadata.actorSessionId, 'actorSessionId');
  const entityId = assertUuid(metadata.entityId, 'entityId');
  const requestId = assertRequestId(metadata.requestId);
  const changedFields = assertChangedFields(metadata.changedFields, policy.allowedChangedFields);
  const branchId = policy.branchScoped ? assertUuid(metadata.branchId, 'branchId') : undefined;

  const redactionReceipt = policy.redactionReceiptRequired
    ? assertRedactionReceipt(metadata.redactionReceipt)
    : undefined;

  return {
    tenantId,
    actorUserId,
    actorSessionId,
    action: eventName,
    entityType: policy.entityType,
    entityId,
    requestId,
    metadataJson: {
      schemaVersion: 1,
      result: metadata.result as AuditResultValue,
      changedFields,
      ...(branchId ? { branchId } : {}),
      ...(redactionReceipt ? { redactionReceipt } : {}),
    },
  };
}

export function isTransactionalAuditEventName(value: string): value is TransactionalAuditEventName {
  return Object.prototype.hasOwnProperty.call(POLICY_BY_EVENT, value);
}

// Değişmezlik kontrolü için yeniden dışa aktarımlar (test/reflection desteği).
export const AUTH_AUDIT_EVENT_NAMES_SAFE: readonly AuthAuditEventName[] = [
  'auth.login.success',
  'auth.login.failure',
  'auth.logout',
  'auth.token_refreshed',
  'auth.account_locked',
];
export const DATA_PROTECTION_AUDIT_EVENT_NAMES_SAFE: readonly DataProtectionAuditEventName[] = [
  'dataprotection.export.redacted',
  'dataprotection.subject_access_request.served',
  'dataprotection.erasure.requested',
  'dataprotection.erasure.completed',
  'dataprotection.consent.revoked',
];
export const STUDENT_AUDIT_EVENT_NAMES_SAFE: readonly StudentAuditEventName[] = [
  'student.created',
  'student.updated',
  'student.deactivated',
  'student.transferred',
];
export const TEACHER_AUDIT_EVENT_NAMES_SAFE: readonly TeacherAuditEventName[] = [
  'teacher.created',
  'teacher.updated',
  'teacher.deactivated',
];
