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
  'leave.substitution_assigned.v1',
  'leave.substitution_cleared.v1',
  'daily_operations.projected.v1',
] as const;

// --- Genişletilmiş audit action tipleri (okul-03-audit-scope) ---
// Kimlik doğrulama / oturum yaşam döngüsü olayları. PII taşımaz; yalnızca
// güvenlik metrikleri (başarısız deneme, hesap kilitlenmesi) kaydedilir.
export const AUTH_AUDIT_EVENT_NAMES = [
  'auth.login.success',
  'auth.login.failure',
  'auth.logout',
  'auth.token_refreshed',
  'auth.account_locked',
] as const;

// KVKK veri koruma (data-protection) yaşam döngüsü olayları. `redactionReceipt`
// sayesinde her çıktı/ihraç işlemi, PII'nin maskelendiğinin denetlenebilir
// kanıtıyla birlikte kaydedilir (KVKK madde 12 — teknik tedbir denetimi).
export const DATA_PROTECTION_AUDIT_EVENT_NAMES = [
  'dataprotection.export.redacted',
  'dataprotection.subject_access_request.served',
  'dataprotection.erasure.requested',
  'dataprotection.erasure.completed',
  'dataprotection.consent.revoked',
] as const;

// Öğrenci / veli yaşam döngüsü olayları. `actorRequired` ile işlemi yapan
// kullanıcı zorunlu kılınır; veli iletişim bilgileri allowlist DIŞINDADIR.
export const STUDENT_AUDIT_EVENT_NAMES = [
  'student.created',
  'student.updated',
  'student.deactivated',
  'student.transferred',
] as const;

// Öğretmen yaşam döngüsü olayları. KVKK gereği `teacherName`/`teacherEmail`
// gibi PII alanları allowlist'e DAHİL EDİLMEZ.
export const TEACHER_AUDIT_EVENT_NAMES = [
  'teacher.created',
  'teacher.updated',
  'teacher.deactivated',
] as const;

// Devam/devamsızlık olayları. Öğrenci kimliği yalnızca UUID olarak tutulur.
export const ATTENDANCE_AUDIT_EVENT_NAMES = [
  'attendance.session.opened',
  'attendance.session.closed',
  'attendance.record.marked',
] as const;

// Bildirim olayları. `notificationBody`/`messageBody` gibi serbest metinler
// allowlist DIŞINDADIR (KVKK — özel hayatın gizliliği).
export const NOTIFICATION_AUDIT_EVENT_NAMES = [
  'notification.sent',
  'notification.failed',
  'notification.preferences.updated',
] as const;

export type CourseSuccessAuditEventName = (typeof COURSE_SUCCESS_AUDIT_EVENT_NAMES)[number];
export type RoomSuccessAuditEventName = (typeof ROOM_SUCCESS_AUDIT_EVENT_NAMES)[number];
export type TimeSlotSuccessAuditEventName = (typeof TIME_SLOT_SUCCESS_AUDIT_EVENT_NAMES)[number];
export type LeaveSuccessAuditEventName = (typeof LEAVE_SUCCESS_AUDIT_EVENT_NAMES)[number];
export type AuthAuditEventName = (typeof AUTH_AUDIT_EVENT_NAMES)[number];
export type DataProtectionAuditEventName = (typeof DATA_PROTECTION_AUDIT_EVENT_NAMES)[number];
export type StudentAuditEventName = (typeof STUDENT_AUDIT_EVENT_NAMES)[number];
export type TeacherAuditEventName = (typeof TEACHER_AUDIT_EVENT_NAMES)[number];
export type AttendanceAuditEventName = (typeof ATTENDANCE_AUDIT_EVENT_NAMES)[number];
export type NotificationAuditEventName = (typeof NOTIFICATION_AUDIT_EVENT_NAMES)[number];

// Enum benzeri event adları için küçük string literal yardımcıları (tip genişletilebilirliği).
export type AuthAuditAction = AuthAuditEventName;
export type DataProtectionAuditAction = DataProtectionAuditEventName;
export type StudentAuditAction = StudentAuditEventName;
export type TeacherAuditAction = TeacherAuditEventName;
export type AttendanceAuditAction = AttendanceAuditEventName;
export type NotificationAuditAction = NotificationAuditEventName;

export type TransactionalAuditEventName =
  | CourseSuccessAuditEventName
  | RoomSuccessAuditEventName
  | TimeSlotSuccessAuditEventName
  | LeaveSuccessAuditEventName
  | AuthAuditEventName
  | DataProtectionAuditEventName
  | StudentAuditEventName
  | TeacherAuditEventName
  | AttendanceAuditEventName
  | NotificationAuditEventName;

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
  | 'substitutionAssignment'
  | 'dailyOperationsProjection'
  | 'version';

// --- Yeni event aileleri için değişen alan allowlist'leri ---
export type AuthAuditChangedField = 'reason' | 'failureReason' | 'lockReason' | 'mfaMethod';
export type DataProtectionAuditChangedField =
  | 'purpose'
  | 'format'
  | 'recordCount'
  | 'redactionStrategy'
  | 'legalBasis'
  | 'erasureScope';
export type StudentAuditChangedField =
  | 'status'
  | 'enrollmentStatus'
  | 'branchId'
  | 'studentGroupId'
  | 'deactivatedAt'
  | 'transferredAt';
export type TeacherAuditChangedField = 'status' | 'branchId' | 'employmentStatus' | 'deactivatedAt';
export type AttendanceAuditChangedField =
  | 'status'
  | 'openedAt'
  | 'closedAt'
  | 'markedForStudentId'
  | 'present'
  | 'lateMinutes';
export type NotificationAuditChangedField =
  | 'channel'
  | 'status'
  | 'templateId'
  | 'recipientRole'
  | 'preferenceKey';

type CommonSuccessAuditMetadata<
  TEntityType extends
    | 'course'
    | 'room'
    | 'time_slot'
    | 'leave_request'
    | 'auth'
    | 'dataprotection'
    | 'student'
    | 'teacher'
    | 'attendance'
    | 'notification',
  TChangedField extends string,
> = Readonly<{
  schemaVersion: 1;
  tenantId: string;
  actorUserId: string | null;
  actorSessionId: string | null;
  requestId: string;
  entityType: TEntityType;
  entityId: string;
  result: 'success' | 'failure';
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

// Kimlik doğrulama olayları: başarısız denemelerde `failureReason` allowlist'e dahildir.
export type AuthAuditMetadata = CommonSuccessAuditMetadata<'auth', AuthAuditChangedField>;

// KVKK veri koruma olayları: çıktı/ihraç işleminin PII maskelendiğine dair
// denetlenebilir kanıt (redactionReceipt) ZORUNLUDUR (KVKK madde 12).
export type DataProtectionAuditMetadata = CommonSuccessAuditMetadata<
  'dataprotection',
  DataProtectionAuditChangedField
> &
  Readonly<{
    redactionReceipt: RedactionReceipt;
  }>;

export type StudentAuditMetadata = CommonSuccessAuditMetadata<'student', StudentAuditChangedField> &
  Readonly<{
    branchId: string;
  }>;

export type TeacherAuditMetadata = CommonSuccessAuditMetadata<'teacher', TeacherAuditChangedField> &
  Readonly<{
    branchId: string;
  }>;

export type AttendanceAuditMetadata = CommonSuccessAuditMetadata<'attendance', AttendanceAuditChangedField>;

export type NotificationAuditMetadata = CommonSuccessAuditMetadata<'notification', NotificationAuditChangedField>;

/**
 * KVKK redaction kanıt kaydı.
 *
 * Bir audit kaydı ya da dışa aktarılan veri PII içeriyorsa, bu nesne ilgili
 * PII alanlarının maskelendiğini ve kullanılan maskeleme stratejisini somut
 * olarak belgeler. `redactedFieldCount + skippedFieldCount === evaluatedFieldCount`
 * olmalıdır; bu, denetçinin "maskelenmeyen alan kalmadı" çıkarımını yapmasını sağlar.
 */
export type RedactionReceipt = Readonly<{
  /** Maskelenen alan sayısı (ör. ad, telefon, e-posta). */
  redactedFieldCount: number;
  /** PII olmadığı için maskelenmeyen alan sayısı. */
  skippedFieldCount: number;
  /** Toplam incelenen alan sayısı. */
  evaluatedFieldCount: number;
  /** Kullanılan maskeleme stratejisi (ör. partial-mask, full-redact). */
  strategy: 'partial-mask' | 'full-redact' | 'hash' | 'none';
  /** Maskeleme zamanı (ISO-8601). */
  appliedAt: string;
}>;

export type AuditMetadataByEvent = {
  [K in CourseSuccessAuditEventName]: CourseSuccessAuditMetadata;
} & {
  [K in RoomSuccessAuditEventName]: RoomSuccessAuditMetadata;
} & {
  [K in TimeSlotSuccessAuditEventName]: TimeSlotSuccessAuditMetadata;
} & {
  [K in LeaveSuccessAuditEventName]: LeaveSuccessAuditMetadata;
} & {
  [K in AuthAuditEventName]: AuthAuditMetadata;
} & {
  [K in DataProtectionAuditEventName]: DataProtectionAuditMetadata;
} & {
  [K in StudentAuditEventName]: StudentAuditMetadata;
} & {
  [K in TeacherAuditEventName]: TeacherAuditMetadata;
} & {
  [K in AttendanceAuditEventName]: AttendanceAuditMetadata;
} & {
  [K in NotificationAuditEventName]: NotificationAuditMetadata;
};

export type PersistableAuditRecord = Readonly<{
  tenantId: string;
  actorUserId: string | null;
  actorSessionId: string | null;
  action: TransactionalAuditEventName;
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
  entityId: string;
  requestId: string;
  metadataJson: Readonly<{
    schemaVersion: 1;
    result: 'success' | 'failure';
    changedFields: readonly string[];
    branchId?: string;
    redactionReceipt?: RedactionReceipt;
  }>;
}>;

// --- Tenant-scoped audit filtreleme (okul-03-audit-scope) ---

export type AuditActionFilter =
  | TransactionalAuditEventName
  | `${string}.${string}` // joker event ailesi (ör. 'auth.*', 'student.*')
  | '*';

/**
 * Tenant'a özgü audit sorgu filtresi. `tenantId` ZORUNLUDUR — audit logları
 * asla tenant sınırının dışına sızamaz (tenant isolation garantisi).
 */
export type TenantScopedAuditQuery = Readonly<{
  tenantId: string;
  entityType?: PersistableAuditRecord['entityType'];
  entityId?: string;
  actions?: readonly AuditActionFilter[];
  actorUserId?: string;
  fromCreatedAt?: Date | string;
  toCreatedAt?: Date | string;
  limit?: number;
  offset?: number;
}>;

/** Normalleştirilmiş (DB-agnostik) tenant-scoped audit satırı. */
export type TenantScopedAuditRow = Readonly<{
  id: string;
  tenantId: string;
  actorUserId: string | null;
  actorSessionId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  requestId: string;
  metadataJson: Record<string, unknown> | null;
  createdAt: Date | string;
}>;
