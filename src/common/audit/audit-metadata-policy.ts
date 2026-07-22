import {
  AuditMetadataByEvent,
  COURSE_SUCCESS_AUDIT_EVENT_NAMES,
  LEAVE_SUCCESS_AUDIT_EVENT_NAMES,
  PersistableAuditRecord,
  ROOM_SUCCESS_AUDIT_EVENT_NAMES,
  TIME_SLOT_SUCCESS_AUDIT_EVENT_NAMES,
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
  'version',
] as const;

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
  'studentName',
  'studentIdentity',
  'parentName',
  'parentPhone',
  'parentEmail',
  'parentContact',
  'guardianName',
  'guardianPhone',
  'guardianEmail',
  'guardianContact',
  'notificationPayload',
  'notificationBody',
  'messageBody',
  'guidanceNote',
  'counselingNote',
] as const;

type AuditMetadataPolicy = Readonly<{
  entityType: 'course' | 'room' | 'time_slot' | 'leave_request';
  allowedKeys: readonly string[];
  allowedChangedFields: readonly string[];
  branchScoped: boolean;
  actorRequired?: boolean;
}>;

const POLICY_BY_EVENT: Record<TransactionalAuditEventName, AuditMetadataPolicy> = {
  'course.created': {
    entityType: 'course',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: COURSE_CHANGED_FIELDS,
    branchScoped: false,
  },
  'course.updated': {
    entityType: 'course',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: COURSE_CHANGED_FIELDS,
    branchScoped: false,
  },
  'course.deactivated': {
    entityType: 'course',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: COURSE_CHANGED_FIELDS,
    branchScoped: false,
  },
  'course.reactivated': {
    entityType: 'course',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: COURSE_CHANGED_FIELDS,
    branchScoped: false,
  },
  'room.created': {
    entityType: 'room',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: ROOM_CHANGED_FIELDS,
    branchScoped: true,
  },
  'room.updated': {
    entityType: 'room',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: ROOM_CHANGED_FIELDS,
    branchScoped: true,
  },
  'room.archived': {
    entityType: 'room',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: ROOM_CHANGED_FIELDS,
    branchScoped: true,
  },
  'room.reactivated': {
    entityType: 'room',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: ROOM_CHANGED_FIELDS,
    branchScoped: true,
  },
  'time_slot.created': {
    entityType: 'time_slot',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: TIME_SLOT_CHANGED_FIELDS,
    branchScoped: true,
  },
  'time_slot.updated': {
    entityType: 'time_slot',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: TIME_SLOT_CHANGED_FIELDS,
    branchScoped: true,
  },
  'time_slot.archived': {
    entityType: 'time_slot',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: TIME_SLOT_CHANGED_FIELDS,
    branchScoped: true,
  },
  'time_slot.reactivated': {
    entityType: 'time_slot',
    allowedKeys: BRANCH_SCOPED_KEYS,
    allowedChangedFields: TIME_SLOT_CHANGED_FIELDS,
    branchScoped: true,
  },
  'leave.requested.v1': {
    entityType: 'leave_request',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: LEAVE_CHANGED_FIELDS,
    branchScoped: false,
    actorRequired: true,
  },
  'leave.approved.v1': {
    entityType: 'leave_request',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: LEAVE_CHANGED_FIELDS,
    branchScoped: false,
    actorRequired: true,
  },
  'leave.rejected.v1': {
    entityType: 'leave_request',
    allowedKeys: COMMON_KEYS,
    allowedChangedFields: LEAVE_CHANGED_FIELDS,
    branchScoped: false,
    actorRequired: true,
  },
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
  if (metadata.result !== 'success') throw new TypeError('result must be success');

  const tenantId = assertUuid(metadata.tenantId, 'tenantId');
  const actorUserId = assertNullableUuid(metadata.actorUserId, 'actorUserId');
  if (policy.actorRequired && actorUserId === null) {
    throw new TypeError('actorUserId is required for leave audit events');
  }
  const actorSessionId = assertNullableUuid(metadata.actorSessionId, 'actorSessionId');
  const entityId = assertUuid(metadata.entityId, 'entityId');
  const requestId = assertRequestId(metadata.requestId);
  const changedFields = assertChangedFields(metadata.changedFields, policy.allowedChangedFields);
  const branchId = policy.branchScoped ? assertUuid(metadata.branchId, 'branchId') : undefined;

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
      result: 'success',
      changedFields,
      ...(branchId ? { branchId } : {}),
    },
  };
}

export function isTransactionalAuditEventName(value: string): value is TransactionalAuditEventName {
  return (
    (COURSE_SUCCESS_AUDIT_EVENT_NAMES as readonly string[]).includes(value) ||
    (ROOM_SUCCESS_AUDIT_EVENT_NAMES as readonly string[]).includes(value) ||
    (TIME_SLOT_SUCCESS_AUDIT_EVENT_NAMES as readonly string[]).includes(value) ||
    (LEAVE_SUCCESS_AUDIT_EVENT_NAMES as readonly string[]).includes(value)
  );
}
