export const COURSE_SUCCESS_AUDIT_EVENT_NAMES = [
  'course.created',
  'course.updated',
  'course.deactivated',
  'course.reactivated',
] as const;

export const ROOM_SUCCESS_AUDIT_EVENT_NAMES = [
  'room.created',
  'room.updated',
  'room.archived',
  'room.reactivated',
] as const;

export const TIME_SLOT_SUCCESS_AUDIT_EVENT_NAMES = [
  'time_slot.created',
  'time_slot.updated',
  'time_slot.archived',
  'time_slot.reactivated',
] as const;

export const LEAVE_SUCCESS_AUDIT_EVENT_NAMES = [
  'leave.requested.v1',
  'leave.approved.v1',
  'leave.rejected.v1',
] as const;

export type CourseSuccessAuditEventName = (typeof COURSE_SUCCESS_AUDIT_EVENT_NAMES)[number];
export type RoomSuccessAuditEventName = (typeof ROOM_SUCCESS_AUDIT_EVENT_NAMES)[number];
export type TimeSlotSuccessAuditEventName = (typeof TIME_SLOT_SUCCESS_AUDIT_EVENT_NAMES)[number];
export type LeaveSuccessAuditEventName = (typeof LEAVE_SUCCESS_AUDIT_EVENT_NAMES)[number];

export type TransactionalAuditEventName =
  | CourseSuccessAuditEventName
  | RoomSuccessAuditEventName
  | TimeSlotSuccessAuditEventName
  | LeaveSuccessAuditEventName;

export type CourseAuditChangedField = 'name' | 'code' | 'description' | 'status' | 'deactivatedAt';
export type RoomAuditChangedField =
  | 'branchId'
  | 'name'
  | 'code'
  | 'capacity'
  | 'description'
  | 'status'
  | 'deactivatedAt';
export type TimeSlotAuditChangedField =
  | 'branchId'
  | 'name'
  | 'dayOfWeek'
  | 'startTime'
  | 'endTime'
  | 'orderIndex'
  | 'status'
  | 'archivedAt';
export type LeaveAuditChangedField =
  | 'status'
  | 'coverageStatus'
  | 'durationKind'
  | 'reasonCode'
  | 'startAt'
  | 'endAt'
  | 'version';

type CommonSuccessAuditMetadata<
  TEntityType extends 'course' | 'room' | 'time_slot' | 'leave_request',
  TChangedField extends string,
> = Readonly<{
  schemaVersion: 1;
  tenantId: string;
  actorUserId: string | null;
  actorSessionId: string | null;
  requestId: string;
  entityType: TEntityType;
  entityId: string;
  result: 'success';
  changedFields: readonly TChangedField[];
}>;

export type CourseSuccessAuditMetadata = CommonSuccessAuditMetadata<'course', CourseAuditChangedField>;

export type RoomSuccessAuditMetadata = CommonSuccessAuditMetadata<'room', RoomAuditChangedField> &
  Readonly<{
    branchId: string;
  }>;

export type TimeSlotSuccessAuditMetadata = CommonSuccessAuditMetadata<'time_slot', TimeSlotAuditChangedField> &
  Readonly<{
    branchId: string;
  }>;

export type LeaveSuccessAuditMetadata = CommonSuccessAuditMetadata<'leave_request', LeaveAuditChangedField>;

export type AuditMetadataByEvent = {
  [K in CourseSuccessAuditEventName]: CourseSuccessAuditMetadata;
} & {
  [K in RoomSuccessAuditEventName]: RoomSuccessAuditMetadata;
} & {
  [K in TimeSlotSuccessAuditEventName]: TimeSlotSuccessAuditMetadata;
} & {
  [K in LeaveSuccessAuditEventName]: LeaveSuccessAuditMetadata;
};

export type PersistableAuditRecord = Readonly<{
  tenantId: string;
  actorUserId: string | null;
  actorSessionId: string | null;
  action: TransactionalAuditEventName;
  entityType: 'course' | 'room' | 'time_slot' | 'leave_request';
  entityId: string;
  requestId: string;
  metadataJson: Readonly<{
    schemaVersion: 1;
    result: 'success';
    changedFields: readonly string[];
    branchId?: string;
  }>;
}>;
