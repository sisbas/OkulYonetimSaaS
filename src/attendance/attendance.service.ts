import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceRecord, AttendanceStatus } from './attendance.entity';
import { redactValue } from '../kvkk/redaction-registry';

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
 * - Idempotent: (tenant, student, course, date) unique; tekrar işaretleme son
 *   kaydı günceller (upsert).
 * - KVKK: notes alanı redaction-registry ile maskelenebilir (serbest metin).
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly repo: Repository<AttendanceRecord>,
  ) {}

  async mark(input: MarkAttendanceInput): Promise<AttendanceRecord> {
    const existing = await this.repo.findOne({
      where: {
        tenantId: input.tenantId,
        studentId: input.studentId,
        courseId: input.courseId,
        sessionDate: input.sessionDate,
      },
    });

    const notes = input.notes ?? null;
    if (existing) {
      existing.status = input.status;
      existing.markedById = input.markedById ?? null;
      existing.notes = notes;
      return this.repo.save(existing);
    }
    return this.repo.save(
      this.repo.create({
        tenantId: input.tenantId,
        studentId: input.studentId,
        courseId: input.courseId,
        sessionDate: input.sessionDate,
        status: input.status,
        markedById: input.markedById ?? null,
        notes,
      }),
    );
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
    return redactValue('notes', notes) as string;
  }
}
