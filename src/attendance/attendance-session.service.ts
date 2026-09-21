import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AttendanceSession,
  AttendanceSessionStatus,
} from './attendance-session.entity';
import { AttendanceRecord, AttendanceStatus } from './attendance.entity';
import { ScheduleEvent } from '../schedules/schedule-event.entity';
import {
  ScheduleVersion,
  ScheduleVersionStatus,
} from '../schedules/schedule-version.entity';
import { RequestContext } from '../common/context/request-context';
import {
  assertAttendanceSessionAccess,
  AttendanceActor,
} from './attendance-access';

export interface CreateSessionInput {
  tenantId: string;
  scheduleEventId: string;
  sessionDate: Date;
  studentIds: string[];
  actorId?: string | null;
}

export interface MarkSessionRecordInput {
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  notes?: string | null;
}

/**
 * AttendanceSession lifecycle (OKUL-06, M5).
 *
 * - createFromPublishedOccurrence: yalnızca PUBLISHED ScheduleEvent'den türetir;
 *   rosterSnapshot immutable. Idempotent: aynı (tenant, event, date) varsa günceller.
 * - lock: draft/published -> locked (optimistic concurrency via version).
 * - markRecord: session altında AttendanceRecord upsert (mevcut AttendanceService
 *   mark'ını yeniden kullanır; teacher-own-lesson kontrolü guard katmanında).
 */
@Injectable()
export class AttendanceSessionService {
  private readonly logger = new Logger(AttendanceSessionService.name);

  constructor(
    @InjectRepository(AttendanceSession)
    private readonly sessionRepo: Repository<AttendanceSession>,
    @InjectRepository(ScheduleEvent)
    private readonly eventRepo: Repository<ScheduleEvent>,
    @InjectRepository(AttendanceRecord)
    private readonly recordRepo: Repository<AttendanceRecord>,
    @InjectRepository(ScheduleVersion)
    private readonly versionRepo: Repository<ScheduleVersion>,
  ) {}

  async createFromPublishedOccurrence(
    input: CreateSessionInput,
    ctx?: RequestContext,
  ): Promise<AttendanceSession> {
    // Immutable roster snapshot: boş roster ile oturum asla işaretlenemez
    // (AC-2); oluşturmayı baştan reddederiz.
    if (!input.studentIds?.length) {
      throw new ForbiddenException(
        'AttendanceSession requires a non-empty roster snapshot',
      );
    }

    const event = await this.eventRepo.findOne({
      where: { id: input.scheduleEventId, tenantId: input.tenantId },
    });
    if (!event) {
      throw new NotFoundException('ScheduleEvent not found or not in tenant');
    }

    const existing = await this.sessionRepo.findOne({
      where: {
        tenantId: input.tenantId,
        scheduleEventId: input.scheduleEventId,
        sessionDate: input.sessionDate,
      },
    });

    if (existing) {
      // Idempotent: roster + version korunur, yeniden oluşturulmaz.
      this.logger.log(
        JSON.stringify({
          event: 'attendance.session.already_exists',
          tenantId: input.tenantId,
          sessionId: existing.id,
        }),
      );
      return existing;
    }

    // AC-2 (#265): oturum YALNIZCA yayınlanmış bir schedule sürümünden türer.
    // Yayın durumu ScheduleEvent üzerinde değil ScheduleVersion üzerindedir
    // (status + published_at + unpublished_at).
    const version = await this.versionRepo.findOne({
      where: { id: event.versionId, tenantId: input.tenantId },
    });
    if (!version) {
      throw new NotFoundException('Schedule version not found for event');
    }
    if (
      version.status !== ScheduleVersionStatus.PUBLISHED ||
      !version.publishedAt ||
      version.unpublishedAt
    ) {
      throw new ForbiddenException(
        'AttendanceSession can only be created from a published schedule occurrence',
      );
    }

    const session = this.sessionRepo.create({
      tenantId: input.tenantId,
      // branchId istemciden DEĞİL, ScheduleEvent'ten alınır (server-authoritative).
      branchId: event.branchId,
      scheduleEventId: input.scheduleEventId,
      teacherId: event.teacherId,
      studentGroupId: event.studentGroupId,
      courseId: event.courseId,
      roomId: event.roomId,
      sessionDate: input.sessionDate,
      rosterSnapshot: input.studentIds,
      status: AttendanceSessionStatus.PUBLISHED,
      version: 1,
    });
    const saved = await this.sessionRepo.save(session);
    this.logger.log(
      JSON.stringify({
        event: 'attendance.session.created',
        tenantId: input.tenantId,
        sessionId: saved.id,
        rosterSize: input.studentIds.length,
        actorId: ctx?.userId ?? input.actorId ?? 'system',
      }),
    );
    return saved;
  }

  async lock(
    actor: AttendanceActor,
    sessionId: string,
    expectedVersion: number,
  ): Promise<AttendanceSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, tenantId: actor.tenantId },
    });
    if (!session) {
      throw new NotFoundException('AttendanceSession not found');
    }
    // BOLA (fail-closed): öğretmen yalnız kendi dersini, gözetim rolleri tüm kiracıyı.
    assertAttendanceSessionAccess(actor, session);
    if (session.version !== expectedVersion) {
      throw new ConflictException(
        'Optimistic concurrency conflict: version mismatch',
      );
    }
    if (session.status === AttendanceSessionStatus.LOCKED) {
      return session; // idempotent
    }
    session.status = AttendanceSessionStatus.LOCKED;
    session.lockedById = actor.userId;
    session.lockedAt = new Date();
    session.version += 1;
    const saved = await this.sessionRepo.save(session);
    this.logger.log(
      JSON.stringify({
        event: 'attendance.session.locked',
        tenantId: actor.tenantId,
        sessionId,
        actorId: actor.userId,
        version: saved.version,
      }),
    );
    return saved;
  }

  async markRecord(
    actor: AttendanceActor,
    input: MarkSessionRecordInput,
  ): Promise<AttendanceRecord> {
    const session = await this.sessionRepo.findOne({
      where: { id: input.sessionId, tenantId: actor.tenantId },
    });
    if (!session) {
      throw new NotFoundException('AttendanceSession not found');
    }
    // BOLA (fail-closed): öğretmen yalnız kendi dersinin yoklamasını işaretler.
    assertAttendanceSessionAccess(actor, session);
    if (session.status === AttendanceSessionStatus.LOCKED) {
      throw new ConflictException(
        'Session is locked; corrections require controlled flow',
      );
    }
    // Immutable roster snapshot: oturum kapsamı dışındaki öğrenci işaretlenemez.
    if (!session.rosterSnapshot?.includes(input.studentId)) {
      throw new ForbiddenException(
        'Öğrenci bu yoklama oturumunun roster listesinde değil',
      );
    }
    const entity = this.recordRepo.create({
      tenantId: actor.tenantId,
      studentId: input.studentId,
      sessionId: input.sessionId,
      status: input.status,
      markedById: actor.userId,
      notes: input.notes ?? null,
    });
    await this.recordRepo.upsert(entity, {
      conflictPaths: ['tenantId', 'sessionId', 'studentId'],
    });
    return (await this.recordRepo.findOne({
      where: {
        tenantId: actor.tenantId,
        studentId: input.studentId,
        sessionId: input.sessionId,
      },
    }))!;
  }

  async listByTeacher(
    tenantId: string,
    teacherId: string,
  ): Promise<AttendanceSession[]> {
    return this.sessionRepo.find({
      where: { tenantId, teacherId },
      order: { sessionDate: 'DESC' },
    });
  }

  /**
   * Gözetim rolleri (operations_manager / tenant_admin) için kiracı geneli
   * liste. Önceki controller sürümü `listByTeacher(tenantId, '*')` çağırdığı
   * için müdür listesi her zaman boş dönüyordu.
   */
  async listByTenant(tenantId: string): Promise<AttendanceSession[]> {
    return this.sessionRepo.find({
      where: { tenantId },
      order: { sessionDate: 'DESC' },
    });
  }

  async getById(
    tenantId: string,
    sessionId: string,
  ): Promise<AttendanceSession | null> {
    return this.sessionRepo.findOne({ where: { id: sessionId, tenantId } });
  }
}
