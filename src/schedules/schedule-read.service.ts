import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { NON_ENUMERATING_NOT_FOUND_MESSAGE } from '../common/context/deny-response';
import { RequestContext } from '../common/context/request-context';
import { TeacherRepository } from '../teachers/teacher.repository';
import { Schedule, ScheduleStatus } from './schedule.entity';
import { ScheduleVersion } from './schedule-version.entity';
import {
  isoDate,
  normalizeSnapshotEvents,
  pickManagementVersion,
  pickPublishedVersion,
  selectScheduleProjection,
  summarizeScheduleRead,
  toScheduleRead,
  type ScheduleReadActor,
  type ScheduleReadSummaryV1,
  type ScheduleReadV1,
} from './schedule-read.view';

export type ListDraftsInput = {
  tenantId: string;
  branchId: string;
};

export type ListPublishedInput = {
  tenantId: string;
  branchId: string;
  /** Sunucudan çözülmüş istemci bağlamı (izinler ve users.id burada). */
  ctx: RequestContext;
  /** Opsiyonel etkin dönem örtüşmesi (ISO tarih): from/to. */
  from?: string | null;
  to?: string | null;
};

export type ReadScheduleInput = {
  tenantId: string;
  branchId: string;
  scheduleId: string;
  ctx: RequestContext;
};

@Injectable()
export class ScheduleReadService {
  constructor(
    @InjectRepository(Schedule) private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(ScheduleVersion)
    private readonly versionRepo: Repository<ScheduleVersion>,
    private readonly teachers: TeacherRepository,
  ) {}

  /**
   * GET /schedules/drafts — yönetim kapsamı; taslak + yayınlanmamış.
   * Sözleşme: yalnız `schedule:draft:read` anahtarına sahip aktörler
   * (guard zaten zorunlu kılar).
   */
  async listManagementDrafts(input: ListDraftsInput): Promise<ScheduleReadSummaryV1[]> {
    const schedules = await this.loadSchedules(input.tenantId, input.branchId, [
      ScheduleStatus.DRAFT,
      ScheduleStatus.UNPUBLISHED,
    ]);
    if (schedules.length === 0) return [];
    const versions = await this.loadVersions(
      input.tenantId,
      schedules.map((s) => s.id),
    );
    const byVersions = groupBy(versions, (v) => v.scheduleId);
    return schedules.map((schedule) =>
      this.toManagementRead(schedule, byVersions.get(schedule.id) ?? []),
    );
  }

  /**
   * GET /schedules/published — yayınlanmış programlar; branch veya
   * kendi (own) projeksiyonu. Sözleşme: `schedule:read` veya `schedule:own:read`.
   */
  async listPublished(input: ListPublishedInput): Promise<ScheduleReadSummaryV1[]> {
    const schedules = await this.loadSchedules(input.tenantId, input.branchId, [
      ScheduleStatus.PUBLISHED,
    ]);
    const filtered = filterByEffectiveOverlap(schedules, input.from ?? null, input.to ?? null);
    if (filtered.length === 0) return [];
    const versions = await this.loadVersions(
      input.tenantId,
      filtered.map((s) => s.id),
    );
    const byVersions = groupBy(versions, (v) => v.scheduleId);
    const actor = await this.resolveActor(input.ctx);
    return filtered
      .map((schedule) => {
        const version = pickPublishedVersion(byVersions.get(schedule.id) ?? []);
        const events = normalizeSnapshotEvents(version?.snapshot);
        const projection = selectScheduleProjection({
          status: schedule.status,
          actor,
          events,
        });
        if (!projection) return null;
        return summarizeScheduleRead(
          toScheduleRead({
            schedule,
            version,
            projection,
            teacherId: actor.teacherId,
            events,
          }),
        );
      })
      .filter((read): read is ScheduleReadSummaryV1 => !!read);
  }

  /**
   * GET /schedules/:scheduleId — yönetim kapsamındaki taslak
   * (`management_draft`) veya yayınlanmış program (yayınlanmış branch
   * projeksiyonu / kendi projeksiyonu). Erişilemeyen veya keşfedilemeyen
   * kaynaklar non-enumerating 404'tür.
   */
  async readSchedule(input: ReadScheduleInput): Promise<ScheduleReadV1> {
    const schedule = await this.scheduleRepo.findOne({
      where: { tenantId: input.tenantId, branchId: input.branchId, id: input.scheduleId },
    });
    if (!schedule) throw this.notFound();

    const versions = await this.versionRepo.find({
      where: { tenantId: input.tenantId, scheduleId: input.scheduleId },
    });
    const version =
      schedule.status === ScheduleStatus.PUBLISHED
        ? pickPublishedVersion(versions)
        : pickManagementVersion(versions);

    const events = normalizeSnapshotEvents(version?.snapshot);
    const actor = await this.resolveActor(input.ctx);
    const projection = selectScheduleProjection({
      status: schedule.status,
      actor,
      events,
    });
    if (!projection) throw this.notFound();

    return toScheduleRead({
      schedule,
      version,
      projection,
      teacherId: actor.teacherId,
      events,
    });
  }

  // -------------------------------------------------------------------------

  private notFound(): NotFoundException {
    return new NotFoundException(NON_ENUMERATING_NOT_FOUND_MESSAGE);
  }

  private async loadSchedules(tenantId: string, branchId: string, statuses: ScheduleStatus[]) {
    return this.scheduleRepo.find({
      where: { tenantId, branchId, status: In(statuses) },
      order: { revision: 'DESC' },
    });
  }

  private async loadVersions(tenantId: string, scheduleIds: string[]) {
    if (scheduleIds.length === 0) return [];
    return this.versionRepo.find({
      where: { tenantId, scheduleId: In(scheduleIds) },
    });
  }

  /**
   * Own projeksiyonu için users.id → teachers.id çözümlemesi yalnızca
   * `schedule:own:read` + yönetim/okuma anahtarları yokken yapılır; aksi hâlde
   * DB'ye gidilmez (admin/ops için maliyet sıfır).
   */
  private async resolveActor(ctx: RequestContext): Promise<ScheduleReadActor> {
    const permissions = [...(ctx.permissions ?? [])];
    const perms = new Set(permissions);
    const needsOwn =
      perms.has('schedule:own:read') &&
      !perms.has('schedule:draft:read') &&
      !perms.has('schedule:read');
    if (!needsOwn) {
      return { permissions, teacherId: null };
    }
    const teacher = await this.teachers.findActiveTeacherForUser(ctx);
    return { permissions, teacherId: teacher?.teacherId ?? null };
  }

  private toManagementRead(
    schedule: Schedule,
    versions: ReadonlyArray<ScheduleVersion>,
  ): ScheduleReadSummaryV1 {
    const version = pickManagementVersion(versions);
    return summarizeScheduleRead(
      toScheduleRead({
        schedule,
        version,
        projection: 'management_draft',
        teacherId: null,
        events: normalizeSnapshotEvents(version?.snapshot),
      }),
    );
  }
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(key(item)) ?? [];
    list.push(item);
    map.set(key(item), list);
  }
  return map;
}

function isoDateOf(value: Date | string | null | undefined): string | null {
  return isoDate(value);
}

function filterByEffectiveOverlap(
  schedules: Schedule[],
  from: string | null,
  to: string | null,
): Schedule[] {
  if (!from && !to) return schedules;
  return schedules.filter((schedule) => {
    const effectiveFrom = isoDateOf(schedule.effectiveFrom);
    const effectiveTo = isoDateOf(schedule.effectiveTo);
    if (from && effectiveTo && effectiveTo < from) return false;
    if (to && effectiveFrom && effectiveFrom > to) return false;
    return true;
  });
}
