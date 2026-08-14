import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ParentNotificationService, SendToParentInput } from './parent-notification.service';
import { NotificationLog } from './notification-log.entity';
import { NotificationEligibilityService } from '../kvkk/notification-eligibility.service';
import { ProviderJob, ProviderJobQueue } from '../kvkk/types';
import { redactNotificationPayload } from '../kvkk/notification-payload-redaction';

// Mock provider kuyruğu — enqueue çağrısını yakalar.
class MockQueue implements ProviderJobQueue {
  public enqueued: ProviderJob[] = [];
  async enqueue(job: ProviderJob): Promise<void> {
    this.enqueued.push(job);
  }
}

describe('ParentNotificationService (OKUL-08)', () => {
  let service: ParentNotificationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repo: any;
  let queue: MockQueue;

  const mockRepo = () => ({
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    upsert: jest.fn(async () => undefined),
    create: jest.fn((entityLike: Partial<NotificationLog>) => ({ ...entityLike })),
  });

  beforeEach(async () => {
    repo = mockRepo();
    queue = new MockQueue();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ParentNotificationService,
        { provide: getRepositoryToken(NotificationLog), useValue: repo },
        { provide: NotificationEligibilityService, useClass: NotificationEligibilityService },
      ],
    }).compile();
    service = moduleRef.get(ParentNotificationService);
  });

  it('onaylı bildirim gönderilir, kuyruğa eklenir ve log yazılır', async () => {
    const input: SendToParentInput = {
      tenantId: 't-11111111-1111-1111-1111-111111111111',
      notificationId: 'n-001',
      subjectId: 's-11111111-1111-1111-1111-111111111111',
      channel: 'sms',
      status: 'approved',
      messageBody: 'Sayın veli, ogrenci devamsizligi bulunmaktadir. Iletisim: 0XXX0000000',
      eligibility: {
        consent: { status: 'approved' },
        phone: { exists: true, verified: true },
        channel: { allowed: true, channel: 'sms' },
        messageBody: 'Sayın veli, ogrenci devamsizligi bulunmaktadir. Iletisim: 0XXX0000000',
      },
      queue,
    };

    const status = await service.sendToParent(input);

    expect(status).toBe('sent');
    expect(queue.enqueued).toHaveLength(1);
    expect(repo.upsert).toHaveBeenCalled();
    // KVKK: log maskeli gövde taşır (ham telefon yazılmaz).
    const saved = repo.upsert.mock.calls[0][0];
    expect(saved.messageBodyMasked).toContain('[REDACTED]');
    expect(saved.messageBodyMasked).not.toContain('0XXX0000000');
  });

  it('onaysız consent durumunda gönderim ENGELLENİR, kuyruğa eklenmez', async () => {
    const input: SendToParentInput = {
      tenantId: 't-11111111-1111-1111-1111-111111111111',
      notificationId: 'n-002',
      subjectId: 's-11111111-1111-1111-111111111111',
      channel: 'email',
      status: 'approved',
      messageBody: 'Veli bilgilendirme metni',
      eligibility: {
        consent: { status: 'pending' },
        phone: { exists: true, verified: true },
        channel: { allowed: true, channel: 'email' },
        messageBody: 'Veli bilgilendirme metni',
      },
      queue,
    };

    const status = await service.sendToParent(input);
    expect(status).toBe('blocked_consent');
    expect(queue.enqueued).toHaveLength(0);
    const saved = repo.upsert.mock.calls[0][0];
    expect(saved.status).toBe('blocked_consent');
  });

  it('draft durumundaki bildirim erkenden döner, enqueue EDİLMEZ (KVKK onay guard)', async () => {
    const input: SendToParentInput = {
      tenantId: 't-11111111-1111-1111-1111-111111111111',
      notificationId: 'n-003',
      subjectId: 's-11111111-1111-1111-111111111111',
      channel: 'email',
      status: 'draft',
      messageBody: 'Veli bilgilendirme metni',
      eligibility: {
        consent: { status: 'approved' },
        phone: { exists: true, verified: true },
        channel: { allowed: true, channel: 'email' },
        messageBody: 'Veli bilgilendirme metni',
      },
      queue,
    };

    const status = await service.sendToParent(input);
    expect(status).toBe('draft');
    expect(queue.enqueued).toHaveLength(0);
  });

  it('doğrulanmamış telefon bildirimi ENGELLENİR (blocked_phone_unverified)', async () => {
    const input: SendToParentInput = {
      tenantId: 't-11111111-1111-1111-1111-111111111111',
      notificationId: 'n-003',
      subjectId: 's-11111111-1111-1111-111111111111',
      channel: 'whatsapp',
      status: 'approved',
      messageBody: 'Bildirim',
      eligibility: {
        consent: { status: 'approved' },
        phone: { exists: true, verified: false },
        channel: { allowed: true, channel: 'whatsapp' },
        messageBody: 'Bildirim',
      },
      queue,
    };

    const status = await service.sendToParent(input);
    expect(status).toBe('blocked_phone_unverified');
    expect(queue.enqueued).toHaveLength(0);
  });

  it('redactNotificationPayload telefonu maskeler (regresyon)', () => {
    const out = redactNotificationPayload({
      messageBody: 'Ara: 0XXX0000000',
      channel: 'sms',
    }) as { messageBody: string };
    expect(out.messageBody).toBe('[REDACTED]');
  });
});
