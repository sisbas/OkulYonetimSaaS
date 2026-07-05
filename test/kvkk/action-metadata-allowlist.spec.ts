type AuditMetadata = Record<string, string | number | boolean | null>;

const ALLOWED_ACTION_METADATA_KEYS = ['requestId', 'tenantId', 'actorUserId', 'resourceId', 'status', 'channel'] as const;
type AllowedActionMetadataKey = (typeof ALLOWED_ACTION_METADATA_KEYS)[number];

class ActionMetadataAllowlist {
  private readonly allowed = new Set<string>(ALLOWED_ACTION_METADATA_KEYS);

  filter(metadata: Record<string, unknown>): Partial<Record<AllowedActionMetadataKey, AuditMetadata[string]>> {
    return Object.fromEntries(Object.entries(metadata).filter(([key, value]) => this.allowed.has(key) && (value === null || ['string', 'number', 'boolean'].includes(typeof value)))) as Partial<Record<AllowedActionMetadataKey, AuditMetadata[string]>>;
  }
}

describe('KVKK action metadata allowlist', () => {
  it('keeps only approved low-risk metadata keys', () => {
    expect(new ActionMetadataAllowlist().filter({
      requestId: 'req-1', tenantId: 'tenant-1', actorUserId: 'user-1', resourceId: 'consent-1', status: 'approved', channel: 'sms',
      email: 'veli@example.com', phone: '+90555', freeText: 'contains personal data', nested: { unsafe: true },
    })).toEqual({ requestId: 'req-1', tenantId: 'tenant-1', actorUserId: 'user-1', resourceId: 'consent-1', status: 'approved', channel: 'sms' });
  });

  it('drops non-scalar values even when the key is allowed', () => {
    expect(new ActionMetadataAllowlist().filter({ requestId: { value: 'req-1' }, status: ['approved'], tenantId: null })).toEqual({ tenantId: null });
  });
});
