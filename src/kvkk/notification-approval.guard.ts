import { NotificationInput } from './types';

export const NOT_APPROVED = 'NOT_APPROVED';

export class NotificationApprovalGuard {
  canSend(notification: Pick<NotificationInput, 'status'>): true | typeof NOT_APPROVED {
    return notification.status === 'approved' ? true : NOT_APPROVED;
  }
}
