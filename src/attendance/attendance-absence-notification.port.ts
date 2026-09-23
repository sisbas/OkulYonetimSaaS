import { EntityManager } from 'typeorm';

/**
 * Attendance → notification outbox bağlantı noktası (#266, consumer-owned port).
 *
 * `AttendanceSessionService.lock()` kendi transaction'ı içinde bu portu çağırır;
 * böylece kilitlenen oturumun devamsızlık bildirim niyeti domain mutasyonuyla
 * atomik kalıcılaşır. Uygulama notifications modülündedir
 * (`TransactionalAbsenceNotificationAdapter`) → attendance, notifications
 * detaylarına bağımlı olmaz.
 */
export const ATTENDANCE_ABSENCE_NOTIFICATION_PORT = Symbol(
  'ATTENDANCE_ABSENCE_NOTIFICATION_PORT',
);

export type AttendanceAbsenceNotificationInput = Readonly<{
  tenantId: string;
  sessionId: string;
  actorUserId: string;
  channel?: string;
}>;

export type AttendanceAbsenceNotificationResult = Readonly<{
  sessionStatus: string | null;
  absentStudents: number;
  intendedPending: number;
  intendedBlockedConsent: number;
  insertedRows: number;
  duplicatesSkipped: number;
}>;

export interface AttendanceAbsenceNotificationPort {
  enqueueLockedAbsenceNotifications(
    entityManager: EntityManager,
    input: AttendanceAbsenceNotificationInput,
  ): Promise<AttendanceAbsenceNotificationResult>;
}
