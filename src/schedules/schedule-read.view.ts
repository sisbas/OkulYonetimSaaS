import { createHash } from 'node:crypto';

import {
  M3_SCHEDULE_CONTRACT_ID,
  M3_SCHEDULE_CONTRACT_VERSION,
} from './m3-schedule-contract';
import { Schedule } from './schedule.entity';
import { ScheduleStatus } from './schedule.entity';
import { ScheduleVersion, ScheduleVersionStatus } from './schedule-version.entity';

/**
 * Programme okuma yüzeyi — yanıt sözleşmesi.
 *
 * Taslak ile yayınlanmış program AYNI DTO'da taşınır ama `projection`,
 * `gridState` ve `readOnly` alanlarıyla ayrıştırılır (sözleşme §11
 * canonicalGridStates): istemci taslağı hiçbir zaman yayınlanmış olarak
 * render edemez.
 */
export type ScheduleReadProjection =
  | 'management_draft'
  | 'published_branch'
  | 'published_own';

export type ScheduleGridState = 'weekly_grid_ready_draft' | 'weekly_grid_ready_published';

export type ScheduleReadEvent = {
  eventId: string;
  teacherId: string | null;
  teacherBranchId: string | null;
  studentGroupId: string | null;
  courseId: string | null;
  roomId: string | null;
  timeSlotId: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  timeSlotLabel: string | null;
};

export type ScheduleReadVersionMeta = {
  scheduleVersionId: string;
  versionNo: number;
  status: 'draft' | 'published' | 'unpublished';
  publishedAt: string | null;
};

export type ScheduleReadV1 = {
  contractId: typeof M3_SCHEDULE_CONTRACT_ID;
  contractVersion: typeof M3_SCHEDULE_CONTRACT_VERSION;
  scheduleId: string;
  branchId: string;
  status: string;
  projection: ScheduleReadProjection;
  gridState: ScheduleGridState;
  readOnly: boolean;
  revision: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  version: ScheduleReadVersionMeta | null;
  eventCount: number;
  events: ScheduleReadEvent[];
};

export type ScheduleReadSummaryV1 = Omit<ScheduleReadV1, 'events'>;

export type ScheduleReadActor = {
  permissions: ReadonlyArray<string>;
  teacherId: string | null;
};

// ---------------------------------------------------------------------------
// Snapshot normalizasyonu
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isScheduleReadEvent(value: ScheduleReadEvent | null): value is ScheduleReadEvent {
  return value != null;
}

function normalizeEvent(raw: unknown): ScheduleReadEvent | null {
  const row = asRecord(raw);
  if (!row) return null;
  const eventId = asString(row.eventId) ?? asString(row.id);
  if (!eventId) return null;
  const snapshotRow = asRecord(row.timeSlotSnapshot);
  const timeSlotLabel =
    asString(row.timeSlotLabel) ?? asString(snapshotRow?.label) ?? null;
  const dayOfWeek = asNumber(row.dayOfWeek) ?? asNumber(snapshotRow?.dayOfWeek) ?? null;
  const startTime = asString(row.startTime) ?? asString(snapshotRow?.startTime) ?? null;
  const endTime = asString(row.endTime) ?? asString(snapshotRow?.endTime) ?? null;
  return {
    eventId,
    teacherId: asString(row.teacherId),
    teacherBranchId: asString(row.teacherBranchId),
    studentGroupId: asString(row.studentGroupId),
    courseId: asString(row.courseId),
    roomId: asString(row.roomId),
    timeSlotId: asString(row.timeSlotId),
    dayOfWeek,
    startTime,
    endTime,
    timeSlotLabel,
  };
}

/**
 * `schedule_versions.snapshot` iki şekilli okunur:
 *  - legacy: `{ events: [...] }` (bugünkü persisted şekil),
 *  - kanonik: `PublishedScheduleSnapshot` (yine `events` taşır; `timeSlotSnapshot` alanlı).
 */
export function normalizeSnapshotEvents(snapshot: unknown): ScheduleReadEvent[] {
  const list = Array.isArray(snapshot)
    ? snapshot
    : asRecord(snapshot)?.events;
  if (!Array.isArray(list)) return [];
  return list.map(normalizeEvent).filter(isScheduleReadEvent);
}

// ---------------------------------------------------------------------------
// Projeksiyon seçimi
// ---------------------------------------------------------------------------

/**
 * Aktörün projeksiyonunu seçer. `null` dönüyorsa kaynak "keşfedilemez" —
 * çağıran non-enumerating 404 döner (taslak/yayınlanmamış, eşdeğer boş
 * own-projeksiyon).
 */
export function selectScheduleProjection(input: {
  status: ScheduleStatus | 'draft' | 'published' | 'unpublished';
  actor: ScheduleReadActor;
  events: readonly ScheduleReadEvent[];
}): ScheduleReadProjection | null {
  const permissions = new Set(input.actor.permissions);
  const published = input.status === 'published';
  if (permissions.has('schedule:draft:read')) {
    return published ? 'published_branch' : 'management_draft';
  }
  if (published) {
    if (permissions.has('schedule:read')) return 'published_branch';
    if (permissions.has('schedule:own:read')) {
      if (!input.actor.teacherId) return null;
      const ownsAnEvent = input.events.some(
        (event) => !!event.teacherId && event.teacherId === input.actor.teacherId,
      );
      return ownsAnEvent ? 'published_own' : null;
    }
  }
  return null;
}

export function projectEvents(
  projection: ScheduleReadProjection,
  events: readonly ScheduleReadEvent[],
  teacherId: string | null,
): ScheduleReadEvent[] {
  if (projection !== 'published_own') return [...events];
  return events.filter((event) => !!teacherId && event.teacherId === teacherId);
}

// ---------------------------------------------------------------------------
// DTO üretimi
// ---------------------------------------------------------------------------

export function isoDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const match = /(\d{4}-\d{2}-\d{2})/.exec(value);
    return match ? match[1] : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function versionMeta(
  version: ScheduleVersion | null | undefined,
): ScheduleReadVersionMeta | null {
  if (!version) return null;
  return {
    scheduleVersionId: version.id,
    versionNo: Number(version.versionNo),
    status: version.status,
    publishedAt: version.publishedAt ? new Date(version.publishedAt).toISOString() : null,
  };
}

export function toScheduleRead(input: {
  schedule: Schedule;
  version: ScheduleVersion | null;
  projection: ScheduleReadProjection;
  teacherId: string | null;
  events: readonly ScheduleReadEvent[];
}): ScheduleReadV1 {
  const status = input.schedule.status;
  const published = status === 'published';
  const events = projectEvents(input.projection, input.events, input.teacherId);
  return {
    contractId: M3_SCHEDULE_CONTRACT_ID,
    contractVersion: M3_SCHEDULE_CONTRACT_VERSION,
    scheduleId: input.schedule.id,
    branchId: input.schedule.branchId,
    status,
    projection: input.projection,
    gridState: published ? 'weekly_grid_ready_published' : 'weekly_grid_ready_draft',
    readOnly: published,
    revision: Number(input.schedule.revision),
    effectiveFrom: isoDate(input.schedule.effectiveFrom),
    effectiveTo: isoDate(input.schedule.effectiveTo),
    version: versionMeta(input.version),
    eventCount: events.length,
    events,
  };
}

export function summarizeScheduleRead(read: ScheduleReadV1): ScheduleReadSummaryV1 {
  const { events: _events, ...rest } = read;
  return { ...rest };
}

/** En son yayınlanmamış versiyon (draft tercih; yoksa unpublished). */
export function pickManagementVersion(
  versions: readonly ScheduleVersion[],
): ScheduleVersion | null {
  const draft = versions.find((v) => v.status === ScheduleVersionStatus.DRAFT);
  if (draft) return draft;
  const unpublished = versions.filter((v) => v.status === ScheduleVersionStatus.UNPUBLISHED);
  if (unpublished.length === 0) return null;
  return unpublished.reduce((latest, current) =>
    Number(current.versionNo) > Number(latest.versionNo) ? current : latest,
  );
}

/** Yayınlanmış versiyon (varsa); yoksa null. */
export function pickPublishedVersion(
  versions: readonly ScheduleVersion[],
): ScheduleVersion | null {
  return versions.find((v) => v.status === ScheduleVersionStatus.PUBLISHED) ?? null;
}

// ---------------------------------------------------------------------------
// ETag — içerik-adresli (her kayıt/alan değişince değişir)
// ---------------------------------------------------------------------------

const etagOf = (payload: unknown): string =>
  `"schedule:${createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)}"`;

/** Tek bir okumanın (events dahil) içerik eşlemesidir; durum geçişlerinde değişir. */
export function scheduleDetailEtag(read: ScheduleReadV1): string {
  return etagOf(read);
}

/** Listenin tüm kayıtlarını kapsar; herhangi bir alan değişince değişir. */
export function listEtag(items: readonly ScheduleReadSummaryV1[]): string {
  return etagOf(items);
}
