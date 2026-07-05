type ConsentType = 'general_processing' | 'attendance_tracking' | 'parent_notification' | 'sms_notification' | 'whatsapp_notification' | 'email_notification';
type ConsentStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired';

type ConsentRecord = { subjectId: string; type: ConsentType; status: ConsentStatus; expiresAt?: Date | null };
interface ConsentReader { findSubjectConsent(subjectId: string, type: ConsentType): Promise<ConsentRecord | null>; }

class ConsentGuard {
  constructor(private readonly consents: ConsentReader) {}

  async canProcess(subjectId: string, type: ConsentType, now = new Date()): Promise<boolean> {
    const consent = await this.consents.findSubjectConsent(subjectId, type);
    return consent?.status === 'approved' && (!consent.expiresAt || consent.expiresAt > now);
  }
}

describe('KVKK consent guard', () => {
  it('allows processing only when the requested consent is approved and not expired', async () => {
    const reader: ConsentReader = { findSubjectConsent: jest.fn().mockResolvedValue({ subjectId: 'student-1', type: 'attendance_tracking', status: 'approved', expiresAt: new Date('2099-01-01') }) };

    await expect(new ConsentGuard(reader).canProcess('student-1', 'attendance_tracking', new Date('2026-01-01'))).resolves.toBe(true);
    expect(reader.findSubjectConsent).toHaveBeenCalledWith('student-1', 'attendance_tracking');
  });

  it.each<ConsentStatus>(['pending', 'rejected', 'revoked', 'expired'])('blocks %s consent statuses', async (status) => {
    const reader: ConsentReader = { findSubjectConsent: jest.fn().mockResolvedValue({ subjectId: 'student-1', type: 'attendance_tracking', status }) };

    await expect(new ConsentGuard(reader).canProcess('student-1', 'attendance_tracking')).resolves.toBe(false);
  });

  it('blocks missing or expired consent', async () => {
    await expect(new ConsentGuard({ findSubjectConsent: jest.fn().mockResolvedValue(null) }).canProcess('student-1', 'attendance_tracking')).resolves.toBe(false);
    await expect(new ConsentGuard({ findSubjectConsent: jest.fn().mockResolvedValue({ subjectId: 'student-1', type: 'attendance_tracking', status: 'approved', expiresAt: new Date('2025-01-01') }) }).canProcess('student-1', 'attendance_tracking', new Date('2026-01-01'))).resolves.toBe(false);
  });
});
