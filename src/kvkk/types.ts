export type ConsentStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export type NotificationStatus =
  | 'blocked_consent'
  | 'blocked_phone'
  | 'blocked_phone_unverified'
  | 'blocked_channel'
  | 'draft'
  | 'approved'
  | 'sent';

export type NotificationChannel = 'sms' | 'whatsapp' | 'email' | string;

export interface ConsentInput {
  status?: ConsentStatus | null;
}

export interface PhoneInput {
  exists: boolean;
  verified: boolean;
}

export interface ChannelInput {
  allowed: boolean;
  channel: NotificationChannel;
}

export interface NotificationInput {
  id: string;
  subjectId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  messageBody: string | null;
}

export interface NotificationResult {
  status: NotificationStatus;
  message_body: string | null;
  reason?: string;
}

export interface ProviderJob {
  notificationId: string;
  subjectId: string;
  channel: NotificationChannel;
  messageBody: string;
}

export interface ProviderJobQueue {
  enqueue(job: ProviderJob): Promise<void> | void;
}

export interface NotificationEligibilityInput {
  consent?: ConsentInput | null;
  phone: PhoneInput;
  channel: ChannelInput;
  messageBody: string | null;
}

export interface NotificationSendInput {
  notification: NotificationInput;
  consent?: ConsentInput | null;
  phone: PhoneInput;
  channel: ChannelInput;
  queue: ProviderJobQueue;
}
