import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AttendanceSession,
  AttendanceSessionStatus,
} from './attendance-session.entity';
import { AttendanceRecord, AttendanceStatus } from './attendance.entity';
import { ScheduleEvent } from '../schedules/schedule-event.entity';
import { RequestContext } from '../common/context/request-context';

export interface CreateSessionInput {
  tenantId: string;
  branchId: string;
  scheduleEventId: string;
  sessionDate: Date;
  studentIds: string[];
  actorId?: string | null;
}

export interface MarkSessionRecordInput {
  tenantId: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  markedById?: string | null;
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
  ) {}

  async createFromPublishedOccurrence(
    input: CreateSessionInput,
    ctx?: RequestContext,
  ): Promise<AttendanceSession> {
    const event = await this.eventRepo.findOne({
      where: { id: input.scheduleEventId, tenantId: input.tenantId },
    });
    if (!event) {
      throw new Error('ScheduleEvent not found or not in tenant');
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

    const session = this.sessionRepo.create({
      tenantId: input.tenantId,
      branchId: input.branchId,
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
    tenantId: string,
    sessionId: string,
    actorId: string,
    expectedVersion: number,
  ): Promise<AttendanceSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new Error('AttendanceSession not found');
    }
    if (session.version !== expectedVersion) {
      throw new Error('Optimistic concurrency conflict: version mismatch');
    }
    if (session.status === AttendanceSessionStatus.LOCKED) {
      return session; // idempotent
    }
    session.status = AttendanceSessionStatus.LOCKED;
    session.lockedById = actorId;
    session.lockedAt = new Date();
    session.version += 1;
    const saved = await this.sessionRepo.save(session);
    this.logger.log(
      JSON.stringify({
        event: 'attendance.session.locked',
        tenantId,
        sessionId,
        actorId,
        version: saved.version,
      }),
    );
    return saved;
  }

  async markRecord(input: MarkSessionRecordInput): Promise<AttendanceRecord> {
    const session = await this.sessionRepo.findOne({
      where: { id: input.sessionId, tenantId: input.tenantId },
    });
    if (!session) {
      throw new Error('AttendanceSession not found');
    }
    if (session.status === AttendanceSessionStatus.LOCKED) {
      throw new Error('Session is locked; corrections require controlled flow');
    }
    const entity = this.recordRepo.create({
      tenantId: input.tenantId,
      studentId: input.studentId,
      sessionId: input.sessionId,
      status: input.status,
      markedById: input.markedById ?? null,
      notes: input.notes ?? null,
    });
    await this.recordRepo.upsert(entity, {
      conflictPaths: ['tenantId', 'sessionId', 'studentId'],
    });
    return (await this.recordRepo.findOne({
      where: {
        tenantId: input.tenantId,
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

  async getById(
    tenantId: string,
    sessionId: string,
  ): Promise<AttendanceSession | null> {
    return this.sessionRepo.findOne({ where: { id: sessionId, tenantId } });
  }
}
