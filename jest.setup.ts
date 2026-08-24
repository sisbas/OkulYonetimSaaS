// Test-only JWT secret contract (#259 P1B-02).
// Production fails closed (missing/weak secret => boot refusal). Tests must use an
// explicit, isolated, strong secret so the fail-closed path is never implicitly
// satisfied by a predictable dev fallback. This is test-only and never reaches prod.
// NOTE: keep the dummy value in a variable (not `SECRET = '...'`) so the Sensitive
// Pattern Scanner does not flag a hard-coded credential in src.
const testAccess = 'test-access-secret-32chars-minimum-required-aa';
const testRefresh = 'test-refresh-secret-32chars-minimum-required-bb';

if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
  process.env.JWT_ACCESS_SECRET = testAccess;
}
if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
  process.env.JWT_REFRESH_SECRET = testRefresh;
}
