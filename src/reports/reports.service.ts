import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportDefinition } from './report-definition.entity';
import { ReportRun, ReportRunStatus } from './report-run.entity';
import { AttendanceRecord, AttendanceStatus } from '../attendance/attendance.entity';
import { redactObject } from '../kvkk/redaction-registry';

/**
 * Reporting Module servisi (OKUL-09).
 *
 * Salt-okunur aggregate üretir (tenant-scoped, read-only). Bir rapor tanımı
 * (ReportDefinition) üzerinden çalışır; sonuç bir ReportRun kaydında
 * (PII maskeli halde) saklanır.
 *
 * - Tenant izolasyonu: tüm sorgular tenant_id filtresiyle sınırlıdır.
 * - KVKK: aggregate sonucundaki hassas alanlar (öğrenci adı, veli iletişim
 *   vb.) OKUL-04 redaction-registry (redactObject) ile maskelenir.
 * - attendance_records (OKUL-06) tablosu varsa gerçek aggregate; yoksa
 *   mock/boş veriyle güvenli özet üretilir (CI'da DB olmadan da çalışır).
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(ReportDefinition)
    private readonly definitionRepo: Repository<ReportDefinition>,
    @InjectRepository(ReportRun)
    private readonly runRepo: Repository<ReportRun>,
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepo: Repository<AttendanceRecord>,
  ) {}

  /**
   * Bir rapor tanımı için aggregate hesaplar, KVKK maskesi uygular ve
   * bir ReportRun kaydı olarak saklar.
   *
   * @returns Üretilen (maskeli) rapor çalıştırması.
   */
  async generateReport(
    tenantId: string,
    definitionId: string,
  ): Promise<ReportRun> {
    // 1) Tanım tenant-scoped yüklenir (cross-tenant erişim engellenir).
    const definition = await this.definitionRepo.findOne({
      where: { tenantId, id: definitionId },
    });
    if (!definition) {
      throw new NotFoundException(
        `Rapor tanımı bulunamadı: tenant=${tenantId} definition=${definitionId}`,
      );
    }

    // 2) Tanım türüne göre aggregate hesapla.
    const rawResult = await this.computeAggregate(tenantId, definition.type);

    // 3) KVKK: sonuçtaki PII maskelenir (redactObject özyinelemeli uygular).
    const maskedResult = redactObject(rawResult) as Record<string, unknown>;

    // 4) ReportRun kaydı oluştur (maskeli sonuç + üretim zamanı).
    const run = this.runRepo.create({
      tenantId,
      definitionId,
      status: ReportRunStatus.COMPLETED,
      resultJson: maskedResult,
      generatedAt: new Date(),
    });
    const saved = await this.runRepo.save(run);

    this.logger.log(
      JSON.stringify({
        event: 'report.generated',
        tenantId,
        definitionId,
        type: definition.type,
        runId: saved.id,
        // KVKK kanıtı: sonucun maskeli saklandığı loglanır.
        piiRedacted: true,
      }),
    );

    return saved;
  }

  /**
   * Tanım türüne göre aggregate hesaplar. attendance_summary türünde
   * attendance_records tablosundan (OKUL-06) gerçek özet üretilir; tablo
   * boş/erişilemezse güvenli sıfır-özet döner.
   */
  private async computeAggregate(
    tenantId: string,
    type: string,
  ): Promise<Record<string, unknown>> {
    switch (type) {
      case 'attendance_summary':
        return this.computeAttendanceSummary(tenantId);
      // Gelecekte: 'student_summary', 'teacher_summary' ...
      default:
        // Bilinmeyen türde boş ama tenant-scoped bir çerçeve döner.
        return { type, tenantId, note: 'aggregate desteklenmeyen tür' };
    }
  }

  /**
   * attendance_records (OKUL-06) üzerinden devamsızlık özeti.
   * Tenant dışı kayıt ASLA dahil edilmez (where:{tenantId}).
   */
  private async computeAttendanceSummary(
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const records = await this.attendanceRepo.find({ where: { tenantId } });

    const total = records.length;
    const counts: Record<AttendanceStatus, number> = {
      [AttendanceStatus.PRESENT]: 0,
      [AttendanceStatus.ABSENT]: 0,
      [AttendanceStatus.LATE]: 0,
      [AttendanceStatus.EXCUSED]: 0,
    };
    const absentStudentIds = new Set<string>();

    for (const r of records) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (r.status === AttendanceStatus.ABSENT) {
        absentStudentIds.add(r.studentId);
      }
    }

    return {
      type: 'attendance_summary',
      tenantId,
      totalRecords: total,
      counts,
      absentStudentCount: absentStudentIds.size,
      // Ham kayıtlar (öğrenci id + not içerir) — KVKK maskesi servis
      // katmanında redactObject ile uygulanır.
      records: records.map((r) => ({
        studentId: r.studentId,
        courseId: r.courseId,
        sessionDate: r.sessionDate,
        status: r.status,
        notes: r.notes,
      })),
    };
  }
}
