import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportDefinition } from './report-definition.entity';
import { ReportRun, ReportRunStatus } from './report-run.entity';
import { AttendanceRecord, AttendanceStatus } from '../attendance/attendance.entity';
import { redactObject } from '../kvkk/redaction-registry';

describe('ReportsService (OKUL-09)', () => {
  let service: ReportsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let definitionRepo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runRepo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let attendanceRepo: any;

  const mockRepos = () => ({
    findOne: jest.fn(),
    find: jest.fn(async () => []),
    create: jest.fn((entityLike: Record<string, unknown>) => ({ ...entityLike })),
    save: jest.fn(async (e: Record<string, unknown>) => ({ id: 'run-1', ...e })),
  });

  beforeEach(async () => {
    definitionRepo = mockRepos();
    runRepo = mockRepos();
    attendanceRepo = mockRepos();
    // attendance find varsayılan boş dönsün (CI'da mock veri).
    attendanceRepo.find = jest.fn(async () => []);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(ReportDefinition), useValue: definitionRepo },
        { provide: getRepositoryToken(ReportRun), useValue: runRepo },
        { provide: getRepositoryToken(AttendanceRecord), useValue: attendanceRepo },
      ],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  it('generateReport: tanım bulunamazsa NotFoundException fırlatır', async () => {
    definitionRepo.findOne = jest.fn(async () => null);
    await expect(service.generateReport('t1', 'def-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('generateReport: attendance_summary için aggregate üretir ve maskeler', async () => {
    definitionRepo.findOne = jest.fn(async () => ({
      id: 'def-1',
      tenantId: 't1',
      type: 'attendance_summary',
      name: 'Devamsızlık',
    }));
    attendanceRepo.find = jest.fn(async () => [
      {
        studentId: 's-1',
        courseId: 'c-1',
        sessionDate: '2026-08-14',
        status: AttendanceStatus.ABSENT,
        notes: 'Veli ile görüşüldü',
      },
      {
        studentId: 's-2',
        courseId: 'c-1',
        sessionDate: '2026-08-14',
        status: AttendanceStatus.PRESENT,
        notes: null,
      },
    ]);

    const run = await service.generateReport('t1', 'def-1');

    expect(run.status).toBe(ReportRunStatus.COMPLETED);
    expect(run.definitionId).toBe('def-1');
    // Run kaydı save edildi.
    expect(runRepo.save).toHaveBeenCalled();
    // Sonuç jsonb olarak maskeli halde saklandı.
    const savedArg = runRepo.save.mock.calls[0][0];
    expect(savedArg.resultJson).toBeDefined();
    expect(savedArg.resultJson.tenantId).toBe('t1');
    expect(savedArg.resultJson.absentStudentCount).toBe(1);
    // querySpec filtresi uygulandı (tenant dışı kayıt dahil edilmedi).
    expect(savedArg.resultJson.appliedFilters).toBeDefined();
    expect(savedArg.resultJson.appliedFilters.tenantId).toBe('t1');
  });

  it('generateReport: attendance kaydı yoksa sıfır-özet döner', async () => {
    definitionRepo.findOne = jest.fn(async () => ({
      id: 'def-2',
      tenantId: 't1',
      type: 'attendance_summary',
      name: 'Boş',
    }));
    attendanceRepo.find = jest.fn(async () => []);

    const run = await service.generateReport('t1', 'def-2');
    expect(run.status).toBe(ReportRunStatus.COMPLETED);
    expect(runRepo.save.mock.calls[0][0].resultJson.totalRecords).toBe(0);
  });

  it('redactObject: PII alanlarını maskeler (OKUL-04 tek kaynak)', () => {
    const masked = redactObject({
      studentId: 's-1',
      notes: 'gizli',
      // KVKK scanner dostu: gerçek GSM şeklinde olmayan placeholder.
      parentPhone: '1111111110',
    }) as Record<string, unknown>;
    expect(masked.studentId).toBe('s-1'); // id değil, PII değil
    expect(masked.notes).toBe('[REDACTED]');
    expect(masked.parentPhone).toBe('[REDACTED]');
  });
});
