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
  authLabel: '',
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
    : `${state.queueCount} açık ders · ${state.impactCount} etki · ${state.candidateCount} aday`;
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
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
  if (state.branchId && !path.startsWith('/context') && !path.startsWith('/auth/')) {
    headers['x-branch-code'] = state.branchId;
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method: options.method || 'GET',
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
  const uiState = canonicalUiState(response, body, options);
  const mapped = SERVER_REASON_UI[serverAuthoredCode(body)];
  const copy = UI_STATES[uiState] || UI_STATES.error_retryable;
  const retryAfterHeader = response.headers?.get ? response.headers.get('retry-after') : null;
  return {
    status: response.status,
    serverCode: serverAuthoredCode(body),
    uiState,
    message: mapped?.message || copy.message,
    retryAfterSeconds: Number(retryAfterHeader) || 0,
  };
}

function canonicalStateBlock(uiState, message = '') {
  if (!uiState || !UI_STATES[uiState]) return '';
  const copy = UI_STATES[uiState];
  return `<div class="error-state" data-state="${escapeHtml(uiState)}">
    <strong>${escapeHtml(copy.title)}</strong>
    <p>${escapeHtml(message || copy.message)}</p>
    <small class="recovery-hint">${escapeHtml(copy.hint)}</small>
  </div>`;
}

function renderError(target, error) {
  const uiState = UI_STATES[error.uiState] ? error.uiState : 'error_retryable';
  const copy = UI_STATES[uiState];
  if (uiState === 'rate_limited') startRateLimitCooldown(error.retryAfterSeconds);
  target.dataset.state = uiState;
  target.innerHTML = canonicalStateBlock(uiState, error.message || copy.message);
  announce(error.message || copy.message, 'danger');
}

function startRateLimitCooldown(retryAfterSeconds) {
  const seconds = Number(retryAfterSeconds);
  state.rateLimitedUntil = Date.now() + (seconds > 0 ? seconds * 1000 : RATE_LIMIT_COOLDOWN_MS);
}

function mutationDisabled() {
  return Date.now() < state.rateLimitedUntil;
}

function renderBlockingState(target, uiState) {
  const copy = UI_STATES[uiState] || UI_STATES.error_retryable;
  target.dataset.state = uiState;
  target.innerHTML = canonicalStateBlock(uiState);
  announce(copy.message, 'warning');
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
  state.authLabel = pick(catalog?.role, ['label'], '');
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
  state.authLabel = '';
  state.branchId = '';
  state.branchLabel = '';
  state.branches = [];
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
  const loaded = await loadCatalog({ announceOnSuccess: 'Kurum bilgisi güncellendi.' });
  if (loaded) setStatus('Oturum aktif', 'success');
}

async function updateContext(event) {
  event.preventDefault();
  if (!requireSession()) return;
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
    return renderError($('#queue-output'), error);
  }
  applyCatalog(selection.body);
  await loadQueue();
}

const ROLE_NAV = {
  'Öğretmen': ['bugun', 'teacher', 'program', 'attendance'],
  'Operasyon Yöneticisi': ['bugun', 'ops', 'program', 'attendance', 'notifications'],
  'Kurum Yöneticisi': ['bugun', 'teacher', 'ops', 'program', 'attendance', 'notifications'],
};
const DEFAULT_NAV = ['bugun'];

// Screen modüllerin sekme aktivasyon hook'u: notifications.js
// registerTabActivationHook ile kaydolur; tek yönlü bağımlılık preserved.
const tabActivationHooks = {};

function registerTabActivationHook(name, activation) {
  tabActivationHooks[name] = activation;
}

function navSectionsFor(authLabel) {
  if (!authLabel) return [...DEFAULT_NAV];
  return [...(ROLE_NAV[authLabel] || DEFAULT_NAV)];
}

function renderNavigation() {
  const allowed = new Set(navSectionsFor(state.authLabel));
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('hidden', !allowed.has(tab.dataset.tab));
  });
  document.querySelectorAll('.quick-actions button[data-section]').forEach((btn) => {
    btn.classList.toggle('hidden', !allowed.has(btn.dataset.section));
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
  const allowed = new Set(navSectionsFor(state.authLabel));
  if (state.authLabel && !allowed.has(name)) {
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
    state.queueCount = items.length;
    target.innerHTML = items.length ? items.map(renderQueueItem).join('') : empty('Aynı kapsamda açık ders bulunmuyor. Şube veya tarih değiştirip yeniden deneyin.');
    announce('Günlük işler yenilendi.', 'success');
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
    <button type="button" data-action="impact" data-leave-id="${escapeHtml(leaveId)}" data-event-id="${escapeHtml(eventId)}" data-course-label="${escapeHtml(pick(item, ['courseLabel', 'title'], 'Ders'))}">Bu dersin etkisini incele</button>
  </article>`;
}

async function loadImpact(leaveId, eventId, courseLabel = '') {
  if (!requireSession()) return;
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
    state.impactCount = events.length;
    state.candidateCount = 0;
    if (!state.activeScheduleEventId && events[0]) state.activeScheduleEventId = eventIdentity(events[0]);
    updateAssignmentStateFromEvents(events);
    target.innerHTML = renderImpact(body, events);
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
    <button type="button" data-action="candidates" data-event-id="${escapeHtml(eventIdentity(event))}" data-course-label="${escapeHtml(pick(event, ['courseLabel'], 'Ders'))}">Adayları getir ve bu dersi planla</button>
  </li>`).join('');
  return `<div class="summary"><b>Ders karşılığı:</b> ${escapeHtml(displayStatus(pick(body, ['coverageStatus'], 'unknown')))} · ${events.length} ders etkileniyor</div>
    <ul class="impact-list">${rows || '<li>Etki satırı yok.</li>'}</ul>`;
}

async function loadCandidates(eventId, courseLabel = '') {
  if (!requireSession()) return;
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
    if (body?.eligibilityFinalized === false) {
      updateWorkflowProgress('assignment', 'Uygunluk kaynağı bekleniyor');
      return renderBlockingState(target, 'eligibility_not_ready');
    }
    const candidates = asArray(body, ['candidates', 'items']);
    state.candidateCount = candidates.length;
    target.innerHTML = candidates.length ? candidates.map(renderCandidate).join('') : empty('Bu ders için uygun aday bulunamadı. Farklı bir ders veya kapsam seçip yeniden deneyin.');
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
  return `<article class="card candidate">
    <h3>${escapeHtml(pick(candidate, ['displayName', 'name'], 'Aday öğretmen'))}</h3>
    <p>${eligibleText} · ${availableText}</p>
    <span class="tag" data-tone="${selectable ? 'success' : 'danger'}">${selectable ? 'Seçilebilir aday' : eligible ? 'Şu an seçilemez' : 'Seçilemez aday'}</span>
    <button type="button" data-action="assign" data-teacher-id="${escapeHtml(teacherId)}" ${disabled ? 'disabled aria-describedby="etag-help"' : ''}>Bu öğretmeni görevlendir</button>
    <button type="button" data-action="clear" ${state.activeAssignmentId && state.activeLeaveEtag && !mutationDisabled() ? '' : 'disabled'}>Görevlendirmeyi temizle</button>
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

function displayStatus(value) {
  const key = String(value || 'unknown').toLowerCase();
  return statusLabels[key] || statusLabels.unknown;
}

function statusTone(value) {
  const key = String(value || 'unknown').toLowerCase();
  return statusTones[key] || 'neutral';
}

const loading = (text) => `<div class="loading" role="status">${escapeHtml(text)}...</div>`;
const empty = (text) => `<div class="empty-state" data-state="same_scope_empty"><strong>Burada işlem yok</strong><p>${escapeHtml(text)}</p></div>`;

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
