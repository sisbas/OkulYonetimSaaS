import { NotificationSimulatorService } from './notification-simulator.service';

describe('NotificationSimulatorService', () => {
  const ORIGINAL = process.env.NOTIFICATION_SIMULATOR_MODE;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.NOTIFICATION_SIMULATOR_MODE;
    } else {
      process.env.NOTIFICATION_SIMULATOR_MODE = ORIGINAL;
    }
  });

  function withMode(mode?: string | null): NotificationSimulatorService {
    if (mode === undefined || mode === null) {
      delete process.env.NOTIFICATION_SIMULATOR_MODE;
    } else {
      process.env.NOTIFICATION_SIMULATOR_MODE = mode;
    }
    return new NotificationSimulatorService();
  }

  const input = {
    outboxId: '30000000-0000-4000-8000-000000000001',
    attempt: 1,
    eventType: 'attendance.absent.locked',
    channel: 'sms',
  };

  it('defaults to accept mode when env is unset', () => {
    const service = withMode(undefined);
    expect(service.mode).toBe('accept');
    expect(service.simulate(input).outcome).toBe('provider_accepted');
  });

  it('reject mode rejects every attempt with allowlisted error code', () => {
    const service = withMode('reject');
    const result = service.simulate(input);
    expect(result.outcome).toBe('provider_rejected');
    expect(result.errorCode).toBe('SIMULATED_REJECTION');
    expect(service.simulate({ ...input, attempt: 3 }).outcome).toBe('provider_rejected');
  });

  it('uncertain mode returns uncertain outcome without error code', () => {
    const service = withMode('uncertain');
    const result = service.simulate(input);
    expect(result.outcome).toBe('uncertain');
    expect(result.errorCode).toBeNull();
  });

  it('fail_first:N rejects the first N attempts then accepts', () => {
    const service = withMode('fail_first:2');
    expect(service.simulate({ ...input, attempt: 1 }).outcome).toBe('provider_rejected');
    expect(service.simulate({ ...input, attempt: 2 }).outcome).toBe('provider_rejected');
    expect(service.simulate({ ...input, attempt: 3 }).outcome).toBe('provider_accepted');
  });

  it('fails closed on unknown mode values', () => {
    expect(() => withMode('explode')).toThrow(/NOTIFICATION_SIMULATOR_MODE/);
    expect(() => withMode('')).toThrow(/NOTIFICATION_SIMULATOR_MODE/);
    expect(() => withMode('fail_first:abc')).toThrow(/NOTIFICATION_SIMULATOR_MODE/);
  });

  it('provider reference is deterministic per outbox + attempt (evidence stability)', () => {
    const service = withMode('accept');
    const first = service.simulate(input);
    const second = service.simulate(input);
    expect(first.providerRef).toBe(`sim:${input.outboxId}:1`);
    expect(second.providerRef).toBe(first.providerRef);
    expect(service.simulate({ ...input, attempt: 2 }).providerRef).not.toBe(
      first.providerRef,
    );
  });
});
