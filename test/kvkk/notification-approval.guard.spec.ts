type Channel = 'sms' | 'whatsapp' | 'email';
type ConsentStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired';
type NotificationApproval = { subjectId: string; channel: Channel; status: ConsentStatus };
interface NotificationApprovalReader { getApproval(subjectId: string, channel: Channel): Promise<NotificationApproval | null>; }

class NotificationApprovalGuard {
  constructor(private readonly approvals: NotificationApprovalReader) {}

  async canSend(subjectId: string, channel: Channel): Promise<boolean> {
    const approval = await this.approvals.getApproval(subjectId, channel);
    return approval?.status === 'approved';
  }
}

describe('KVKK notification approval guard', () => {
  it('allows a notification only for the approved channel', async () => {
    const approvals: NotificationApprovalReader = { getApproval: jest.fn().mockImplementation(async (_subjectId, channel) => ({ subjectId: 'parent-1', channel, status: channel === 'sms' ? 'approved' : 'revoked' })) };
    const guard = new NotificationApprovalGuard(approvals);

    await expect(guard.canSend('parent-1', 'sms')).resolves.toBe(true);
    await expect(guard.canSend('parent-1', 'whatsapp')).resolves.toBe(false);
  });

  it('blocks when approval is missing', async () => {
    await expect(new NotificationApprovalGuard({ getApproval: jest.fn().mockResolvedValue(null) }).canSend('parent-1', 'email')).resolves.toBe(false);
  });
});
