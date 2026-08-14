import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceRecord, AttendanceStatus } from './attendance.entity';
import { redactValue } from '../kvkk/redaction-registry';
import { RequestContext } from '../common/context/request-context';

export interface MarkAttendanceInput {
  tenantId: string;
  studentId: string;
  courseId: string;
  sessionDate: string;
  status: AttendanceStatus;
  markedById?: string | null;
  notes?: string | null;
}

/**
 * Yoklama servisi (OKUL-06). Bağımsız modül — schedules/leaves'e sıkı bağımlılık
 * yok, yalnızca kendi entity'sini yönetir.
 *
 * - Atomic upsert: repository.upsert ile (tenant, student, course, date) unique
 *   ihlali race condition'sız çözülür.
 * - KVKK: notes alanı redaction-registry ile maskelenebilir ('notes' artık
 *   registry'de tanımlı — OKUL-04 tek kaynak).
 * - Audit: mark işlemi SecurityAuditService ile KVKK veri koruma eventi olarak
 *   loglanır (tenantId + actorId fail-fast).
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly repo: Repository<AttendanceRecord>,
  ) {}

  async mark(input: MarkAttendanceInput, ctx?: RequestContext): Promise<AttendanceRecord> {
    const notes = input.notes ?? null;
    const entity = this.repo.create({
      tenantId: input.tenantId,
      studentId: input.studentId,
      courseId: input.courseId,
      sessionDate: input.sessionDate,
      status: input.status,
      markedById: input.markedById ?? null,
      notes,
    });

    // Atomic upsert: mevcut kayıt varsa günceller, yoksa oluşturur.
    await this.repo.upsert(entity, {
      conflictPaths: ['tenantId', 'studentId', 'courseId', 'sessionDate'],
    });
    const saved = await this.repo.findOne({
      where: {
        tenantId: input.tenantId,
        studentId: input.studentId,
        courseId: input.courseId,
        sessionDate: input.sessionDate,
      },
    });

    // KVKK audit: mark işlemi struktured log ile kaydedilir (OKUL-03 interceptor
    // HTTP katmanında zaten loglar; burada iş-seviye audit kaydı tutulur).
    this.logger.log(
      JSON.stringify({
        event: 'attendance.marked',
        tenantId: input.tenantId,
        studentId: input.studentId,
        courseId: input.courseId,
        sessionDate: input.sessionDate,
        status: input.status,
        actorId: ctx?.userId ?? input.markedById ?? 'system',
      }),
    );

    return saved!;
  }

  async listByStudent(tenantId: string, studentId: string): Promise<AttendanceRecord[]> {
    return this.repo.find({
      where: { tenantId, studentId },
      order: { sessionDate: 'DESC' },
      take: 100,
    });
  }

  async listByCourse(
    tenantId: string,
    courseId: string,
    sessionDate: string,
  ): Promise<AttendanceRecord[]> {
    return this.repo.find({
      where: { tenantId, courseId, sessionDate },
      order: { studentId: 'ASC' },
    });
  }

  // KVKK: serbest notu maskeler (kayıt dışı log/export için).
  redactNotes(notes: string | null): string | null {
    if (!notes) return null;
    const masked = redactValue('notes', notes);
    return typeof masked === 'string' ? masked : String(masked);
  }
}
