import {
  PublishedScheduleReadFilter,
  PublishedScheduleSnapshot,
  ScheduleValidationEvidence,
  makePublishedSnapshot,
} from './m3-schedule-contract';
import { ScheduleValidationInput, ScheduleValidationReason } from './m3-schedule-contract';
import { validateSchedule } from './schedule-validator';
import { ScheduleVersionMismatchException } from './schedule-revision';
import { SchedulePublishDeniedException } from './schedule-publish-denied';

export type ScheduleAuditEvent = {
  eventName: 'schedule.published' | 'schedule.unpublished' | 'schedule.publish_denied';
  tenantId: string;
  branchId: string;
  scheduleId: string;
  scheduleVersionId?: string;
  actorId: string;
  requestId: string;
  reasonCode?: ScheduleValidationReason['code'];
};

export type ScheduleTransactionPort = {
  insertPublishedVersion(snapshot: PublishedScheduleSnapshot): Promise<void>;
  markSchedulePublished(scheduleId: string, expectedRevision: number, versionId: string): Promise<void>;
  markScheduleUnpublished(scheduleId: string, expectedRevision: number): Promise<void>;
  appendAudit(event: ScheduleAuditEvent): Promise<void>;
};

export type PublishCommand = {
  actorId: string;
  requestId: string;
  expectedRevision: number;
  scheduleVersionId: string;
  versionNo: number;
  publishedAt: string;
  validation: ScheduleValidationEvidence;
  validationInput: ScheduleValidationInput;
  transaction: ScheduleTransactionPort;
};

export async function publishSchedule(command: PublishCommand): Promise<PublishedScheduleSnapshot> {
  if (command.expectedRevision !== command.validationInput.currentScheduleRevision) {
    await command.transaction.appendAudit(denied(command, 'SCHEDULE_VERSION_MISMATCH'));
    throw new ScheduleVersionMismatchException();
  }
  if (command.validation.mode !== 'FULL' || command.validation.evidenceStatus !== 'authoritative') {
    await command.transaction.appendAudit(denied(command, 'SCHEDULE_VALIDATION_STALE'));
    throw new SchedulePublishDeniedException('SCHEDULE_VALIDATION_STALE');
  }

  const validation = validateSchedule({ ...command.validationInput, mode: 'FULL' });
  if (!validation.canPublish) {
    // #453 — neden kodunu koru; dönem çakışması 409, diğer kapalı kapılar 422.
    const code = validation.reasons[0]?.code ?? 'SCHEDULE_HARD_CONFLICTS_PRESENT';
    await command.transaction.appendAudit(denied(command, code));
    throw new SchedulePublishDeniedException(code);
  }

  const snapshot = makePublishedSnapshot({
    tenantId: command.validationInput.tenantId,
    branchId: command.validationInput.branchId,
    scheduleId: command.validationInput.scheduleId,
    scheduleVersionId: command.scheduleVersionId,
    versionNo: command.versionNo,
    effectiveFrom: command.validationInput.effectiveFrom,
    effectiveTo: command.validationInput.effectiveTo ?? null,
    publishedAt: command.publishedAt,
    events: command.validationInput.events,
  });

  await command.transaction.insertPublishedVersion(snapshot);
  await command.transaction.markSchedulePublished(command.validationInput.scheduleId, command.expectedRevision, command.scheduleVersionId);
  await command.transaction.appendAudit({
    eventName: 'schedule.published',
    tenantId: snapshot.tenantId,
    branchId: snapshot.branchId,
    scheduleId: snapshot.scheduleId,
    scheduleVersionId: snapshot.scheduleVersionId,
    actorId: command.actorId,
    requestId: command.requestId,
  });
  return snapshot;
}

export async function unpublishSchedule(command: Omit<PublishCommand, 'validation' | 'validationInput'> & { tenantId: string; branchId: string; scheduleId: string }): Promise<void> {
  await command.transaction.markScheduleUnpublished(command.scheduleId, command.expectedRevision);
  await command.transaction.appendAudit({
    eventName: 'schedule.unpublished',
    tenantId: command.tenantId,
    branchId: command.branchId,
    scheduleId: command.scheduleId,
    actorId: command.actorId,
    requestId: command.requestId,
  });
}

function denied(command: PublishCommand, reasonCode: ScheduleValidationReason['code']): ScheduleAuditEvent {
  return {
    eventName: 'schedule.publish_denied',
    tenantId: command.validationInput.tenantId,
    branchId: command.validationInput.branchId,
    scheduleId: command.validationInput.scheduleId,
    actorId: command.actorId,
    requestId: command.requestId,
    reasonCode,
  };
}

export function filterPublishedSchedules(
  snapshots: readonly PublishedScheduleSnapshot[],
  filter: PublishedScheduleReadFilter,
): PublishedScheduleSnapshot[] {
  return snapshots.filter((snapshot) => {
    if (snapshot.tenantId !== filter.tenantId) return false;
    if (filter.branchId && snapshot.branchId !== filter.branchId) return false;
    if (filter.publishedVersionId && snapshot.scheduleVersionId !== filter.publishedVersionId) return false;
    if (filter.teacherId && !snapshot.events.some((event) => event.teacherId === filter.teacherId)) return false;
    if (filter.from && snapshot.effectiveTo && snapshot.effectiveTo < filter.from) return false;
    if (filter.to && snapshot.effectiveFrom > filter.to) return false;
    return true;
  });
}
