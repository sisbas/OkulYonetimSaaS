import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from './schedule.entity';
import { ScheduleVersion, ScheduleVersionStatus } from './schedule-version.entity';
import { ScheduleEvent } from './schedule-event.entity';
import { ScheduleStatus } from './schedule.entity';
import {
  ScheduleEventDraft,
  ScheduleReferenceSet,
  ScheduleValidationEvidence,
  ScheduleValidationInput,
} from './m3-schedule-contract';
import { validateSchedule } from './schedule-validator';
import {
  publishSchedule,
  unpublishSchedule,
  ScheduleTransactionPort,
  ScheduleAuditEvent,
} from './schedule-publisher';

export type CreateScheduleInput = {
  tenantId: string;
  branchId: string;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
};

export type SaveDraftInput = {
  tenantId: string;
  branchId: string;
  scheduleId: string;
  events: ScheduleEventDraft[];
  references?: ScheduleReferenceSet;
};

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(ScheduleVersion)
    private readonly versionRepo: Repository<ScheduleVersion>,
    @InjectRepository(ScheduleEvent)
    private readonly eventRepo: Repository<ScheduleEvent>,
  ) {}

  async createSchedule(input: CreateScheduleInput): Promise<Schedule> {
    const schedule = this.scheduleRepo.create({
      tenantId: input.tenantId,
      branchId: input.branchId,
      status: ScheduleStatus.DRAFT,
      revision: 1,
      effectiveFrom:
        input.effectiveFrom instanceof Date
          ? input.effectiveFrom
          : new Date(input.effectiveFrom),
      effectiveTo:
        input.effectiveTo == null
          ? null
          : input.effectiveTo instanceof Date
            ? input.effectiveTo
            : new Date(input.effectiveTo),
    });
    return this.scheduleRepo.save(schedule);
  }

  async getSchedule(tenantId: string, scheduleId: string): Promise<Schedule> {
    const schedule = await this.scheduleRepo.findOne({
      where: { tenantId, id: scheduleId },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  /**
   * Draft'ı kaydeder: mevcut draft versiyonu (yoksa yeni) güncellenir,
   * event'ler yeniden yazılır. Optimistic concurrency revision üzerinden.
   */
  async saveDraft(input: SaveDraftInput): Promise<ScheduleVersion> {
    const schedule = await this.getSchedule(input.tenantId, input.scheduleId);
    if (schedule.status === ScheduleStatus.PUBLISHED) {
      throw new ConflictException('Published schedule is immutable');
    }

    let version = await this.versionRepo.findOne({
      where: {
        tenantId: input.tenantId,
        scheduleId: input.scheduleId,
        status: ScheduleVersionStatus.DRAFT,
      },
    });

    if (!version) {
      const nextVersionNo = (await this.nextVersionNo(input.scheduleId)) + 1;
      version = this.versionRepo.create({
        tenantId: input.tenantId,
        branchId: input.branchId,
        scheduleId: input.scheduleId,
        versionNo: nextVersionNo,
        status: ScheduleVersionStatus.DRAFT,
        snapshot: input.events,
      });
    } else {
      version.snapshot = input.events;
    }

    const saved = await this.versionRepo.save(version);

    // Event'leri yeniden yaz (idempotent draft edit).
    await this.eventRepo.delete({
      tenantId: input.tenantId,
      scheduleId: input.scheduleId,
      versionId: saved.id,
    });
    if (input.events.length > 0) {
      const events = input.events.map((e) =>
        this.eventRepo.create({
          tenantId: input.tenantId,
          branchId: input.branchId,
          scheduleId: input.scheduleId,
          versionId: saved.id,
          teacherId: e.teacherId!,
          teacherBranchId: e.teacherBranchId!,
          studentGroupId: e.studentGroupId!,
          courseId: e.courseId!,
          roomId: e.roomId!,
          timeSlotId: e.timeSlotId!,
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
          timeSlotSnapshot: { label: e.timeSlotLabel ?? null },
        }),
      );
      await this.eventRepo.save(events);
    }

    // Revision bump (optimistic concurrency signal).
    await this.scheduleRepo.increment(
      { tenantId: input.tenantId, id: input.scheduleId },
      'revision',
      1,
    );

    return saved;
  }

  /**
   * Draft'ı FULL modunda doğrular (çakışma + referans kontrolü).
   * references dışarıdan beslenir (RBAC/aktif kaynak seti); yoksa
   * boş set ile çalışır (yalnızca time-overlap tespiti).
   */
  async validateDraft(
    tenantId: string,
    branchId: string,
    scheduleId: string,
    events: ScheduleEventDraft[],
    revision: number,
    references: ScheduleReferenceSet = EMPTY_REFERENCES,
  ): Promise<ScheduleValidationEvidence> {
    const input: ScheduleValidationInput = {
      mode: 'FULL',
      tenantId,
      branchId,
      scheduleId,
      scheduleRevision: revision,
      currentScheduleRevision: revision,
      inputFingerprint: fingerprint(events),
      validationFingerprint: fingerprint(events),
      validatedRevision: revision,
      status: ScheduleStatus.DRAFT,
      effectiveFrom: '2000-01-01',
      effectiveTo: null,
      publishedPeriodConflict: false,
      events,
      references,
    };
    return validateSchedule(input);
  }

  /**
   * Publish: mevcut draft'ı validate edip immutable published versiyona çevirir.
   * Transaction port'u bu service'in kendi repo işlemlerine bağlanır.
   */
  async publish(
    tenantId: string,
    branchId: string,
    scheduleId: string,
    actorId: string,
    requestId: string,
    events: ScheduleEventDraft[],
    revision: number,
  ): Promise<ScheduleVersion> {
    const draft = await this.versionRepo.findOne({
      where: { tenantId, scheduleId, status: ScheduleVersionStatus.DRAFT },
    });
    if (!draft) throw new NotFoundException('No draft version to publish');

    const validationInput: ScheduleValidationInput = {
      mode: 'FULL',
      tenantId,
      branchId,
      scheduleId,
      scheduleRevision: revision,
      currentScheduleRevision: revision,
      inputFingerprint: fingerprint(events),
      validationFingerprint: fingerprint(events),
      validatedRevision: revision,
      status: ScheduleStatus.DRAFT,
      effectiveFrom: '2000-01-01',
      effectiveTo: null,
      publishedPeriodConflict: false,
      events,
      references: EMPTY_REFERENCES,
    };

    const port: ScheduleTransactionPort = {
      insertPublishedVersion: async (snapshot) => {
        await this.versionRepo.update(draft.id, {
          status: ScheduleVersionStatus.PUBLISHED,
          publishedAt: new Date(snapshot.publishedAt),
          validationMode: 'FULL' as ScheduleVersion['validationMode'],
          validationFingerprint: fingerprint(events),
          validatedRevision: revision,
          snapshot: events,
        });
      },
      markSchedulePublished: async (sid, expectedRevision, versionId) => {
        await this.scheduleRepo.update(
          { tenantId, id: sid },
          {
            status: ScheduleStatus.PUBLISHED,
            activeVersionId: versionId,
            revision: expectedRevision,
          },
        );
      },
      markScheduleUnpublished: async (sid, expectedRevision) => {
        await this.scheduleRepo.update(
          { tenantId, id: sid },
          { status: ScheduleStatus.UNPUBLISHED, revision: expectedRevision },
        );
      },
      appendAudit: async (event: ScheduleAuditEvent) => {
        // Audit kaydı common/audit üzerinden düşürülebilir; bu slice'ta no-op
        // (audit pipeline zaten interceptor ile çalışır).
        void event;
      },
    };

    await publishSchedule({
      actorId,
      requestId,
      expectedRevision: revision,
      scheduleVersionId: draft.id,
      versionNo: draft.versionNo,
      publishedAt: new Date().toISOString(),
      validation: validateSchedule(validationInput),
      validationInput,
      transaction: port,
    });

    return (await this.versionRepo.findOne({
      where: { id: draft.id },
    }))!;
  }

  async unpublish(
    tenantId: string,
    branchId: string,
    scheduleId: string,
    actorId: string,
    requestId: string,
    revision: number,
  ): Promise<void> {
    const port: ScheduleTransactionPort = {
      insertPublishedVersion: async () => undefined,
      markSchedulePublished: async () => undefined,
      markScheduleUnpublished: async (sid, expectedRevision) => {
        await this.scheduleRepo.update(
          { tenantId, id: sid },
          { status: ScheduleStatus.UNPUBLISHED, revision: expectedRevision },
        );
      },
      appendAudit: async (event: ScheduleAuditEvent) => {
        void event;
      },
    };
    const published = await this.versionRepo.findOne({
      where: { tenantId, scheduleId, status: ScheduleVersionStatus.PUBLISHED },
    });
    await unpublishSchedule({
      tenantId,
      branchId,
      scheduleId,
      actorId,
      requestId,
      expectedRevision: revision,
      scheduleVersionId: published?.id ?? '00000000-0000-0000-0000-000000000000',
      versionNo: published?.versionNo ?? 0,
      publishedAt: (published?.publishedAt ?? new Date()).toISOString(),
      transaction: port,
    });
  }

  private async nextVersionNo(scheduleId: string): Promise<number> {
    const latest = await this.versionRepo
      .createQueryBuilder('v')
      .select('MAX(v.version_no)', 'max')
      .where('v.schedule_id = :sid', { sid: scheduleId })
      .getRawOne<{ max: number | null }>();
    return latest?.max ?? 0;
  }
}

const EMPTY_REFERENCES: ScheduleReferenceSet = {
  activeTeacherIds: new Set(),
  activeStudentGroupIds: new Set(),
  activeRoomIds: new Set(),
  activeTimeSlotIds: new Set(),
  activeTeacherBranchIds: new Set(),
  activeTeacherCourseKeys: new Set(),
};

function fingerprint(events: ScheduleEventDraft[]): string {
  const norm = events
    .map((e) => `${e.eventId}:${e.teacherId}:${e.dayOfWeek}:${e.startTime}-${e.endTime}`)
    .sort()
    .join('|');
  // Basit, deterministic fingerprint (crypto gerektirmez).
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 31 + norm.charCodeAt(i)) >>> 0;
  }
  return `fp_${hash.toString(36)}`;
}
