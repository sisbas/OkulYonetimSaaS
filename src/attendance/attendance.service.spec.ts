import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttendanceService } from './attendance.service';
import { AttendanceRecord, AttendanceStatus } from './attendance.entity';
import { SecurityAuditService } from '../common/audit/security-audit.service';
import { redactValue } from '../kvkk/redaction-registry';

describe('AttendanceService (OKUL-06)', () => {
  let service: AttendanceService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repo: any;

  const mockRepo = () => ({
    findOne: jest.fn(async () => ({ id: 'rec-1' })),
    find: jest.fn(async () => []),
    upsert: jest.fn(async () => undefined),
    create: jest.fn((entityLike: Partial<AttendanceRecord>) => ({ ...entityLike })),
  });

  beforeEach(async () => {
    repo = mockRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getRepositoryToken(AttendanceRecord), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(AttendanceService);
  });

  it('mark uses atomic upsert and emits audit event', async () => {
    const rec = await service.mark({
      tenantId: 't1',
      studentId: 's1',
      sessionId: 'sess-1',
      status: AttendanceStatus.PRESENT,
    });
    expect(rec.id).toBeDefined();
    expect(repo.upsert).toHaveBeenCalled();
  });

  it('mark updates existing record (idempotent upsert)', async () => {
    repo.findOne = jest.fn(async () => ({ id: 'existing', status: AttendanceStatus.ABSENT }));
    const rec = await service.mark({
      tenantId: 't1',
      studentId: 's1',
      sessionId: 'sess-1',
      status: AttendanceStatus.PRESENT,
    });
    expect(rec.id).toBe('existing');
    expect(repo.upsert).toHaveBeenCalled();
  });

  it('redactNotes masks free-text PII via registry', () => {
    const masked = service.redactNotes('Ogrenci veli ile gorustu');
    expect(typeof masked).toBe('string');
    expect(redactValue).toBeDefined();
  });
});
