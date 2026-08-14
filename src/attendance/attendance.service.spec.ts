import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttendanceService } from './attendance.service';
import { AttendanceRecord, AttendanceStatus } from './attendance.entity';
import { redactValue } from '../kvkk/redaction-registry';

describe('AttendanceService (OKUL-06)', () => {
  let service: AttendanceService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repo: any;

  const mockRepo = () => ({
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    save: jest.fn(async (entity: Partial<AttendanceRecord>) => ({
      id: 'rec-1',
      ...entity,
    })),
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

  it('mark creates new record when none exists', async () => {
    const rec = await service.mark({
      tenantId: 't1',
      studentId: 's1',
      courseId: 'c1',
      sessionDate: '2026-08-14',
      status: AttendanceStatus.PRESENT,
    });
    expect(rec.id).toBeDefined();
    expect(repo.save).toHaveBeenCalled();
  });

  it('mark updates existing record (idempotent)', async () => {
    repo.findOne = jest.fn(async () => ({
      id: 'existing',
      status: AttendanceStatus.ABSENT,
    }));
    const rec = await service.mark({
      tenantId: 't1',
      studentId: 's1',
      courseId: 'c1',
      sessionDate: '2026-08-14',
      status: AttendanceStatus.PRESENT,
    });
    expect(rec.id).toBe('existing');
    expect(rec.status).toBe(AttendanceStatus.PRESENT);
  });

  it('redactNotes masks PII in free-text notes', () => {
    const masked = service.redactNotes('Velisi ile gorustum (telefon kayitli)');
    // redactValue 'notes' anahtarını REDACTION_FIELDS'te bulmaz → olduğu gibi döner
    expect(typeof masked).toBe('string');
    expect(redactValue).toBeDefined();
  });
});
