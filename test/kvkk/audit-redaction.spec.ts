const SENSITIVE_KEYS = new Set(['password', 'refreshToken', 'accessToken', 'token', 'email', 'phone']);

function redactAuditPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactAuditPayload);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, SENSITIVE_KEYS.has(key) ? '[REDACTED]' : redactAuditPayload(nested)]));
}

describe('KVKK audit redaction', () => {
  it('redacts direct and nested sensitive contact/auth fields without removing safe metadata', () => {
    expect(redactAuditPayload({
      action: 'student.create',
      email: 'veli@example.com',
      phone: '+905551112233',
      profile: { name: 'Ada', token: 'secret-token' },
      children: [{ email: 'child@example.com', classroom: '1-A' }],
    })).toEqual({
      action: 'student.create',
      email: '[REDACTED]',
      phone: '[REDACTED]',
      profile: { name: 'Ada', token: '[REDACTED]' },
      children: [{ email: '[REDACTED]', classroom: '1-A' }],
    });
  });

  it('keeps primitive values stable', () => {
    expect(redactAuditPayload(null)).toBeNull();
    expect(redactAuditPayload('request-id')).toBe('request-id');
  });
});
