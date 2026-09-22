import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import {
  AbsenceNotificationService,
} from './absence-notification.service';
import {
  AttendanceAbsenceNotificationInput,
  AttendanceAbsenceNotificationPort,
  AttendanceAbsenceNotificationResult,
} from '../attendance/attendance-absence-notification.port';

export const TRANSACTIONAL_ABSENCE_NOTIFICATION =
  'TRANSACTIONAL_ABSENCE_NOTIFICATION';

/** Attendance portunun notifications tarafındaki uygulaması (#266). */
@Injectable()
export class TransactionalAbsenceNotificationAdapter
  implements AttendanceAbsenceNotificationPort
{
  constructor(private readonly service: AbsenceNotificationService) {}

  async enqueueLockedAbsenceNotifications(
    entityManager: EntityManager,
    input: AttendanceAbsenceNotificationInput,
  ): Promise<AttendanceAbsenceNotificationResult> {
    return this.service.enqueueLockedAbsenceNotifications(entityManager, input);
  }
}
