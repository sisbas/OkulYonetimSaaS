import {
  ParentContactVisibilityGuard,
  createAllowedSmsChannelFixture,
  createApprovedNotificationFixture,
  createConsentFixture,
  createVerifiedPhoneFixture,
} from '../../src/kvkk';

describe('Parent contact visibility guard', () => {
  it('returns 403 and masks parent contact for roles without parent contact permission', () => {
    expect(new ParentContactVisibilityGuard().canView({
      permissions: ['student:group_students:read', 'attendance:own:submit'],
    })).toEqual({
      allowed: false,
      statusCode: 403,
      mask: true,
      reason: 'PARENT_CONTACT_PERMISSION_REQUIRED',
    });
  });

  it('allows parent contact only with explicit student:parent_contact:read permission', () => {
    expect(new ParentContactVisibilityGuard().canView({
      permissions: ['student:parent_contact:read'],
    })).toEqual({
      allowed: true,
      statusCode: 200,
      mask: false,
    });
  });

  it('provides KVKK consent test fixtures for notification guard scenarios', () => {
    expect(createConsentFixture('pending')).toEqual({ status: 'pending' });
    expect(createConsentFixture('approved')).toEqual({ status: 'approved' });
    expect(createConsentFixture('rejected')).toEqual({ status: 'rejected' });
    expect(createVerifiedPhoneFixture()).toEqual({ exists: true, verified: true });
    expect(createAllowedSmsChannelFixture()).toEqual({ channel: 'sms', allowed: true });
    expect(createApprovedNotificationFixture({ id: 'n-1' })).toMatchObject({
      id: 'n-1',
      status: 'approved',
      messageBody: 'Test notification body',
    });
  });
});
