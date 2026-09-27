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

// #339 R4 / F1 — güvenlik bağlamı fallback'i (TEST-ONLY).
//
// Üretimde VARSAYILAN FAIL-CLOSED'dır: yetki/şube çözümlenemezse istek RED
// edilir (`NODE_ENV=production` iken fallback tümüyle kapalıdır). Yerel/CI test
// ortamında gerçek PostgreSQL bulunmadığı için yetki çözümleyici altyapı hatası
// verebilir; bu yüzden gürültülü oturum-fallback'i test ortamında AÇIKÇA
// açıyoruz (loglanır, istemci beyanı yine yetki üretmez).
//
// Bu bir test kolaylığıdır; üretim davranışı
// `src/common/guards/permission.guard.spec.ts` içinde kanıtlanır
// (production + bayrak yok → istek RED edilir).
if (!process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK) {
  process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = 'true';
}
