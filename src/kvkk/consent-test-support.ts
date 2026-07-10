import { ChannelInput, ConsentInput, NotificationInput, PhoneInput } from './types';

export const createConsentFixture = (status: ConsentInput['status']): ConsentInput => ({ status });

export const createVerifiedPhoneFixture = (): PhoneInput => ({ exists: true, verified: true });

export const createAllowedSmsChannelFixture = (): ChannelInput => ({ channel: 'sms', allowed: true });

export const createApprovedNotificationFixture = (overrides: Partial<NotificationInput> = {}): NotificationInput => ({
  id: 'notification-test-1',
  subjectId: 'student-test-1',
  channel: 'sms',
  status: 'approved',
  messageBody: 'Test notification body',
  ...overrides,
});
