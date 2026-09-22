import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
import { redactAttendanceNotes } from './attendance-notes';
import {
  assertAttendanceSessionAccess,
  AttendanceActor,
  hasAttendanceOversight,
} from './attendance-access';
import {
  AttendanceCorrectionReasonCode,
  isAttendanceCorrectionReasonCode,
} from './attendance-correction';
import {
  ATTENDANCE_AUDIT_PORT,
  AttendanceAuditPort,
} from './attendance-audit.adapter';


export interface CreateSessionInput {
  tenantId: string;
  scheduleEventId: string;
  sessionDate: Date;
  studentIds: string[];
  actorId?: string | null;
  /** Correlation ID; controller `AttendanceActor.requestId` geçirir (#259). */
  requestId?: string | null;
}

export interface MarkSessionRecordInput {
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  notes?: string | null;
}

export interface CorrectSessionRecordInput {
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  /** Kapalı sözlükten gerekçe kodu — serbest metin audit'e girmez (AC-4). */
  reasonCode: AttendanceCorrectionReasonCode;
  /** Optimistic concurrency token'ı: çağıranın gördüğü `session.version`. */
  expectedVersion: number;
  notes?: string | null;
}

export interface AttendanceCorrectionResult {
  record: AttendanceRecord;
  /** Düzeltme sonrası oturum version'ı (sonraki düzeltme için token). */
  sessionVersion: number;
}

/**
 * AttendanceSession lifecycle (OKUL-06, M5).
 *
 * - createFromPublishedOccurrence: yalnızca PUBLISHED ScheduleEvent'den türetir;
 *   rosterSnapshot immutable. Idempotent: aynı (tenant, event, date) varsa günceller.
 * - lock: draft/published -> locked (optimistic concurrency via version).
 * - markRecord: session altında AttendanceRecord upsert (teacher-own-lesson
 *   kontrolü servis + guard katmanında); notes KVKK yazma-yolu maskesinden
 *   geçer (redactAttendanceNotes — ham serbest metin saklanmaz).
 * - correctRecord: YALNIZ kilitli oturumda, YALNIZ gözetim rolü ile; kapalı
 *   sözlükten gerekçe kodu + oturum version'ı ile optimistic concurrency
 *   (AC-4 controlled correction).
 */
@Injectable()
export class AttendanceSessionService {
  private readonly logger = new Logger(AttendanceSessionService.name);

  constructor(
    @InjectRepository(AttendanceSession)
    private readonly sessionRepo: Repository<AttendanceSession>,
    @InjectRepository(AttendanceRecord)
    private readonly recordRepo: Repository<AttendanceRecord>,
    // Durable audit portu (#259): yazımlar domain transaction'ının içindedir.
    @Inject(ATTENDANCE_AUDIT_PORT)
    private readonly audit: AttendanceAuditPort,
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

    // AC-2 (#265) atomikliği: yayın kontrolü ile oturum insert'i aynı
    // transaction'da yapılır ve ScheduleVersion satırı pessimistic_write ile
    // kilitlenir. ScheduleService.unpublish aynı kilidi aldığı için iki
    // istek serialize olur; unpublish commit'lediyse kilitli okuma
    // UNPUBLISHED görür ve oturum asla oluşturulmaz.
    const saved = await this.sessionRepo.manager.transaction(
      async (em: EntityManager) => {
        const event = await em.findOne(ScheduleEvent, {
          where: { id: input.scheduleEventId, tenantId: input.tenantId },
        });
        if (!event) {
          throw new NotFoundException(
            'ScheduleEvent not found or not in tenant',
          );
        }

        const existing = await em.findOne(AttendanceSession, {
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

        // AC-2 (#265): oturum YALNIZCA yayınlanmış bir schedule sürümünden
        // türer. Yayın durumu ScheduleEvent üzerinde değil ScheduleVersion
        // üzerindedir (status + published_at + unpublished_at).
        const version = await em.findOne(ScheduleVersion, {
          where: { id: event.versionId, tenantId: input.tenantId },
          lock: { mode: 'pessimistic_write' },
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

        const session = em.create(AttendanceSession, {
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
        const inserted = await em.save(session);
        // Durable audit (#259, #265 AC-5): aynı transaction'da yazılır; domain
        // mutasyonu rollback olursa audit kaydı da yazılmaz.
        await this.audit.write(em, 'attendance.session.opened', {
          schemaVersion: 1,
          tenantId: input.tenantId,
          actorUserId: ctx?.userId ?? input.actorId ?? null,
          actorSessionId: null,
          // Correlation: HTTP yolunda aktörün requestId'si taşınır.
          requestId: ctx?.requestId ?? input.requestId ?? 'unknown',
          entityType: 'attendance',
          entityId: inserted.id,
          result: 'success',
          changedFields: ['openedAt'],
          // Denetlenebilir kanıt: oluşturulan durum ve roster büyüklüğü (PII yok).
          newStatus: AttendanceSessionStatus.PUBLISHED,
          rosterSize: input.studentIds.length,
        });
        this.logger.log(
          JSON.stringify({
            event: 'attendance.session.created',
            tenantId: input.tenantId,
            sessionId: inserted.id,
            rosterSize: input.studentIds.length,
            actorId: ctx?.userId ?? input.actorId ?? 'system',
          }),
        );
        return inserted;
      },
    );
    return saved;
  }

  async lock(
    actor: AttendanceActor,
    sessionId: string,
    expectedVersion: number,
  ): Promise<AttendanceSession> {
    // Kilit + audit aynı transaction'da: durable audit (#259) domain
    // mutasyonuyla birlikte commit/rollback olur.
    return this.sessionRepo.manager.transaction(async (em: EntityManager) => {
      const session = await em.findOne(AttendanceSession, {
        where: { id: sessionId, tenantId: actor.tenantId },
        lock: { mode: 'pessimistic_write' },
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
      const previousStatus = session.status;
      session.status = AttendanceSessionStatus.LOCKED;
      session.lockedById = actor.userId;
      session.lockedAt = new Date();
      session.version += 1;
      const saved = await em.save(session);

      await this.audit.write(em, 'attendance.session.closed', {
        schemaVersion: 1,
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorSessionId: null,
        requestId: actor.requestId,
        entityType: 'attendance',
        entityId: saved.id,
        result: 'success',
        changedFields: ['status', 'closedAt'],
        // Denetlenebilir kanıt: hangi durumdan kilitli duruma geçildi.
        previousStatus,
        newStatus: AttendanceSessionStatus.LOCKED,
      });

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
    });
  }

  async markRecord(
    actor: AttendanceActor,
    input: MarkSessionRecordInput,
  ): Promise<AttendanceRecord> {
    // Kayıt + durable audit aynı transaction'da (#259): audit yazımı
    // başarısız olursa işaretleme de commit edilmez.
    return this.sessionRepo.manager.transaction(async (em: EntityManager) => {
      const session = await em.findOne(AttendanceSession, {
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
      const entity = em.create(AttendanceRecord, {
        tenantId: actor.tenantId,
        studentId: input.studentId,
        sessionId: input.sessionId,
        status: input.status,
        markedById: actor.userId,
        // KVKK (AC-5, #265): yazma yolunda maskeleme — ham not saklanmaz.
        notes: redactAttendanceNotes(input.notes),
      });
      await em.upsert(AttendanceRecord, entity, {
        conflictPaths: ['tenantId', 'sessionId', 'studentId'],
      });
      const saved = await em.findOne(AttendanceRecord, {
        where: {
          tenantId: actor.tenantId,
          studentId: input.studentId,
          sessionId: input.sessionId,
        },
      });

      await this.audit.write(em, 'attendance.record.marked', {
        schemaVersion: 1,
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorSessionId: null,
        requestId: actor.requestId,
        entityType: 'attendance',
        entityId: session.id,
        result: 'success',
        changedFields: ['status', 'markedForStudentId'],
        // Denetlenebilir kanıt: işaretlenen durum (öğrenci kimliği PII değil, UUID).
        newStatus: input.status,
      });

      return saved!;
    });
  }

  /**
   * Kontrollü düzeltme (AC-4, #265).
   *
   * Kural (fail-closed):
   * - Düzeltme YALNIZCA kilitli bir oturumda yapılır; kilit açıkken `markRecord`
   *   yolu kullanılır (submit → lock → controlled correction).
   * - Yetki: oturum sahibi öğretmen DEĞİL, yalnız gözetim rolleri düzeltir
   *   (görevler ayrılığı). Öğretmen denemesi 403 ile reddedilir.
   * - Gerekçe kapalı sözlükten bir koddur (`ATTENDANCE_CORRECTION_REASON_CODES`);
   *   serbest metin gerekiyorsa `notes` alanı kullanılır ve KVKK maskesinden geçer.
   * - Optimistic concurrency: `expectedVersion` oturum version'ıyla karşılaştırılır;
   *   her başarılı düzeltme version'ı 1 artırır (düzeltme dizisi denetlenebilir).
   * - Oturum satırı `pessimistic_write` ile kilitlenir → eşzamanlı düzeltmeler
   *   serialize olur, version kontrolü güvenilir kalır.
   */
  async correctRecord(
    actor: AttendanceActor,
    input: CorrectSessionRecordInput,
  ): Promise<AttendanceCorrectionResult> {
    if (!isAttendanceCorrectionReasonCode(input.reasonCode)) {
      throw new BadRequestException(
        `Geçersiz düzeltme gerekçe kodu: ${String(input.reasonCode)}`,
      );
    }

    return this.sessionRepo.manager.transaction(async (em: EntityManager) => {
      const session = await em.findOne(AttendanceSession, {
        where: { id: input.sessionId, tenantId: actor.tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) {
        throw new NotFoundException('AttendanceSession not found');
      }
      // BOLA (fail-closed): öğretmen yalnız kendi dersinin oturumuna dokunabilir.
      assertAttendanceSessionAccess(actor, session);

      // Görevler ayrılığı: kontrollü düzeltme gözetim sorumluluğudur.
      if (!hasAttendanceOversight(actor)) {
        throw new ForbiddenException(
          'Kontrollü düzeltme yalnız gözetim rolleri tarafından yapılabilir',
        );
      }
      if (session.status !== AttendanceSessionStatus.LOCKED) {
        throw new ConflictException(
          'Session is not locked; corrections require a locked session',
        );
      }
      if (session.version !== input.expectedVersion) {
        throw new ConflictException(
          'Optimistic concurrency conflict: version mismatch',
        );
      }
      // Immutable roster snapshot: kapsam dışındaki öğrenci düzeltilemez.
      if (!session.rosterSnapshot?.includes(input.studentId)) {
        throw new ForbiddenException(
          'Öğrenci bu yoklama oturumunun roster listesinde değil',
        );
      }

      const record = await em.findOne(AttendanceRecord, {
        where: {
          tenantId: actor.tenantId,
          sessionId: input.sessionId,
          studentId: input.studentId,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!record) {
        throw new NotFoundException(
          'AttendanceRecord not found for this session/student',
        );
      }

      const previousStatus = record.status;
      record.status = input.status;
      // KVKK: düzeltme notu da yazma yolunda maskelenir (ham metin saklanmaz).
      record.notes = redactAttendanceNotes(input.notes);
      record.correctionReasonCode = input.reasonCode;
      record.correctedById = actor.userId;
      record.correctedAt = new Date();
      record.correctionCount = (record.correctionCount ?? 0) + 1;
      const savedRecord = await em.save(record);

      session.version += 1;
      const savedSession = await em.save(session);

      // Durable audit (#259, #265 AC-4/AC-5): düzeltme ile aynı transaction'da.
      // Audit yazımı başarısız olursa düzeltme de commit edilmez.
      await this.audit.write(em, 'attendance.record.corrected', {
        schemaVersion: 1,
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorSessionId: null,
        requestId: actor.requestId,
        entityType: 'attendance',
        entityId: session.id,
        result: 'success',
        changedFields: ['status', 'reasonCode', 'correctionCount'],
        // Denetlenebilir kanıt (alan adı DEĞİL, değer): hangi gerekçe koduyla,
        // hangi durumdan hangi duruma ve kaçıncı düzeltmede.
        reasonCode: input.reasonCode,
        correctionCount: savedRecord.correctionCount,
        previousStatus,
        newStatus: input.status,
      });

      // Kanıt logu (PII taşımaz).
      this.logger.log(
        JSON.stringify({
          event: 'attendance.record.corrected',
          tenantId: actor.tenantId,
          sessionId: input.sessionId,
          studentId: input.studentId,
          status: input.status,
          reasonCode: input.reasonCode,
          correctionCount: savedRecord.correctionCount,
          actorId: actor.userId,
          sessionVersion: savedSession.version,
        }),
      );

      return { record: savedRecord, sessionVersion: savedSession.version };
    }
    const entity = this.recordRepo.create({
      tenantId: actor.tenantId,
      studentId: input.studentId,
      sessionId: input.sessionId,
      status: input.status,
      markedById: actor.userId,
      // KVKK (AC-5, #265): yazma yolunda maskeleme — ham not saklanmaz.
      notes: redactAttendanceNotes(input.notes),
    });
    await this.recordRepo.upsert(entity, {
      conflictPaths: ['tenantId', 'sessionId', 'studentId'],
    });
  }

  /**
   * Kontrollü düzeltme (AC-4, #265).
   *
   * Kural (fail-closed):
   * - Düzeltme YALNIZCA kilitli bir oturumda yapılır; kilit açıkken `markRecord`
   *   yolu kullanılır (submit → lock → controlled correction).
   * - Yetki: oturum sahibi öğretmen DEĞİL, yalnız gözetim rolleri düzeltir
   *   (görevler ayrılığı). Öğretmen denemesi 403 ile reddedilir.
   * - Gerekçe kapalı sözlükten bir koddur (`ATTENDANCE_CORRECTION_REASON_CODES`);
   *   serbest metin gerekiyorsa `notes` alanı kullanılır ve KVKK maskesinden geçer.
   * - Optimistic concurrency: `expectedVersion` oturum version'ıyla karşılaştırılır;
   *   her başarılı düzeltme version'ı 1 artırır (düzeltme dizisi denetlenebilir).
   * - Oturum satırı `pessimistic_write` ile kilitlenir → eşzamanlı düzeltmeler
   *   serialize olur, version kontrolü güvenilir kalır.
   */
  async correctRecord(
    actor: AttendanceActor,
    input: CorrectSessionRecordInput,
  ): Promise<AttendanceCorrectionResult> {
    if (!isAttendanceCorrectionReasonCode(input.reasonCode)) {
      throw new BadRequestException(
        `Geçersiz düzeltme gerekçe kodu: ${String(input.reasonCode)}`,
      );
    }

    return this.sessionRepo.manager.transaction(async (em: EntityManager) => {
      const session = await em.findOne(AttendanceSession, {
        where: { id: input.sessionId, tenantId: actor.tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) {
        throw new NotFoundException('AttendanceSession not found');
      }
      // BOLA (fail-closed): öğretmen yalnız kendi dersinin oturumuna dokunabilir.
      assertAttendanceSessionAccess(actor, session);

      // Görevler ayrılığı: kontrollü düzeltme gözetim sorumluluğudur.
      if (!hasAttendanceOversight(actor)) {
        throw new ForbiddenException(
          'Kontrollü düzeltme yalnız gözetim rolleri tarafından yapılabilir',
        );
      }
      if (session.status !== AttendanceSessionStatus.LOCKED) {
        throw new ConflictException(
          'Session is not locked; corrections require a locked session',
        );
      }
      if (session.version !== input.expectedVersion) {
        throw new ConflictException(
          'Optimistic concurrency conflict: version mismatch',
        );
      }
      // Immutable roster snapshot: kapsam dışındaki öğrenci düzeltilemez.
      if (!session.rosterSnapshot?.includes(input.studentId)) {
        throw new ForbiddenException(
          'Öğrenci bu yoklama oturumunun roster listesinde değil',
        );
      }

      const record = await em.findOne(AttendanceRecord, {
        where: {
          tenantId: actor.tenantId,
          sessionId: input.sessionId,
          studentId: input.studentId,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!record) {
        throw new NotFoundException(
          'AttendanceRecord not found for this session/student',
        );
      }

      record.status = input.status;
      // KVKK: düzeltme notu da yazma yolunda maskelenir (ham metin saklanmaz).
      record.notes = redactAttendanceNotes(input.notes);
      record.correctionReasonCode = input.reasonCode;
      record.correctedById = actor.userId;
      record.correctedAt = new Date();
      record.correctionCount = (record.correctionCount ?? 0) + 1;
      const savedRecord = await em.save(record);

      session.version += 1;
      const savedSession = await em.save(session);

      // Audit (durable audit #259 kapsamındadır; PII taşımaz).
      this.logger.log(
        JSON.stringify({
          event: 'attendance.record.corrected',
          tenantId: actor.tenantId,
          sessionId: input.sessionId,
          studentId: input.studentId,
          status: input.status,
          reasonCode: input.reasonCode,
          correctionCount: savedRecord.correctionCount,
          actorId: actor.userId,
          sessionVersion: savedSession.version,
        }),
      );

      return { record: savedRecord, sessionVersion: savedSession.version };
    });
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
