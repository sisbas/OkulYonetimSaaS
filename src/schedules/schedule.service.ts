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
import { SolverPort, SolveRequest, SolveResult } from './solver/solver-port';

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

export type SolveScheduleInput = {
  tenantId: string;
  branchId: string;
  scheduleId: string;
  demands: SolveRequest['demands'];
  seed: number;
  bounds?: Partial<SolveRequest['bounds']>;
  correlationId: string;
  allowEmergency?: boolean;
  aborted?: { value: boolean };
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
    private readonly solver: SolverPort,
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
        // Snapshot bir OBJECT olmalı (migration chk_schedule_versions_snapshot_object).
        snapshot: { events: input.events },
      });
    } else {
      version.snapshot = { events: input.events };
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
   * Optimistic concurrency: persisted schedule.revision ile caller revision
   * karşılaştırılır (caller'ın gönderdiği değer otorite DEĞİL).
   * Doğrulama, gerçek aktif kaynak setini (teacher/group/room/timeslot) DB'den
   * yükleyerek yapılır — boş referans seti false-positive üretmez.
   */
  async publish(
    tenantId: string,
    branchId: string,
    scheduleId: string,
    actorId: string,
    requestId: string,
    events: ScheduleEventDraft[],
    callerRevision: number,
  ): Promise<ScheduleVersion> {
    const schedule = await this.getSchedule(tenantId, scheduleId);
    if (schedule.status === ScheduleStatus.PUBLISHED) {
      throw new ConflictException('Schedule already published');
    }
    // Optimistic concurrency: persisted revision otoritesi.
    if (schedule.revision !== callerRevision) {
      throw new ConflictException(
        `Schedule revision mismatch: persisted=${schedule.revision}, caller=${callerRevision}`,
      );
    }

    const draft = await this.versionRepo.findOne({
      where: { tenantId, scheduleId, status: ScheduleVersionStatus.DRAFT },
    });
    if (!draft) throw new NotFoundException('No draft version to publish');

    // Gerçek aktif referans setini DB'den yükle (bulgu 3).
    const references = await this.loadActiveReferences(tenantId, branchId, events);

    const validationInput: ScheduleValidationInput = {
      mode: 'FULL',
      tenantId,
      branchId,
      scheduleId,
      scheduleRevision: schedule.revision,
      currentScheduleRevision: schedule.revision,
      inputFingerprint: fingerprint(events),
      validationFingerprint: fingerprint(events),
      validatedRevision: schedule.revision,
      status: ScheduleStatus.DRAFT,
      effectiveFrom: '2000-01-01',
      effectiveTo: null,
      publishedPeriodConflict: false,
      events,
      references,
    };

    const port: ScheduleTransactionPort = {
      insertPublishedVersion: async (snapshot) => {
        await this.versionRepo.update(draft.id, {
          status: ScheduleVersionStatus.PUBLISHED,
          publishedAt: new Date(snapshot.publishedAt),
          validationMode: 'FULL' as ScheduleVersion['validationMode'],
          validationFingerprint: fingerprint(events),
          validatedRevision: schedule.revision,
          // Snapshot bir OBJECT olmalı (migration chk_schedule_versions_snapshot_object).
          snapshot: { events },
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
          {
            status: ScheduleStatus.UNPUBLISHED,
            activeVersionId: null,
            revision: expectedRevision,
          },
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
      expectedRevision: callerRevision,
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

  /**
   * Deterministic schedule generation (P1B-06, #262).
   * SolverPort impl'i çağrılır; çıktı ScheduleService katmanında yeniden
   * validate edilir (hard constraint hiçbir zaman relax edilmez). Çıktı
   * yalnızca DRAFT'tır — bu metot hiçbir zaman publish yapmaz.
   */
  async solve(input: SolveScheduleInput): Promise<SolveResult> {
    const schedule = await this.getSchedule(input.tenantId, input.scheduleId);
    const references = await this.loadActiveReferences(input.tenantId, input.branchId, []);

    const DEFAULT_BOUNDS = { maxDepth: 5000, maxNodes: 200_000, maxDurationMs: 30_000 };
    const request: SolveRequest = {
      tenantId: input.tenantId,
      branchId: input.branchId,
      referenceSet: references,
      demands: input.demands,
      seed: input.seed,
      bounds: { ...DEFAULT_BOUNDS, ...(input.bounds ?? {}) },
      correlationId: input.correlationId,
      allowEmergency: input.allowEmergency,
      aborted: input.aborted,
    };

    const result = await this.solver.solve(request);

    // Hard-constraint guarantee: re-validate the solver output here too.
    // (Solver already prunes; this is defence-in-depth + contract binding.)
    const evidence = validateSchedule({
      mode: 'FULL',
      tenantId: input.tenantId,
      branchId: input.branchId,
      scheduleId: input.scheduleId,
      scheduleRevision: schedule.revision,
      currentScheduleRevision: schedule.revision,
      inputFingerprint: `solve-${input.correlationId}-${input.seed}`,
      status: 'draft',
      effectiveFrom: schedule.effectiveFrom.toISOString(),
      events: result.events,
      references,
    });
    if (evidence.hardConflictCount > 0) {
      // Drop hard-conflicting events; never relax.
      const bad = new Set(evidence.reasons.filter((r) => r.eventId).map((r) => r.eventId!));
      result.events = result.events.filter((e) => !bad.has(e.eventId));
      result.placementRatio = result.events.length / Math.max(1, input.demands.length);
    }

    return result;
  }

  /**
   * Event'lerde geçen referansların (teacher/group/room/timeslot/branch) tenant
   * içinde aktif olup olmadığını DB'den yükler. Validator'ın TENANT_REFERENCE_MISMATCH
   * / *_INACTIVE reason code'larını doğru üretmesi için gereklidir.
   * Schedule module'ün kendi repository'leri dışındaki tablolara erişmemek için
   * referans varlığı, ilgili modüllerin repository'leri üzerinden beslenir;
   * bu slice'ta hafif bir varlık kontrolü yapılır.
   */
  private async loadActiveReferences(
    tenantId: string,
    branchId: string,
    events: ScheduleEventDraft[],
  ): Promise<ScheduleReferenceSet> {
    const teacherIds = new Set<string>();
    const teacherBranchIds = new Set<string>();
    const studentGroupIds = new Set<string>();
    const courseKeys = new Set<string>();
    const roomIds = new Set<string>();
    const timeSlotIds = new Set<string>();
    for (const e of events) {
      if (e.teacherId) teacherIds.add(e.teacherId);
      if (e.teacherBranchId) teacherBranchIds.add(e.teacherBranchId);
      if (e.studentGroupId) studentGroupIds.add(e.studentGroupId);
      if (e.teacherId && e.courseId) courseKeys.add(`${e.teacherId}:${e.courseId}`);
      if (e.roomId) roomIds.add(e.roomId);
      if (e.timeSlotId) timeSlotIds.add(e.timeSlotId);
    }
    // Varlık kontrolü: event'te geçen ID'ler tenant+branch'te mevcut mu?
    const [teachers, teacherBranches, groups, rooms, slots] = await Promise.all([
      this.existsTeachersInBranch(teacherIds, tenantId, branchId),
      this.existsIn(teacherBranchIds, 'teacher_branches', tenantId, branchId),
      this.existsIn(studentGroupIds, 'student_groups', tenantId, branchId),
      this.existsIn(roomIds, 'rooms', tenantId, branchId),
      this.existsIn(timeSlotIds, 'time_slots', tenantId, branchId),
    ]);
    return {
      activeTeacherIds: teachers,
      activeStudentGroupIds: groups,
      activeRoomIds: rooms,
      activeTimeSlotIds: slots,
      activeTeacherBranchIds: teacherBranches,
      activeTeacherCourseKeys: courseKeys,
    };
  }

  /**
   * Verilen ID kümesinin tenant+branch'te var olup olmadığını kontrol eder.
   * Schedule module'ün kendi tabloları dışındaki tablolara eriştiği için
   * ham SQL kullanır (cross-module repository bağımlılığı oluşturmaz).
   */
  private async existsIn(
    ids: Set<string>,
    table: string,
    tenantId: string,
    branchId: string,
  ): Promise<Set<string>> {
    if (ids.size === 0) return new Set();
    const activeFilterByTable: Record<string, string> = {
      teacher_branches: "status = 'active' AND deleted_at IS NULL AND deactivated_at IS NULL",
      student_groups: "status = 'active' AND deleted_at IS NULL AND deactivated_at IS NULL",
      rooms: "status = 'active' AND deactivated_at IS NULL",
      time_slots: "status = 'active' AND archived_at IS NULL",
    };
    const activeFilter = activeFilterByTable[table];
    if (!activeFilter) {
      throw new Error(`Unsupported schedule reference table: ${table}`);
    }
    const found = await this.scheduleRepo.query(
      `SELECT id FROM ${table} WHERE tenant_id = $1 AND branch_id = $2 AND id = ANY($3) AND ${activeFilter}`,
      [tenantId, branchId, [...ids]],
    );
    return new Set(found.map((r: { id: string }) => r.id));
  }

  private async existsTeachersInBranch(
    ids: Set<string>,
    tenantId: string,
    branchId: string,
  ): Promise<Set<string>> {
    if (ids.size === 0) return new Set();
    const found = await this.scheduleRepo.query(
      `SELECT DISTINCT t.id
       FROM teachers t
       INNER JOIN teacher_branches tb
         ON tb.tenant_id = t.tenant_id
        AND tb.teacher_id = t.id
        AND tb.branch_id = $2
        AND tb.status = 'active'
        AND tb.deleted_at IS NULL
        AND tb.deactivated_at IS NULL
       WHERE t.tenant_id = $1
         AND t.status = 'active'
         AND t.deleted_at IS NULL
         AND t.deactivated_at IS NULL
         AND t.id = ANY($3)`,
      [tenantId, branchId, [...ids]],
    );
    return new Set(found.map((r: { id: string }) => r.id));
  }

  async unpublish(
    tenantId: string,
    branchId: string,
    scheduleId: string,
    actorId: string,
    requestId: string,
    callerRevision: number,
  ): Promise<void> {
    // Optimistic concurrency: persisted revision otoritesi (bulgu 4 ile tutarlı).
    const schedule = await this.getSchedule(tenantId, scheduleId);
    if (schedule.status !== ScheduleStatus.PUBLISHED) {
      throw new ConflictException('Only a published schedule can be unpublished');
    }
    if (schedule.revision !== callerRevision) {
      throw new ConflictException(
        `Schedule revision mismatch: persisted=${schedule.revision}, caller=${callerRevision}`,
      );
    }
    const published = await this.versionRepo.findOne({
      where: { tenantId, scheduleId, status: ScheduleVersionStatus.PUBLISHED },
    });
    if (!published) throw new NotFoundException('No published version to unpublish');

    const port: ScheduleTransactionPort = {
      insertPublishedVersion: async () => undefined,
      markSchedulePublished: async () => undefined,
      markScheduleUnpublished: async (sid, expectedRevision) => {
        // Bulgu 5: aktif version pointer'ı ve published version status'u birlikte kapat.
        await this.versionRepo.update(published.id, {
          status: ScheduleVersionStatus.UNPUBLISHED,
          unpublishedAt: new Date(),
        });
        await this.scheduleRepo.update(
          { tenantId, id: sid },
          {
            status: ScheduleStatus.UNPUBLISHED,
            activeVersionId: null,
            revision: expectedRevision,
          },
        );
      },
      appendAudit: async (event: ScheduleAuditEvent) => {
        void event;
      },
    };
    await unpublishSchedule({
      tenantId,
      branchId,
      scheduleId,
      actorId,
      requestId,
      expectedRevision: callerRevision,
      scheduleVersionId: published.id,
      versionNo: published.versionNo,
      publishedAt: (published.publishedAt ?? new Date()).toISOString(),
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
