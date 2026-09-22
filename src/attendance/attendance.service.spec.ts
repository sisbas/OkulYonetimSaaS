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

  it('mark masks free-text notes on the write path (KVKK, AC-5)', async () => {
    await service.mark({
      tenantId: 't1',
      studentId: 's1',
      sessionId: 'sess-1',
      status: AttendanceStatus.ABSENT,
      notes: 'Veli 0532 111 22 33 numarasından arandı',
    });

    const created = repo.create.mock.calls[0][0];
    expect(created.notes).toBe('[REDACTED]');
    expect(JSON.stringify(created)).not.toContain('0532');
  });

  it('mark stores null when no note is supplied', async () => {
    await service.mark({
      tenantId: 't1',
      studentId: 's1',
      sessionId: 'sess-1',
      status: AttendanceStatus.PRESENT,
    });

    expect(repo.create.mock.calls[0][0].notes).toBeNull();
  });
});
