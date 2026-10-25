'use strict';

const API_ROOT = '/api/v1';
const state = {
  accessToken: '',
  refreshToken: '',
  tenantId: '',
  branchId: '',
  branches: [],
  branchLabel: '',
  date: '',
  activeLeaveId: '',
  activeScheduleEventId: '',
  activeLeaveEtag: '',
  activeAssignmentId: '',
  queueCount: 0,
  impactCount: 0,
  candidateCount: 0,
  activeLessonLabel: '',
  permissions: [],
  pendingRoute: '',
  pendingBranch: '',
  pendingDraft: null,
  activeNotificationId: '',
  activeNotificationVersion: 0,
  scheduleId: '',
  scheduleRevision: 0,
  scheduleEvents: [],
  activeAttendanceSessionId: '',
  rateLimitedUntil: 0,
  lastAction: 'Henüz işlem yapılmadı.',
  rateLimitedUntil: 0,
};

const RATE_LIMIT_RETRY_MS = 20000;

const reasonUi = {
  LEAVE_NOT_APPROVED: ['empty_or_not_found_same_scope', 'Bu izin talebinde onay kararı bekleniyor.'],
  NO_PUBLISHED_SCHEDULE_EVENT: ['empty_or_not_found_same_scope', 'Bu izin için yayınlanmış program olayı bulunmuyor.'],
  BRANCH_NOT_VISIBLE: ['forbidden_non_enumerating', 'Bu şube görüntülenemiyor.'],
  TEACHER_COURSE_ELIGIBILITY_NOT_READY: ['eligibility_not_ready', 'Öğretmen-ders uygunluk kaynağı hazır değil.'],
  TEACHER_COURSE_MISMATCH: ['candidate_unavailable', 'Seçilen aday bu dersi veremez.'],
  SUBSTITUTE_TEACHER_INACTIVE: ['candidate_unavailable', 'Seçilen aday şu anda görevlendirmeye uygun değil.'],
  SUBSTITUTE_BRANCH_ASSIGNMENT_MISSING: ['candidate_unavailable', 'Seçilen aday bu şube kapsamında öğretmen olarak kayıtlı değil.'],
  SUBSTITUTE_LEAVE_OVERLAP: ['conflict_blocking', 'Seçilen adayın bu saatte onaylı izni var.'],
  SUBSTITUTE_TIME_CONFLICT: ['conflict_blocking', 'Görevlendirme mevcut program veya yedek görevle çakışıyor.'],
  ASSIGNMENT_ALREADY_EXISTS: ['locked_state', 'Bu ders için aktif bir görevlendirme var.'],
  ASSIGNMENT_NOT_FOUND: ['empty_or_not_found_same_scope', 'Temizlenecek aktif görevlendirme bulunamadı.'],
  LEAVE_VERSION_REQUIRED: ['version_required', 'Kayıt sürümü doğrulanmadan işlem yapılamaz.'],
  LEAVE_VERSION_MISMATCH: ['stale_version', 'Kayıt karar aşamasında değişti; güncel sürümü yükleyip yeniden deneyin.'],
};

const GENERIC_NEST_ERRORS = new Set(['Bad Request', 'Forbidden', 'Conflict', 'Precondition Failed', 'Not Found', 'Unauthorized']);
const GENERIC_NEST_MESSAGES = new Set([
  'leave version mismatch',
  'kayıt bulunamadı',
  'not found',
  'forbidden',
  'unauthorized',
  'bad request',
  'conflict',
  'precondition failed',
  'precondition required',
  'internal server error',
  'service unavailable',
]);

const statusStates = {
  0: 'offline_or_unavailable',
  400: 'validation_error',
  401: 'auth_required',
  403: 'forbidden_non_enumerating',
  404: 'empty_or_not_found_same_scope',
  409: 'conflict_blocking',
  412: 'stale_version',
  424: 'eligibility_not_ready',
  428: 'version_required',
  429: 'rate_limited',
};

const stateMessages = {
  auth_required: 'Oturumunuz yenilenmelidir.',
  tenant_context_required: 'Kurum bağlamı doğrulanamadı. Kurum seçiminizi kontrol edin.',
  branch_context_required: 'Şube bağlamı doğrulanamadı. Şube seçiminizi kontrol edin.',
  forbidden_non_enumerating: 'Bu işlem için yetkiniz yok.',
  empty_or_not_found_same_scope: 'Bu kapsam ve tarihte kayıt bulunamadı.',
  validation_error: 'Girilen bilgileri kontrol edin.',
  version_required: 'İşlem, güncel izin kaydı doğrulanmadan yapılamaz.',
  stale_version: 'Kayıt başka bir işlemle güncellendi; güncel kaydı alıp yeniden deneyin.',
  rate_limited: 'İşlem sıklığı sınırına ulaşıldı. Kısa bir süre bekleyip yeniden deneyin.',
  eligibility_not_ready: 'Öğretmen-ders uygunluk kaynağı hazır değil. Uygunluk tamamlandığında yeniden deneyin.',
  candidate_unavailable: 'Seçilen aday bu ders veya şube kapsamı için uygun değil.',
  conflict_blocking: 'İşlem, kaydın başka bir değişikliğiyle çakışıyor. Güncel kaydı alıp yeniden deneyin.',
  locked_state: 'Bu ders için aktif bir görevlendirme var. Görevlendirmeyi temizleyip yeniden deneyin.',
  error_retryable: 'İşlem tamamlanamadı. Kısa süre sonra tekrar deneyin.',
  offline_or_unavailable: 'Bağlantı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.',
};

const uiStateTitles = {
  auth_required: 'Oturum yenilenmeli',
  tenant_context_required: 'Kurum seçimi doğrulanamadı',
  branch_context_required: 'Şube seçimi doğrulanamadı',
  forbidden_non_enumerating: 'Bu işlem için yetkiniz yok',
  empty_or_not_found_same_scope: 'Kayıt bulunamadı',
  validation_error: 'Bilgileri kontrol edin',
  version_required: 'Güncel kayıt bekleniyor',
  stale_version: 'Kayıt güncellendi',
  eligibility_not_ready: 'Uygunluk bekleniyor',
  candidate_unavailable: 'Aday uygun değil',
  conflict_blocking: 'Çakışma var',
  locked_state: 'İşlem kilitli',
  rate_limited: 'Kısa süre bekleyin',
  error_retryable: 'İşlem tamamlanamadı',
  offline_or_unavailable: 'Bağlantı kurulamadı',
};

const UI_STATES = {
  auth_required: {
    title: 'Oturum yenilenmeli',
    message: 'Oturum yenilenmeli.',
    hint: 'Oturumu yenileyip işlemi tekrar deneyin.',
  },
  tenant_context_required: {
    title: 'Kurum seçimi doğrulanamadı',
    message: 'Kurum bağlamı doğrulanamadı.',
    hint: 'Kurum seçimini kontrol edin.',
  },
  branch_context_required: {
    title: 'Şube seçimi doğrulanamadı',
    message: 'Şube bağlamı doğrulanamadı.',
    hint: 'Şube seçimini kontrol edin.',
  },
  forbidden_non_enumerating: {
    title: 'Bu işlem için yetkiniz yok',
    message: 'Bu işlem için yetkiniz yok.',
    hint: 'Yetki kapsamınız dışında kalan kayıtlar listelenmez.',
  },
  empty_or_not_found_same_scope: {
    title: 'Kayıt bulunamadı',
    message: 'Kayıt bulunamadı veya silinmiş olabilir.',
    hint: 'Kapsamı yenileyin veya farklı tarih/şube deneyin.',
  },
  same_scope_empty: {
    title: 'Bu kapsamda kayıt yok',
    message: 'Kapsamınızda bu alanda henüz kayıt yok.',
    hint: 'Kapsamı değiştirip yeniden deneyebilirsiniz.',
  },
  validation_error: {
    title: 'Bilgileri kontrol edin',
    message: 'Alanları kontrol edin.',
    hint: 'Zorunlu alanları ve tarih aralığını gözden geçirin.',
  },
  version_required: {
    title: 'Güncel kayıt bekleniyor',
    message: 'Kayıt sürümü doğrulanmadan işlem yapılamaz.',
    hint: 'Önce güncel izin kaydını tekrar yükleyin.',
  },
  stale_version: {
    title: 'Kayıt güncellendi',
    message: 'Kayıt güncellendi; yenileme gerekir.',
    hint: 'Kayıt değişmiş; etki listesini yenileyin.',
  },
  eligibility_not_ready: {
    title: 'Uygunluk bekleniyor',
    message: 'Öğretmen-ders uygunluk kaynağı hazır değil.',
    hint: 'Uygunluk kaynağı tamamlandığında adaylar yeniden getirilebilir.',
  },
  impact_not_ready: {
    title: 'Etki hesaplanamadı',
    message: 'Yetkili kaynak henüz hazır olmadığı için etki hesaplanamadı.',
    hint: 'Sistem kaynağı tamamlandığında tekrar deneyin.',
  },
  candidate_unavailable: {
    title: 'Aday uygun değil',
    message: 'Seçilen aday bu ders için uygun değil.',
    hint: 'Başka bir adayı seçin veya ders kapsamını kontrol edin.',
  },
  conflict_blocking: {
    title: 'Çakışma var',
    message: 'Çakışma çözüldükten sonra yeniden deneyin.',
    hint: 'Çakışmayı giderip işlemi tekrarlayın.',
  },
  locked_state: {
    title: 'İşlem kilitli',
    message: 'Bu kayıt şu anda kilitli durumda.',
    hint: 'Kayıt durumunu yenileyip yeniden deneyin.',
  },
  rate_limited: {
    title: 'Çok fazla istek',
    message: 'Kısa sürede çok fazla işlem gönderildi; biraz bekleyin.',
    hint: 'Bekleme süresi dolduğunda işlemi tekrarlayın.',
  },
  error_retryable: {
    title: 'İşlem tamamlanamadı',
    message: 'İşlem tamamlanamadı.',
    hint: 'Sorun devam ederse günlük işleri yenileyin.',
  },
  offline_or_unavailable: {
    title: 'Bağlantı kurulamadı',
    message: 'Bağlantı kurulamadı.',
    hint: 'Bağlantıyı kontrol edip yeniden deneyin.',
  },
  unknown_server_state: {
    title: 'İşlem tamamlanamadı',
    message: 'Sunucu beklenmeyen bir yanıt verdi.',
    hint: 'İşlemi tekrarlamadan önce listeyi yenileyin.',
  },
};

const SERVER_REASON_UI = {
  missing_authenticated_context: { state: 'auth_required' },
  unresolved_context: { state: 'auth_required' },
  stale_authorization: { state: 'auth_required' },
  client_authority_rejected: { state: 'forbidden_non_enumerating' },
  undeclared_protected_route: { state: 'forbidden_non_enumerating' },
  missing_permission: { state: 'forbidden_non_enumerating' },
  cross_tenant_or_unknown_resource: { state: 'empty_or_not_found_same_scope' },
  LEAVE_VERSION_REQUIRED: { state: 'version_required' },
  LEAVE_VERSION_MISMATCH: { state: 'stale_version' },
  TEACHER_COURSE_ELIGIBILITY_NOT_READY: { state: 'impact_not_ready' },
  TEACHER_COURSE_MISMATCH: {
    state: 'candidate_unavailable',
    message: 'Seçilen aday bu ders için uygun değil.',
  },
  SUBSTITUTE_TEACHER_INACTIVE: {
    state: 'candidate_unavailable',
    message: 'Seçilen aday bu okulda aktif görevli değil.',
  },
  SUBSTITUTE_BRANCH_ASSIGNMENT_MISSING: {
    state: 'candidate_unavailable',
    message: 'Seçilen aday bu şube kapsamı için uygun değil.',
  },
  SUBSTITUTE_LEAVE_OVERLAP: {
    state: 'conflict_blocking',
    message: 'Seçilen öğretmenin aynı zamanda onaylı izni var.',
  },
  SUBSTITUTE_TIME_CONFLICT: {
    state: 'conflict_blocking',
    message: 'Görevlendirme mevcut program veya yedek görevle çakışıyor.',
  },
  ASSIGNMENT_ALREADY_EXISTS: {
    state: 'locked_state',
    message: 'Bu ders için aktif görevlendirme var.',
  },
  ASSIGNMENT_NOT_FOUND: {
    state: 'empty_or_not_found_same_scope',
    message: 'Aktif görevlendirme bulunamadı.',
  },
  NOTIFICATION_NOT_FOUND: {
    state: 'empty_or_not_found_same_scope',
    message: 'Bildirim bulunamadı veya kapsamınız dışında.',
  },
  'NOTIFICATION DRAFT BULK VERSION CONFLICT': {
    state: 'stale_version',
    message: 'Liste güncellendi; yenileyip tekrar deneyin.',
  },
  CLAIM_ACTIVE: {
    state: 'conflict_blocking',
    message: 'Bu bildirim şu anda gönderiliyor; kısa süre sonra yenileyin.',
  },
  BACKOFF_ACTIVE: {
    state: 'conflict_blocking',
    message: 'Yeniden deneme beklemede; biraz sonra tekrar deneyin.',
  },
  CLAIM_LOST: {
    state: 'conflict_blocking',
    message: 'Kayıt başka bir işlemle değişti; listeyi yenileyin.',
  },
  IDEMPOTENT_DISPATCHED: {
    state: 'locked_state',
    message: 'Bu bildirim zaten gönderilmiş.',
  },
  NOT_DISPATCHABLE: {
    state: 'locked_state',
    message: 'Bu durumda gönderim eylemi uygulanamaz; kayıt durumunu yenileyin.',
  },
};

const HTTP_STATUS_UI_STATE = {
  0: 'offline_or_unavailable',
  400: 'validation_error',
  401: 'auth_required',
  403: 'forbidden_non_enumerating',
  404: 'empty_or_not_found_same_scope',
  409: 'conflict_blocking',
  412: 'stale_version',
  422: 'validation_error',
  424: 'impact_not_ready',
  428: 'version_required',
  429: 'rate_limited',
};

const RATE_LIMIT_COOLDOWN_MS = 5000;
const statusLabels = {
  pending: 'Beklemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  open: 'Açık',
  unresolved: 'Henüz karşılanmadı',
  assigned: 'Görevlendirildi',
  resolved: 'Çözüldü',
  covered: 'Karşılandı',
  uncovered: 'Karşılanmadı',
  partially_covered: 'Kısmen karşılandı',
  not_required: 'Karşılık gerekmiyor',
  cancelled: 'İptal edildi',
  blocked_consent: 'Onay engelli',
  dispatched: 'Gönderildi',
  delivered: 'Teslim edildi',
  failed: 'Başarısız',
  dead_lettered: 'Durduruldu',
  uncertain: 'Belirsiz',
  closed: 'Kapatıldı',
  draft: 'Taslak',
  published: 'Yayınlandı',
  locked: 'Kilitli',
  present: 'Hazır',
  absent: 'Devamsız',
  late: 'Geç',
  excused: 'Mazeretli',
  revoked: 'Geri çekildi',
  unknown: 'Durum bekleniyor',
};
const statusTones = {
  approved: 'success',
  assigned: 'success',
  resolved: 'success',
  covered: 'success',
  pending: 'warning',
  open: 'warning',
  unresolved: 'warning',
  partially_covered: 'warning',
  uncovered: 'danger',
  rejected: 'danger',
  failed: 'danger',
  dead_lettered: 'danger',
  dispatched: 'success',
  delivered: 'success',
  blocked_consent: 'warning',
  uncertain: 'warning',
  cancelled: 'neutral',
  closed: 'neutral',
  draft: 'neutral',
  published: 'success',
  locked: 'success',
  present: 'success',
  late: 'warning',
  excused: 'neutral',
  revoked: 'neutral',
};

const $ = (selector) => document.querySelector(selector);

function setStatus(text, tone = 'neutral') {
  const el = $('#session-status');
  el.textContent = text;
  el.dataset.tone = tone;
  const logoutBtn = $('#logout-button');
  if (logoutBtn) {
    if (state.accessToken) logoutBtn.classList.remove('hidden');
    else logoutBtn.classList.add('hidden');
  }
}

function announce(message, tone = 'neutral') {
  const el = $('#message-region');
  state.lastAction = message;
  el.innerHTML = `<div class="notice" data-tone="${tone}">${escapeHtml(message)}</div>`;
  updateOperationalSnapshot();
}

function summaryText(value, fallback) {
  return value ? String(value) : fallback;
}

function recommendedAction() {
  if (!state.accessToken) return 'Önce oturum açın.';
  if (!state.branchId) return 'İşlem kapsamı için şube ve tarihi seçin.';
  if (!state.activeLeaveId) return 'Öğretmen izni oluşturun veya günlük iş listesinden etkilenen talebi açın.';
  if (!state.activeScheduleEventId) return 'Etki listesinden ders seçip adayları getirin.';
  if (!state.activeAssignmentId && !state.candidateCount) return 'Uygun yedek öğretmen adaylarını getirin.';
  if (!state.activeAssignmentId) return 'Uygun adayı seçerek görevlendirmeyi tamamlayın.';
  return 'Ders karşılığı tamamlandı; günlük iş listesini yenileyerek sonucu doğrulayın.';
}

function updateOperationalSnapshot() {
  const branchId = state.branchId;
  const date = state.date || $('#operation-date')?.value;
  $('#summary-session').textContent = state.accessToken ? 'Aktif' : 'Bekleniyor';
  $('#summary-scope').textContent = branchId ? `${state.branchLabel}${date ? ` · ${date}` : ''}` : 'Şube seçilmedi';
  $('#summary-leave').textContent = summaryText(state.activeLeaveId, 'Talep seçilmedi');
  $('#summary-assignment').textContent = state.activeAssignmentId
    ? 'Görevlendirme tamamlandı'
    : state.queueCount || state.impactCount || state.candidateCount
      ? `${state.queueCount} açık ders · ${state.impactCount} etki · ${state.candidateCount} aday`
      : 'Henüz iş yok';
  $('#summary-lesson').textContent = summaryText(state.activeLessonLabel, 'Henüz seçilmedi');
  $('#next-action').textContent = recommendedAction();
  $('#activity-trail').textContent = `Son işlem: ${state.lastAction}`;
  const selectedLesson = $('#selected-lesson-context');
  if (selectedLesson) {
    selectedLesson.innerHTML = state.activeLessonLabel
      ? `<strong>${escapeHtml(state.activeLessonLabel)}</strong><p>Bu ders için etki ve aday seçimi aynı kayıt güncelliğiyle takip ediliyor.</p>`
      : '<strong>Seçili ders yok</strong><p>Günlük iş listesinden bir dersin etkisini açtığınızda aday seçimi burada bağlama oturur.</p>';
  }
}

function updateWorkflowProgress(blockedStep = '', blockedMessage = '') {
  const steps = ['session', 'context', 'leave', 'impact', 'assignment'];
  let current = 'session';
  if (state.accessToken) current = 'context';
  if (state.branchId) current = 'leave';
  if (state.activeLeaveId) current = 'impact';
  if (state.activeScheduleEventId) current = 'assignment';
  if (state.activeAssignmentId) current = '';

  document.querySelectorAll('#workflow-steps [data-step]').forEach((step) => {
    const name = step.dataset.step;
    const stepIndex = steps.indexOf(name);
    const currentIndex = current ? steps.indexOf(current) : steps.length;
    let stepState = stepIndex < currentIndex ? 'done' : '';
    if (name === current) stepState = 'current';
    if (name === blockedStep) stepState = 'blocked';
    step.dataset.state = stepState;
    step.setAttribute('aria-current', name === current ? 'step' : 'false');
    const helper = step.querySelector('small');
    if (helper && name === blockedStep && blockedMessage) helper.textContent = blockedMessage;
  });
  updateOperationalSnapshot();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

// #445 API seam: bir istek gönderilmeden önce aktörün izin anahtarı kontrol
// edilir. Bu tablo sunucu @Permissions guard'larının KULLANIKLILIK kopyasıdır
// (runtime-route-permission-seam.spec.ts iki tarafı senkron tutar); gizlenen
// kontrol ve reddedilen istek hiçbir zaman zorlama değildir — zorlama
// sunucudadır. Tabloda karşılığı olmayan hiçbir iş rotası gönderilmez
// (fail-closed); oturum/oluğum uçlarını izin gerektirmez.
const ROUTE_PERMISSIONS = [
  { method: 'GET', path: '/context', permission: '' },
  { method: 'POST', path: '/context/branch', permission: '' },
  { method: 'POST', path: '/auth/login', permission: '' },
  { method: 'POST', path: '/auth/refresh', permission: '' },
  { method: 'POST', path: '/leaves/me', permission: 'leave:create' },
  { method: 'GET', path: '/leaves/me/:id', permission: 'leave:own:read' },
  { method: 'GET', path: '/leaves', permission: 'leave:read' },
  { method: 'GET', path: '/leaves/:id', permission: 'leave:read' },
  { method: 'PATCH', path: '/leaves/:id/approve', permission: 'leave:approve' },
  { method: 'PATCH', path: '/leaves/:id/reject', permission: 'leave:reject' },
  { method: 'GET', path: '/daily-operations/today', permission: 'daily_operations:read' },
  { method: 'GET', path: '/daily-operations/leaves/:leaveId/impact', permission: 'leave:impact:read' },
  { method: 'GET', path: '/daily-operations/leaves/:leaveId/events/:scheduleEventId/candidates', permission: 'leave:impact:read' },
  { method: 'POST', path: '/daily-operations/leaves/:leaveId/events/:scheduleEventId/substitution', permission: 'daily_operations:update' },
  { method: 'DELETE', path: '/daily-operations/leaves/:leaveId/events/:scheduleEventId/substitution', permission: 'daily_operations:update' },
  { method: 'POST', path: '/daily-operations/leaves/:leaveId/projection/replay', permission: 'daily_operations:update' },
  { method: 'POST', path: '/schedules', permission: 'schedule:draft:create' },
  { method: 'POST', path: '/schedules/:id/draft', permission: 'schedule:draft:update' },
  { method: 'POST', path: '/schedules/:id/validate', permission: 'schedule:read' },
  { method: 'POST', path: '/schedules/:id/publish', permission: 'schedule:publish' },
  { method: 'POST', path: '/schedules/:id/unpublish', permission: 'schedule:publish' },
  { method: 'GET', path: '/consents', permission: 'consent:read' },
  { method: 'POST', path: '/consents/revoke', permission: 'consent:revoke' },
  { method: 'GET', path: '/notifications', permission: 'notification:draft:read' },
  { method: 'GET', path: '/notifications/:id', permission: 'notification:draft:read' },
  { method: 'POST', path: '/notifications/drafts/session/:sessionId/approve', permission: 'notification:draft:approve' },
  { method: 'POST', path: '/notifications/drafts/:id/approve', permission: 'notification:draft:approve' },
  { method: 'POST', path: '/notifications/drafts/:id/close', permission: 'notification:draft:close' },
  { method: 'POST', path: '/notifications/:id/execute', permission: 'parent_notification:send' },
  { method: 'POST', path: '/notifications/:id/retry', permission: 'parent_notification:send' },
  { method: 'POST', path: '/notifications/:id/cancel', permission: 'parent_notification:approve' },
  { method: 'GET', path: '/attendance/sessions', permission: 'attendance:own:read' },
  { method: 'POST', path: '/attendance/sessions', permission: 'attendance:generate' },
  { method: 'GET', path: '/attendance/sessions/:id/records', permission: 'attendance:own:read' },
  { method: 'POST', path: '/attendance/sessions/:id/records', permission: 'attendance:record:update' },
  { method: 'POST', path: '/attendance/sessions/:id/lock', permission: 'attendance:lock' },
  { method: 'POST', path: '/attendance/sessions/:id/records/:studentId/correction', permission: 'attendance:update' },
];

/** Oturum/katalog uçları iş izni gerektirmez; tabloya girmenin tersi. */
function isSessionBound(path) {
  return path.startsWith('/context') || path.startsWith('/auth/');
}

/**
 * Yol şablonlarını eşleştirir: ':param' bölümü herhangi bir segmenti tüketir,
 * diğer bölümler birebir eşleşmek zorundadır. Eşleşme yoksa null döner —
 * çağıran fail-closed reddeder; oturum uçları için boş dize (izin gerekmez).
 */
function permissionForRoute(method, rawPath) {
  const path = String(rawPath || '').split('?')[0].split('#')[0];
  if (isSessionBound(path)) return '';
  const segments = path.split('/').filter(Boolean);
  for (const rule of ROUTE_PERMISSIONS) {
    if (rule.method !== method) continue;
    const parts = rule.path.split('/').filter(Boolean);
    if (parts.length !== segments.length) continue;
    let matched = true;
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i].charAt(0) === ':') continue;
      if (parts[i] !== segments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return rule.permission;
  }
  return null;
}

/** Kullanılabilirlik yakınsaması: anahtar yoksa istek istemcide reddedilir. */
function canRequest(method, path) {
  const required = permissionForRoute(method, path);
  // null = tabloda olmayan rota (fail-closed), '' = oturum ucu (izin yok).
  return required !== null && (required === '' || state.permissions.includes(required));
}

function asArray(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function pick(value, keys, fallback = '') {
  for (const key of keys) if (value?.[key] !== undefined && value?.[key] !== null) return value[key];
  return fallback;
}

async function apiRequest(path, options = {}, _refreshAttempted = false) {
  const method = options.method || 'GET';
  // Kullanılabilirlik ön kontrolü (#445): istek gönderilmeden reddedilir;
  // sunucu yine de kendi kararını bağımsız verir.
  if (!canRequest(method, path)) {
    throw normalizeApiError({ status: 403, headers: { get: () => null } }, {}, options);
  }
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (state.accessToken) headers.Authorization = 'Bearer ' + state.accessToken;
  if (state.branchId && !path.startsWith('/context') && !path.startsWith('/auth/')) {
    headers['x-branch-code'] = state.branchId;
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    handleNetworkError();
    throw normalizeApiError({ status: 0, headers: { get: () => null } }, { message: '' });
  }
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON response (e.g. HTML error page from a proxy). A failed
      // response is normalized into an operational error; a 200 with an
      // undecodable body is a server fault, never a fabricated empty state.
      if (response.ok) {
        throw normalizeApiError({ status: 502, headers: { get: () => null } }, { message: '' });
      }
      body = { message: text.slice(0, 200) };
    }
  }
  // On 401, attempt silent refresh once per request (skip auth endpoints and
  // cap recursion so a persistently-401 endpoint cannot loop refresh forever)
  if (response.status === 401 && !_refreshAttempted && !path.startsWith('/auth/') && state.refreshToken) {
    const refreshed = await trySilentRefresh();
    if (refreshed) {
      return apiRequest(path, options, true);
    }
    handleAuthRequired();
  }
  if (!response.ok) throw normalizeApiError(response, body, options);
  return { body, etag: response.headers.get('etag') || pick(body, ['leaveEtag', 'etag']) };
}

function flattenMessage(value) {
  const message = value?.message;
  if (Array.isArray(message)) return message.join(' ');
  return String(message || '');
}

function findReasonInMessage(message) {
  const normalized = String(message || '').toUpperCase();
  return Object.keys(reasonUi).find((code) => normalized.includes(code));
}

function normalizeApiError(response, body) {
  const messageText = flattenMessage(body);
  const explicitReason = pick(body, ['reasonCode', 'code']);
  const messageReason = findReasonInMessage(messageText);
  const genericError = GENERIC_NEST_ERRORS.has(String(body?.error || ''))
    || GENERIC_NEST_MESSAGES.has(messageText.toLowerCase());
  const errorReason = !genericError && reasonUi[body?.error] ? body.error : '';
  const reasonCode = String(explicitReason || messageReason || errorReason);
  const mapped = reasonUi[reasonCode];
  const uiState = mapped?.[0] || statusStates[response.status] || 'error_retryable';
  const knownReasonCode = Boolean(mapped);
  // Sunucunun ham taşıma hatası metni kullanıcıya gösterilmez: HTML/proxy
  // gövdesi, 5xx ve 429 yanıtları kanonik durum kopyasının arkasında kalır.
  const untrustedTransport =
    response.status === 429 || response.status >= 500 || /[<>]/.test(messageText);
  const message = knownReasonCode || genericError || !messageText || untrustedTransport
    ? mapped?.[1] || stateMessages[uiState]
    : messageText;
  return { status: response.status, reasonCode, uiState, message };
}

function armRateLimit() {
  state.rateLimitedUntil = Date.now() + RATE_LIMIT_RETRY_MS;
}

function refuseRepeatedAction() {
  if (Date.now() < state.rateLimitedUntil) {
    announce(stateMessages.rate_limited, 'warning');
    return true;
  }
  return false;
}

function renderError(target, error) {
  const uiState = error?.uiState || 'error_retryable';
  if (uiState === 'rate_limited') armRateLimit();
  const title = uiStateTitles[uiState] || 'İşlem tamamlanamadı';
  const message = error?.message || stateMessages[uiState] || 'İşlem tamamlanamadı.';
  target.innerHTML = `<div class="error-state" data-state="${escapeHtml(uiState)}">
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(message)}</p>
    <small class="recovery-hint">${escapeHtml(recoveryHint(uiState))}</small>
  </div>`;
  announce(message, 'danger');
}

function recoveryHint(uiState) {
  const hints = {
    auth_required: 'Oturumu yenileyip işlemi tekrar deneyin.',
    tenant_context_required: 'Kurum seçimini kontrol edin.',
    branch_context_required: 'Şube seçimini kontrol edin.',
    forbidden_non_enumerating: 'Yetki kapsamınız dışında kalan kayıtlar listelenmez.',
    empty_or_not_found_same_scope: 'Kapsamı yenileyin veya farklı tarih/şube deneyin.',
    validation_error: 'Zorunlu alanları ve tarih aralığını gözden geçirin.',
    version_required: 'Önce güncel izin kaydını tekrar yükleyin.',
    stale_version: 'Kayıt değişmiş; etki listesini yenileyin.',
    eligibility_not_ready: 'Uygunluk kaynağı tamamlandığında adaylar yeniden getirilebilir.',
    candidate_unavailable: 'Başka bir adayı seçin veya ders kapsamını kontrol edin.',
    conflict_blocking: 'Çakışma çözüldükten sonra yeniden deneyin.',
    locked_state: 'Aktif görevlendirmeyi temizleyip yeniden işlem yapın.',
    rate_limited: 'Kısa bir süre sonra aynı işlemi tekrar deneyin.',
    error_retryable: 'Sorun devam ederse günlük işleri yeniden yükleyin.',
    offline_or_unavailable: 'Bağlantıyı kontrol edip yeniden deneyin.',
  };
  return hints[uiState] || '';
}

function serverAuthoredCode(body) {
  const explicit = pick(body, ['reasonCode', 'code']);
  if (explicit) return String(explicit);
  const message = flattenMessage(body).toUpperCase();
  return Object.keys(SERVER_REASON_UI).find((code) => message.includes(code.toUpperCase())) || '';
}

function canonicalUiState(response, body, options = {}) {
  const status = response.status;
  // Çağıran, 404'ün kendi ekranında ne anlama geldiğini yetkili olarak bilir
  // (şube seçiminde reddedilen şube, var olmayan şubeden ayırt edilemez).
  if (options.notFoundUiState && status === 404) return options.notFoundUiState;
  const mapped = SERVER_REASON_UI[serverAuthoredCode(body)];
  if (mapped) return mapped.state;
  if (status === 409 && options.versioned) return 'stale_version';
  return HTTP_STATUS_UI_STATE[status] || (status >= 500 ? 'error_retryable' : 'unknown_server_state');
}

function normalizeApiError(response, body, options = {}) {
  const serverCode = serverAuthoredCode(body);
  const uiState = canonicalUiState(response, body, options);
  const mapped = SERVER_REASON_UI[serverCode];
  const copy = UI_STATES[uiState] || UI_STATES.error_retryable;
  const retryAfterHeader = response.headers?.get ? response.headers.get('retry-after') : null;
  return {
    status: response.status,
    reasonCode: serverCode,
    serverCode,
    uiState,
    message: mapped?.message || copy.message,
    retryAfterSeconds: Number(retryAfterHeader) || 0,
  };
}

function renderBlockingState(target, reasonCode) {
  const mapped = reasonUi[reasonCode];
  const uiState = mapped?.[0] || 'eligibility_not_ready';
  const message = mapped?.[1] || stateMessages[uiState] || 'İşlem bekleniyor.';
  const title = uiStateTitles[uiState] || 'İşlem bekliyor';
  target.innerHTML = `<div class="error-state" data-state="${escapeHtml(uiState)}">
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(message)}</p>
  </div>`;
  announce(message, 'warning');
}

function branchSelectionOutcome(error) {
  if (error?.status === 404 && !reasonUi[error.reasonCode]) {
    return { ...error, uiState: 'forbidden_non_enumerating', message: 'Bu şube görüntülenemiyor; yetki kapsamınız dışındaki şubeler listelenmez.' };
  }
  return error;
}

function canonicalStateBlock(uiState, message = '', title = '') {
  if (!uiState || !UI_STATES[uiState]) return '';
  const copy = UI_STATES[uiState];
  const variant = uiState === 'same_scope_empty' ? 'empty-state' : 'error-state';
  const hint = uiState === 'same_scope_empty' ? '' : `<small class="recovery-hint">${escapeHtml(copy.hint)}</small>`;
  return `<div class="${variant}" data-state="${escapeHtml(uiState)}">
    <strong>${escapeHtml(title || copy.title)}</strong>
    <p>${escapeHtml(message || copy.message)}</p>
    ${hint}
  </div>`;
}

function toneFor(uiState) {
  if (uiState === 'same_scope_empty') return 'neutral';
  if (uiState === 'error_retryable' || uiState === 'unknown_server_state') return 'danger';
  return 'warning';
}

function renderRegionState(target, uiState, message = '', title = '') {
  const copy = UI_STATES[uiState];
  if (!copy) {
    target.dataset.state = 'error_retryable';
    target.innerHTML = canonicalStateBlock('error_retryable', message);
    announce(message || copy?.message || UI_STATES.error_retryable.message, 'danger');
    return;
  }
  const text = message || copy.message;
  target.dataset.state = uiState;
  target.innerHTML = canonicalStateBlock(uiState, text, title);
  announce(text, toneFor(uiState));
}

function renderError(target, error) {
  const uiState = UI_STATES[error.uiState] ? error.uiState : 'error_retryable';
  if (uiState === 'rate_limited') startRateLimitCooldown(error.retryAfterSeconds);
  renderRegionState(target, uiState, error.message);
}

function startRateLimitCooldown(retryAfterSeconds) {
  const seconds = Number(retryAfterSeconds);
  state.rateLimitedUntil = Date.now() + (seconds > 0 ? seconds * 1000 : RATE_LIMIT_COOLDOWN_MS);
}

function mutationDisabled() {
  return Date.now() < state.rateLimitedUntil;
}

function requireSession() {
  if (!state.accessToken) {
    announce('Önce oturum açın.', 'warning');
    updateWorkflowProgress('session', 'Oturum açmadan devam edilemez');
    return false;
  }
  return true;
}

function getBranchId() {
  // This is a readable code; the server forwards its persisted choice to the
  // internal business DTO only after checking current session authority.
  return state.branchId;
}

function clearBranchWork() {
  state.activeLeaveId = '';
  state.activeScheduleEventId = '';
  state.activeLeaveEtag = '';
  state.activeAssignmentId = '';
  state.activeLessonLabel = '';
  state.queueCount = state.impactCount = state.candidateCount = 0;
  state.scheduleId = '';
  state.scheduleRevision = 0;
  state.scheduleEvents = [];
  state.activeAttendanceSessionId = '';
  for (const id of ['#teacher-output', '#queue-output', '#impact-output', '#candidate-output', '#leaves-output', '#consents-output', '#bulk-approve-output', '#schedule-status', '#schedule-events', '#attendance-sessions', '#attendance-detail']) {
    $(id).innerHTML = '';
  }
}

function applyCatalog(catalog) {
  const institutionEl = $('#context-institution');
  if (institutionEl) {
    institutionEl.textContent = pick(catalog?.institution, ['name'], '');
  }
  // Kapasite anahtarları (#445): sekme görünürlüğü sunucunun yetki anahtarlarından
  // türetilir; rol etiketi arayüz kararında kullanılmaz.
  state.permissions = [...new Set(asArray(catalog, ['permissions']))];
  state.branches = asArray(catalog, ['branches']);
  const selector = $('#branch-id');
  selector.innerHTML = '<option value="">Şube seçin</option>' + state.branches.map((branch) =>
    `<option value="${escapeHtml(branch.code)}">${escapeHtml(branch.name)} · ${escapeHtml(branch.code)}</option>`).join('');
  selector.disabled = !state.branches.length;
  // activeBranch yoksa branchId'yi TEMİZLEME: login sırasındaki GET /context
  // (x-branch-code göndermez) aktif şube döndürmeyebilir; bu durumda eşzamanlı
  // updateContext'in ayarladığı branchId'in sıfırlanmasını önler.
  if (catalog.activeBranch) {
    state.branchId = catalog.activeBranch.code || '';
    state.branchLabel = `${catalog.activeBranch.name} · ${catalog.activeBranch.code}`;
  }
  selector.value = state.branchId;
  renderNavigation();
  updateWorkflowProgress();
}

function toIso8601(value) {
  return new Date(value).toISOString();
}

async function loadCatalog({ announceOnSuccess = '' } = {}) {
  const retryEl = $('#context-retry');
  try {
    const { body: catalog } = await apiRequest('/context');
    applyCatalog(catalog);
    if (retryEl) retryEl.hidden = true;
    if (announceOnSuccess) announce(announceOnSuccess, 'success');
    return true;
  } catch (catalogError) {
    setStatus('Kurum bilgisi alınamadı', 'warning');
    if (retryEl) retryEl.hidden = false;
    renderError($('#teacher-output'), catalogError);
    return false;
  }
}

async function login(event) {
  event.preventDefault();
  state.accessToken = '';
  state.branchId = '';
  state.branchLabel = '';
  state.branches = [];
  clearBranchWork();
  $('#branch-id').disabled = true;
  $('#branch-id').innerHTML = '<option value="">Önce oturum açın</option>';
  const institutionEl = $('#context-institution');
  if (institutionEl) institutionEl.textContent = '';
  const retryEl = $('#context-retry');
  if (retryEl) retryEl.hidden = true;
  const body = {
    email: $('#email').value.trim(),
    password: $('#password').value,
  };
  const tenantId = $('#tenant-id').value.trim();
  if (tenantId) body.tenantId = tenantId;
  try {
    const { body: result } = await apiRequest('/auth/login', { method: 'POST', body });
    state.accessToken = result.accessToken || '';
    state.refreshToken = result.refreshToken || '';
    state.tenantId = tenantId;
    setStatus(state.accessToken ? 'Oturum aktif' : 'Token alınamadı', state.accessToken ? 'success' : 'warning');
    updateWorkflowProgress();
  } catch (error) {
    state.accessToken = '';
    state.refreshToken = '';
    setStatus('Oturum başarısız', 'danger');
    updateWorkflowProgress('session', 'Kimlik bilgilerini kontrol edin');
    renderError($('#teacher-output'), error);
    return;
  }
  // Catalog fetch is outside the login try block: a catalog failure must not
  // invalidate the already-granted session (retryable Turkish error instead).
  try {
    const { body: catalog } = await apiRequest('/context');
    applyCatalog(catalog);
    announce('Oturum açıldı. Rol ve yetkileriniz sistem tarafından uygulanır.', 'success');
    // Consume pending intent after successful re-auth
    const returnRoute = state.pendingRoute;
    const returnBranch = state.pendingBranch;
    const returnDraft = state.pendingDraft;
    state.pendingRoute = '';
    state.pendingBranch = '';
    state.pendingDraft = null;
    if (returnRoute) {
      activateTab(returnRoute);
      if (returnBranch) {
        state.branchId = returnBranch;
        const branchEntry = state.branches.find((b) => b.code === returnBranch);
        state.branchLabel = branchEntry ? `${branchEntry.name} · ${branchEntry.code}` : '';
        const selector = $('#branch-id');
        if (selector) selector.value = returnBranch;
      }
      if (returnDraft) {
        if (returnDraft.start && $('#leave-start')) $('#leave-start').value = returnDraft.start;
        if (returnDraft.end && $('#leave-end')) $('#leave-end').value = returnDraft.end;
        if (returnDraft.reason && $('#leave-reason')) $('#leave-reason').value = returnDraft.reason;
      }
    }
  } catch (catalogError) {
    setStatus('Kurum bilgisi alınamadı', 'warning');
    const retryEl = $('#context-retry');
    if (retryEl) retryEl.hidden = false;
    renderError($('#teacher-output'), catalogError);
    announce('Kurum bilgisi tamamlanamadı. Lütfen tekrar deneyin.', 'warning');
  }
}

async function trySilentRefresh() {
  if (!state.refreshToken) return false;
  try {
    const { body: result } = await apiRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: state.refreshToken },
    });
    if (result?.accessToken) {
      state.accessToken = result.accessToken;
      state.refreshToken = result.refreshToken || state.refreshToken;
      return true;
    }
    return false;
  } catch (error) {
    // Network failure already showed the offline state via handleNetworkError;
    // keep tokens so the session can recover when connectivity returns.
    if (error?.status === 0) return false;
    // Actual auth rejection: clear tokens so handleAuthRequired can prompt re-auth.
    state.accessToken = '';
    state.refreshToken = '';
    return false;
  }
}

function handleAuthRequired() {
  const activeTab = document.querySelector('.tab[aria-selected="true"]');
  state.pendingRoute = activeTab?.dataset.tab || 'bugun';
  state.pendingBranch = state.branchId || '';
  const startEl = $('#leave-start');
  const endEl = $('#leave-end');
  const reasonEl = $('#leave-reason');
  if (startEl?.value || endEl?.value || reasonEl?.value) {
    state.pendingDraft = {
      start: startEl?.value || '',
      end: endEl?.value || '',
      reason: reasonEl?.value || '',
    };
  }
  state.accessToken = '';
  state.refreshToken = '';
  setStatus('Oturum sona erdi', 'warning');
  announce('Oturumunuz sona erdi. Lütfen yeniden giriş yapın; kaldığınız yerden devam edeceksiniz.', 'warning');
  updateWorkflowProgress('session', 'Yeniden giriş yapın');
}

function handleNetworkError() {
  setStatus('Bağlantı hatası', 'warning');
  announce('Bağlantı kurulamadı. Lütfen tekrar deneyin.', 'warning');
}

function logout() {
  state.accessToken = '';
  state.refreshToken = '';
  state.permissions = [];
  state.branchId = '';
  state.branchLabel = '';
  state.branches = [];
  state.rateLimitedUntil = 0;
  state.tenantId = '';
  state.pendingRoute = '';
  state.pendingBranch = '';
  state.pendingDraft = null;
  clearBranchWork();
  const institutionEl = $('#context-institution');
  if (institutionEl) institutionEl.textContent = '';
  const summaryScope = $('#summary-scope');
  if (summaryScope) summaryScope.textContent = '';
  const selector = $('#branch-id');
  if (selector) {
    selector.disabled = true;
    selector.innerHTML = '<option value="">Önce oturum açın</option>';
    selector.value = '';
  }
  const retryEl = $('#context-retry');
  if (retryEl) retryEl.hidden = true;
  updateWorkflowProgress('session', 'Çıkış yapıldı');
  setStatus('Oturum kapatıldı', 'success');
  announce('Oturum kapatıldı. Tekrar giriş yapabilirsiniz.', 'success');
  renderNavigation();
}

async function retryCatalog() {
  if (!requireSession()) return;
  if (refuseRepeatedAction()) return;
  const loaded = await loadCatalog({ announceOnSuccess: 'Kurum bilgisi güncellendi.' });
  if (loaded) setStatus('Oturum aktif', 'success');
}

async function updateContext(event) {
  event.preventDefault();
  if (!requireSession()) return;
  if (refuseRepeatedAction()) return;
  const branch = state.branches.find((entry) => entry.code === $('#branch-id').value);
  if (!branch) return announce('Şube seçin.', 'warning');
  state.branchId = '';
  state.branchLabel = '';
  clearBranchWork();
  state.date = $('#operation-date').value;
  let selection;
  try {
    selection = await apiRequest('/context/branch', {
      method: 'POST',
      body: { branchName: branch.name, branchCode: branch.code },
      notFoundUiState: 'forbidden_non_enumerating',
    });
  } catch (error) {
    updateWorkflowProgress('context', 'Şube seçimi doğrulanamadı');
    return renderError($('#queue-output'), branchSelectionOutcome(error));
  }
  applyCatalog(selection.body);
  await loadQueue();
}

// #445: sekme görünürlüğü sunucunun izin anahtarlarından türetilir. Rol
// etiketine dayanan eski ROLE_NAV haritası kaldırıldı. Eşlemeler yalnız
// KULLANIKLILIK yakınsamasıdır — gizlenen kontrol hiçbir zaman zorlama
// değildir; zorlama sunucu @Permissions guard'ındadır (API seam testi #445).
const TAB_CAPABILITIES = {
  teacher: 'leave:own:read',
  ops: 'daily_operations:read',
  program: 'schedule:draft:create',
  attendance: 'attendance:own:read',
  notifications: 'notification:draft:read',
};

// Screen modüllerin sekme aktivasyon hook'u: notifications.js
// registerTabActivationHook ile kaydolur; tek yönlü bağımlılık preserved.
const tabActivationHooks = {};

function registerTabActivationHook(name, activation) {
  tabActivationHooks[name] = activation;
}

function hasCapability(key) {
  return Boolean(key) && state.permissions.includes(key);
}

function navSectionsFor(capabilities) {
  const granted = new Set(capabilities);
  const sections = ['bugun'];
  for (const [tab, key] of Object.entries(TAB_CAPABILITIES)) {
    if (granted.has(key)) sections.push(tab);
  }
  return sections;
}

function renderNavigation() {
  const allowed = new Set(navSectionsFor(state.permissions));
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('hidden', !allowed.has(tab.dataset.tab));
  });
  document.querySelectorAll('.quick-actions button[data-section]').forEach((btn) => {
    btn.classList.toggle('hidden', !allowed.has(btn.dataset.section));
  });
  // Statik HTML kontroller: taşınan yetkinlik anahtarı yoksa gizlenir.
  // Bu bir kullanılabilirlik yakınsamasıdır; sunucu yine de tüm kararları alır.
  document.querySelectorAll('[data-requires-permission]').forEach((el) => {
    el.classList.toggle('hidden', !hasCapability(el.dataset.requiresPermission));
  });
  const current = document.querySelector('.tab[aria-selected="true"]');
  if (current && !allowed.has(current.dataset.tab)) {
    activateTab('bugun');
  }
}

function setActiveTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  });
  document.querySelectorAll('.runtime-panel').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== name));
  $('#runtime-main').focus();
  // Tab-activation hook tablosu core'a aittir; screen modüller register'a
  // kaydolur (yön: ekran → core). Delegation'ın vm harness'ta çalışmasına
  // gerek yoktur — tablo boşsa davranış core-only kalır.
  const activationHook = tabActivationHooks[name];
  if (state.accessToken && activationHook) activationHook();
}

function activateTab(name) {
  if (name !== 'bugun' && state.permissions.length && !hasCapability(TAB_CAPABILITIES[name])) {
    announce('Bu işlem için yetkiniz yok. Güvenli şekilde Bugün ekranına dönebilirsiniz.', 'warning');
    const bugunTab = document.querySelector('.tab[data-tab="bugun"]');
    if (bugunTab && !bugunTab.classList.contains('hidden')) {
      setActiveTab('bugun');
    }
    return;
  }
  setActiveTab(name);
}

async function createLeave(event) {
  event.preventDefault();
  if (!requireSession()) return;
  if (refuseRepeatedAction()) return;
  const branchId = getBranchId();
  if (!branchId) {
    updateWorkflowProgress('context', 'İzin talebi için şube seçin');
    return announce('İzin talebi için şube seçin.', 'warning');
  }
  const body = {
    branchId,
    durationType: $('#leave-duration-type').value,
    reasonCode: $('#leave-reason-code').value,
    startsAt: toIso8601($('#leave-starts-at').value),
    endsAt: toIso8601($('#leave-ends-at').value),
  };
  const target = $('#teacher-output');
  target.innerHTML = loading('İzin talebi oluşturuluyor');
  try {
    const { body: leave, etag } = await apiRequest('/leaves/me', { method: 'POST', body });
    captureLeaveVersion(leave, etag);
    state.impactCount = 0;
    state.candidateCount = 0;
    target.innerHTML = renderLeaveCard(leave, 'Kendi izin talebiniz oluşturuldu');
    announce('İzin talebi kaydedildi.', 'success');
    updateWorkflowProgress();
  } catch (error) {
    updateWorkflowProgress('leave', 'İzin talebi tamamlanamadı');
    renderError(target, error);
  }
}

async function loadOwnLeave() {
  if (!requireSession()) return;
  if (refuseRepeatedAction()) return;
  if (!state.activeLeaveId) return announce('Önce bir izin talebi seçin veya oluşturun.', 'warning');
  const target = $('#teacher-output');
  target.innerHTML = loading('Kendi izin talebi getiriliyor');
  try {
    const { body, etag } = await apiRequest(`/leaves/me/${encodeURIComponent(state.activeLeaveId)}`);
    captureLeaveVersion(body, etag);
    target.innerHTML = renderLeaveCard(body, 'Kendi izin talebiniz');
    updateWorkflowProgress();
  } catch (error) {
    renderError(target, error);
  }
}

async function loadQueue() {
  if (!requireSession()) return;
  if (refuseRepeatedAction()) return;
  const target = $('#queue-output');
  const branchId = getBranchId();
  if (!branchId) {
    updateWorkflowProgress('context', 'Günlük işler için şube seçin');
    return announce('Günlük işler için şube seçin.', 'warning');
  }
  state.date = state.date || $('#operation-date').value;
  const query = new URLSearchParams({ branchId });
  if (state.date) query.set('date', state.date);
  target.innerHTML = loading('Günlük işler getiriliyor');
  try {
    const { body } = await apiRequest(`/daily-operations/today?${query.toString()}`);
    const items = asArray(body, ['items', 'lessons', 'queue']);
    resetCountsExcept('queueCount');
    state.queueCount = items.length;
    if (items.length) {
      target.innerHTML = items.map(renderQueueItem).join('');
      announce('Günlük işler yenilendi.', 'success');
    } else {
      empty(target, 'queue');
    }
    updateWorkflowProgress();
  } catch (error) {
    updateWorkflowProgress('context', 'Günlük işler alınamadı');
    renderError(target, error);
  }
}

function renderQueueItem(item) {
  const leaveId = pick(item, ['leaveRequestId']);
  const eventId = pick(item, ['scheduleEventId', 'eventId']);
  const rawState = pick(item, ['state', 'coverageStatus', 'assignmentStatus'], 'unknown');
  const stateLabel = displayStatus(rawState);
  return `<article class="card queue-card">
    <h3>${escapeHtml(pick(item, ['courseLabel', 'title'], 'Ders'))}</h3>
    <p class="card-meta">
      <span>${escapeHtml(pick(item, ['occurrenceDate', 'date'], 'Tarih bekleniyor'))}</span>
      <span>${escapeHtml(pick(item, ['timeRange', 'time'], 'Saat bekleniyor'))}</span>
      <span>${escapeHtml(pick(item, ['studentGroupLabel', 'groupLabel'], 'Sınıf bekleniyor'))}</span>
      <span>${escapeHtml(pick(item, ['roomLabel'], 'Derslik bekleniyor'))}</span>
    </p>
    <span class="tag" data-tone="${escapeHtml(statusTone(rawState))}">${escapeHtml(stateLabel)}</span>
    ${canRequest('GET', `/daily-operations/leaves/${encodeURIComponent(leaveId)}/impact`)
      ? `<button type="button" data-action="impact" data-leave-id="${escapeHtml(leaveId)}" data-event-id="${escapeHtml(eventId)}" data-course-label="${escapeHtml(pick(item, ['courseLabel', 'title'], 'Ders'))}">Bu dersin etkisini incele</button>`
      : '<p class="hint">Ders durumu listeleniyor; etki analizi yetkiniz kapsamında değil.</p>'}
  </article>`;
}

async function loadImpact(leaveId, eventId, courseLabel = '') {
  if (!requireSession()) return;
  if (refuseRepeatedAction()) return;
  state.activeLeaveId = leaveId || state.activeLeaveId;
  state.activeScheduleEventId = eventId || state.activeScheduleEventId;
  state.activeLessonLabel = courseLabel || state.activeLessonLabel;
  updateWorkflowProgress();
  const target = $('#impact-output');
  if (!state.activeLeaveId) {
    updateWorkflowProgress('leave', 'Önce izin talebi seçin');
    return announce('Etki analizi için izin talebi seçin.', 'warning');
  }
  target.innerHTML = loading('İzin etkisi getiriliyor');
  try {
    const { body, etag } = await apiRequest(`/daily-operations/leaves/${encodeURIComponent(state.activeLeaveId)}/impact`);
    captureLeaveVersion(body, etag);
    const events = asArray(body, ['events', 'affectedLessons', 'lessons', 'items']);
    resetCountsExcept('impactCount');
    state.impactCount = events.length;
    if (!state.activeScheduleEventId && events[0]) state.activeScheduleEventId = eventIdentity(events[0]);
    updateAssignmentStateFromEvents(events);
    if (events.length) {
      target.innerHTML = renderImpact(body, events);
    } else {
      empty(target, 'impact');
    }
    updateWorkflowProgress();
  } catch (error) {
    updateWorkflowProgress('impact', 'Etki analizi alınamadı');
    renderError(target, error);
  }
}

function eventIdentity(event) {
  return pick(event, ['scheduleEventId', 'eventId', 'id']);
}

function updateAssignmentStateFromEvents(events) {
  const activeEvent = events.find((event) => eventIdentity(event) === state.activeScheduleEventId) || events.find((event) => pick(event, ['substituteAssignmentId']));
  if (!activeEvent) return;
  state.activeScheduleEventId = eventIdentity(activeEvent) || state.activeScheduleEventId;
  state.activeAssignmentId = pick(activeEvent, ['substituteAssignmentId'], '');
  state.activeLessonLabel = pick(activeEvent, ['courseLabel', 'title'], state.activeLessonLabel);
}

function renderImpact(body, events) {
  const rows = events.map((event) => `<li>
    <strong>${escapeHtml(pick(event, ['courseLabel'], 'Ders'))}</strong>
    <span>${escapeHtml(pick(event, ['occurrenceDate'], ''))} ${escapeHtml(pick(event, ['timeRange'], ''))}</span>
    <span class="tag" data-tone="${escapeHtml(statusTone(pick(event, ['state', 'assignmentStatus', 'coverageStatus'], 'open')))}">${escapeHtml(displayStatus(pick(event, ['state', 'assignmentStatus', 'coverageStatus'], 'open')))}</span>
    ${canRequest('GET', `/daily-operations/leaves/${encodeURIComponent(state.activeLeaveId)}/events/${encodeURIComponent(eventIdentity(event))}/candidates`)
      ? `<button type="button" data-action="candidates" data-event-id="${escapeHtml(eventIdentity(event))}" data-course-label="${escapeHtml(pick(event, ['courseLabel'], 'Ders'))}">Adayları getir ve bu dersi planla</button>`
      : ''}
  </li>`).join('');
  return `<div class="summary"><b>Ders karşılığı:</b> ${escapeHtml(displayStatus(pick(body, ['coverageStatus'], 'unknown')))} · ${events.length} ders etkileniyor</div>
    <ul class="impact-list">${rows}</ul>`;
}

async function loadCandidates(eventId, courseLabel = '') {
  if (!requireSession()) return;
  if (refuseRepeatedAction()) return;
  state.activeScheduleEventId = eventId || state.activeScheduleEventId;
  state.activeLessonLabel = courseLabel || state.activeLessonLabel;
  updateWorkflowProgress();
  const target = $('#candidate-output');
  if (!state.activeLeaveId || !state.activeScheduleEventId) {
    updateWorkflowProgress('impact', 'Etkilenen dersi seçin');
    return announce('Aday listesi için etkilenen dersi seçin.', 'warning');
  }
  target.innerHTML = loading('Adaylar getiriliyor');
  try {
    const { body } = await apiRequest(`/daily-operations/leaves/${encodeURIComponent(state.activeLeaveId)}/events/${encodeURIComponent(state.activeScheduleEventId)}/candidates`);
    if (body?.eligibilityFinalized !== true) {
      updateWorkflowProgress('assignment', 'Uygunluk kaynağı bekleniyor');
      return renderRegionState(target, 'eligibility_not_ready');
    }
    const candidates = asArray(body, ['candidates', 'items']);
    resetCountsExcept('candidateCount');
    state.candidateCount = candidates.length;
    if (candidates.length) {
      target.innerHTML = candidates.map(renderCandidate).join('');
    } else {
      empty(target, 'candidates');
    }
    updateWorkflowProgress();
  } catch (error) {
    updateWorkflowProgress('assignment', 'Aday listesi alınamadı');
    renderError(target, error);
  }
}

function renderCandidate(candidate) {
  const teacherId = pick(candidate, ['teacherId', 'candidateId']);
  const availability = String(pick(candidate, ['availabilityStatus'], '')).toLowerCase();
  // Contract only returns already-filtered eligible candidates (no
  // availabilityStatus field). Absent availability means the backend has
  // already resolved conflicts — treat as available. Only explicit busy
  // statuses block selection.
  const available = !availability || availability === 'available' || availability === 'free' || availability === 'musait';
  const eligible = Boolean(pick(candidate, ['courseEligible', 'eligible'], false));
  const selectable = eligible && available;
  const disabled = !selectable || !state.activeLeaveEtag || mutationDisabled();
  const eligibleText = eligible ? 'Bu dersi verebilir' : 'Bu dersi veremez';
  const availableText = available ? 'Bu saat müsait' : 'Bu saat meşgul';
  // Görevlendirme istikameti tek yetkinlik anahtarına bağlı (#445);
  // yalnız-okur aktörde düğmeler yerine dürüst bir bağlam ipucu çizilir.
  const canSubstitute = canRequest('POST', `/daily-operations/leaves/${encodeURIComponent(state.activeLeaveId)}/events/${encodeURIComponent(state.activeScheduleEventId)}/substitution`);
  return `<article class="card candidate">
    <h3>${escapeHtml(pick(candidate, ['displayName', 'name'], 'Aday öğretmen'))}</h3>
    <p>${eligibleText} · ${availableText}</p>
    <span class="tag" data-tone="${selectable ? 'success' : 'danger'}">${selectable ? 'Seçilebilir aday' : eligible ? 'Şu an seçilemez' : 'Seçilemez aday'}</span>
    ${canSubstitute
      ? `<button type="button" data-action="assign" data-teacher-id="${escapeHtml(teacherId)}" ${disabled ? 'disabled aria-describedby="etag-help"' : ''}>Bu öğretmeni görevlendir</button>
    <button type="button" data-action="clear" ${state.activeAssignmentId && state.activeLeaveEtag && !mutationDisabled() ? '' : 'disabled'}>Görevlendirmeyi temizle</button>`
      : '<p class="hint">Aday bağlamı görüntüleniyor; görevlendirme yetkiniz kapsamında değil.</p>'}
  </article>`;
}

/**
 * Aday kartındaki "temizle" eylemini güncel görevlendirme durumuyla eşitler.
 * `renderCandidate` yalnız render anındaki `state` değerini yansıttığı için
 * başarılı assign sonrası kart yeniden çizilmeden eylem kilitli kalırdı;
 * sunucu-otoriter sonucu UI'ya burada yansıtırız (ve temizleme sonrası kilitler).
 */
function syncCandidateAssignmentActions() {
  const enabled = Boolean(state.activeAssignmentId && state.activeLeaveEtag) && !mutationDisabled();
  document
    .querySelectorAll('#candidate-output button[data-action="clear"]')
    .forEach((button) => {
      button.disabled = !enabled;
    });
}

async function createAssignment(teacherId) {
  if (!state.activeLeaveEtag) return announce('Güncel izin kaydı alınmadan görevlendirme yapılamaz.', 'warning');
  if (refuseRepeatedAction()) return;
  const target = $('#candidate-output');
  try {
    const { body, etag } = await apiRequest(`/daily-operations/leaves/${encodeURIComponent(state.activeLeaveId)}/events/${encodeURIComponent(state.activeScheduleEventId)}/substitution`, {
      method: 'POST',
      headers: { 'If-Match': state.activeLeaveEtag },
      body: { substituteTeacherId: teacherId },
      versioned: true,
    });
    captureLeaveVersion(body, etag);
    updateAssignmentStateFromEvents(asArray(body, ['events', 'affectedLessons', 'lessons', 'items']));
    if (!state.activeAssignmentId) state.activeAssignmentId = 'server-confirmed';
    syncCandidateAssignmentActions();
    announce('Görevlendirme kaydedildi; günlük işler ve etki listesi yenileniyor.', 'success');
    updateWorkflowProgress();
    await loadImpact(state.activeLeaveId, state.activeScheduleEventId);
    await loadQueue();
  } catch (error) {
    renderError(target, error);
  }
}

async function clearAssignment() {
  if (!state.activeLeaveEtag) return announce('Güncel izin kaydı alınmadan görevlendirme temizlenemez.', 'warning');
  if (refuseRepeatedAction()) return;
  const target = $('#candidate-output');
  try {
    const { body, etag } = await apiRequest(`/daily-operations/leaves/${encodeURIComponent(state.activeLeaveId)}/events/${encodeURIComponent(state.activeScheduleEventId)}/substitution`, {
      method: 'DELETE',
      headers: { 'If-Match': state.activeLeaveEtag },
      versioned: true,
    });
    captureLeaveVersion(body, etag);
    updateAssignmentStateFromEvents(asArray(body, ['events', 'affectedLessons', 'lessons', 'items']));
    state.activeAssignmentId = '';
    syncCandidateAssignmentActions();
    announce('Görevlendirme temizlendi; günlük işler ve etki listesi yenileniyor.', 'success');
    updateWorkflowProgress();
    await loadImpact(state.activeLeaveId, state.activeScheduleEventId);
    await loadQueue();
  } catch (error) {
    renderError(target, error);
  }
}

function formatStamp(value) {
  if (!value) return 'Zaman bilgisi yok';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('tr-TR');
}

function captureLeaveVersion(body, etag) {
  state.activeLeaveId = pick(body, ['leaveRequestId', 'leaveId', 'id'], state.activeLeaveId);
  state.activeLeaveEtag = pick(body, ['leaveEtag', 'etag'], etag || state.activeLeaveEtag);
}

function renderLeaveCard(leave, title) {
  return `<article class="card">
    <h3>${escapeHtml(title)}</h3>
    <p>Durum: ${escapeHtml(displayStatus(pick(leave, ['status'], 'unknown')))}</p>
    <p>Karar: ${escapeHtml(displayStatus(pick(leave, ['decisionStatus'], 'unknown')))} · Ders karşılığı: ${escapeHtml(displayStatus(pick(leave, ['coverageStatus'], 'unknown')))}</p>
    <p>Güncellik: ${state.activeLeaveEtag ? 'Güncel kayıt alındı' : 'Güncel kayıt bekleniyor'}</p>
  </article>`;
}

function termKey(value, fallback = 'unknown') {
  const key = String(value ?? fallback).trim().toLowerCase();
  return key || fallback;
}

function displayStatus(value) {
  return statusLabels[termKey(value)] || statusLabels.unknown;
}

function statusTone(value) {
  return statusTones[termKey(value)] || 'neutral';
}

/**
 * #446 — kullanıcıya gösterilen her terim haritalıdır. Haritada olmayan bir
 * değer asla kendi kodunu yansıtmaz: nötr bir metne düşer, tanılama için
 * ham değer data-* özniteliğinde kalır.
 */
const leaveReasonLabels = {
  annual_leave: 'Yıllık izin',
  administrative: 'İdari izin',
  health: 'Sağlık izni',
  other: 'Diğer izin',
};
const leaveDurationLabels = {
  hourly: 'Saatlik',
  full_day: 'Tam gün',
  multi_day: 'Çok günlü',
};
const consentTypeLabels = {
  parent_notification: 'Veli bilgilendirmesi',
  sms_notification: 'SMS bilgilendirmesi',
  whatsapp_notification: 'WhatsApp bilgilendirmesi',
  email_notification: 'E-posta bilgilendirmesi',
};
const consentSubjectLabels = {
  student: 'Öğrenci',
  parent: 'Veli',
  teacher: 'Öğretmen',
  user: 'Kullanıcı',
};
const notificationEventLabels = {
  'attendance.absent.locked': 'Devamsızlık bildirimi',
  'schedule.published': 'Program yayınlandı',
  'schedule.unpublished': 'Program yayından kaldırıldı',
  'schedule.publish_denied': 'Program yayınlanamadı',
};
const notificationChannelLabels = {
  sms: 'SMS',
  email: 'E-posta',
  whatsapp: 'WhatsApp',
};
const notificationReasonLabels = {
  blocked_consent: 'Onay eksik olduğu için bekletildi',
  blocked_channel_consent: 'Kanal onayı eksik olduğu için bekletildi',
};
const receiptOutcomeLabels = {
  provider_accepted: 'Sağlayıcı kabul etti',
  provider_delivered: 'Sağlayıcı teslim etti',
  provider_rejected: 'Sağlayıcı reddetti',
  uncertain: 'Sonuç belersiz',
};
const scheduleReasonLabels = {
  TEACHER_TIME_OVERLAP: 'Öğretmenin aynı saatte başka dersi var',
  STUDENT_GROUP_TIME_OVERLAP: 'Sınıfın aynı saatte başka dersi var',
  ROOM_TIME_OVERLAP: 'Derslik aynı saatte başka ders için ayrılmış',
  TIMESLOT_INACTIVE: 'Ders saati aktif değil',
  TEACHER_INACTIVE: 'Öğretmen aktif değil',
  STUDENT_GROUP_INACTIVE: 'Sınıf aktif değil',
  TEACHER_BRANCH_ASSIGNMENT_MISSING: 'Öğretmenin bu şubeye görevlendirmesi yok',
  TEACHER_COURSE_MISMATCH: 'Öğretmen bu dersi veremiyor',
  TENANT_REFERENCE_MISMATCH: 'İlgili kayıt bulunamadı',
  BRANCH_REFERENCE_MISMATCH: 'İlgili kayıt bulunamadı',
  PUBLISHED_SCHEDULE_IMMUTABLE: 'Yayınlanmış program değiştirilemez',
  SCHEDULE_EMPTY: 'Programda ders yok',
  SCHEDULE_VALIDATION_STALE: 'Doğrulama eskidi',
  SCHEDULE_HARD_CONFLICTS_PRESENT: 'Çözülmesi gereken çakışmalar var',
  PUBLISHED_SCHEDULE_PERIOD_CONFLICT: 'Aynı dönemde yayınlanmış başka bir program var',
  SCHEDULE_VERSION_MISMATCH: 'Kayıt güncellendi',
  SCHEDULE_VERSION_REQUIRED: 'Güncel kayıt bekleniyor',
};

function displayTerm(labels, value, fallback) {
  const raw = String(value ?? '').trim();
  return labels[raw] || labels[termKey(raw, '')] || fallback;
}

function resetCountsExcept(...keep) {
    const all = ['queueCount', 'impactCount', 'candidateCount'];
    for (const key of all) {
      if (!keep.includes(key)) state[key] = 0;
    }
  }

  const loading = (text) => `<div class="loading" role="status">${escapeHtml(text)}...</div>`;

const EMPTY_COPY = {
  queue: {
    title: 'Günlük iş listesi boş',
    message: 'Bu kapsamda açık ders yok. Şube veya tarih değiştirip yeniden deneyin.',
  },
  candidates: {
    title: 'Aday listesi boş',
    message: 'Bu ders için uygun aday yok. Farklı bir ders veya kapsam seçip yeniden deneyin.',
  },
  leaves: {
    title: 'İzin talebi yok',
    message: 'Bu kapsamda izin talebi yok.',
  },
  consents: {
    title: 'Onay kaydı yok',
    message: 'Bu kapsamda onay kaydı yok.',
  },
  notifications: {
    title: 'Bildirim yok',
    message: 'Bu kapsamda bildirim yok.',
  },
  attendance: {
    title: 'Yoklama oturumu yok',
    message: 'Bu kapsamda yoklama oturumu yok.',
  },
  impact: {
    title: 'Etki yok',
    message: 'Bu izin için etkilenen ders yok.',
  },
  schedule: {
    title: 'Çizelge yok',
    message: 'Henüz çizelge oluşturulmadı.',
  },
};

const empty = (target, key) => {
  const copy = EMPTY_COPY[key];
  if (!copy) return;
  renderRegionState(target, 'same_scope_empty', copy.message, copy.title);
};

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.classList.contains('tab')) activateTab(target.dataset.tab);
  if (target.dataset.action === 'focus-teacher') activateTab('teacher');
  if (target.dataset.action === 'focus-ops') activateTab('ops');
  if (target.dataset.action === 'impact') loadImpact(target.dataset.leaveId, target.dataset.eventId, target.dataset.courseLabel);
  if (target.dataset.action === 'candidates') loadCandidates(target.dataset.eventId, target.dataset.courseLabel);
  if (target.dataset.action === 'assign') createAssignment(target.dataset.teacherId);
  if (target.dataset.action === 'clear') clearAssignment();
  if (target.dataset.action === 'logout') logout();
  // Screen-module actions (notifications, leave decisions, consents,
  // schedule, attendance) are delegated in their own modules.
});

$('#login-form').addEventListener('submit', login);
$('#context-form').addEventListener('submit', updateContext);
$('#context-retry').addEventListener('click', retryCatalog);
$('#leave-form').addEventListener('submit', createLeave);
$('#load-own-leave').addEventListener('click', loadOwnLeave);
$('#refresh-queue').addEventListener('click', loadQueue);
renderNavigation();
updateWorkflowProgress();
