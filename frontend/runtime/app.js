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
  lastAction: 'Henüz işlem yapılmadı.',
};

const reasonUi = {
  AUTH_REQUIRED: ['auth_required', 'Oturum yenilenmeli.'],
  TENANT_CONTEXT_REQUIRED: ['tenant_context_required', 'Kurum bağlamı doğrulanamadı.'],
  BRANCH_CONTEXT_REQUIRED: ['branch_context_required', 'Şube bağlamı doğrulanamadı.'],
  BRANCH_NOT_VISIBLE: ['forbidden_non_enumerating', 'Bu şube görüntülenemiyor.'],
  FORBIDDEN: ['forbidden_non_enumerating', 'Bu işlem için yetkiniz yok.'],
  RESOURCE_NOT_VISIBLE: ['forbidden_non_enumerating', 'Bu kayıt görüntülenemiyor.'],
  RESOURCE_NOT_FOUND_SAME_SCOPE: ['empty_or_not_found_same_scope', 'Kayıt bulunamadı veya silinmiş olabilir.'],
  VALIDATION_FAILED: ['validation_error', 'Alanları kontrol edin.'],
  LEAVE_VERSION_REQUIRED: ['version_required', 'Kayıt sürümü doğrulanmadan işlem yapılamaz.'],
  LEAVE_VERSION_MISMATCH: ['stale_version', 'Kayıt güncellendi; yenileme gerekir.'],
  TEACHER_COURSE_ELIGIBILITY_NOT_READY: ['eligibility_not_ready', 'Öğretmen-ders uygunluk kaynağı hazır değil.'],
  TEACHER_COURSE_MISMATCH: ['candidate_unavailable', 'Seçilen aday bu ders için uygun değil.'],
  SUBSTITUTE_BRANCH_ASSIGNMENT_MISSING: ['candidate_unavailable', 'Seçilen aday bu şube kapsamı için uygun değil.'],
  SUBSTITUTE_LEAVE_OVERLAP: ['conflict_blocking', 'Seçilen öğretmenin aynı zamanda onaylı izni var.'],
  SUBSTITUTE_TIME_CONFLICT: ['conflict_blocking', 'Görevlendirme mevcut program veya yedek görevle çakışıyor.'],
  ASSIGNMENT_ALREADY_EXISTS: ['locked_state', 'Bu ders için aktif görevlendirme var.'],
  ASSIGNMENT_NOT_FOUND: ['empty_or_not_found_same_scope', 'Aktif görevlendirme bulunamadı.'],
  SERVER_ERROR: ['error_retryable', 'İşlem tamamlanamadı.'],
  OFFLINE_OR_UNAVAILABLE: ['offline_or_unavailable', 'Bağlantı kurulamadı.'],
};

const GENERIC_NEST_ERRORS = new Set(['Bad Request', 'Forbidden', 'Conflict', 'Precondition Failed', 'Not Found', 'Unauthorized']);
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
  error_retryable: 'İşlem tamamlanamadı',
  offline_or_unavailable: 'Bağlantı kurulamadı',
};
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
  cancelled: 'neutral',
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
  if (!response.ok) throw normalizeApiError(response, body);
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
  const genericError = GENERIC_NEST_ERRORS.has(String(body?.error || ''));
  const errorReason = !genericError && reasonUi[body?.error] ? body.error : '';
  let reasonCode = explicitReason || messageReason || errorReason;
  if (!reasonCode) {
    if (response.status === 401) reasonCode = 'AUTH_REQUIRED';
    else if (response.status === 403) reasonCode = 'FORBIDDEN';
    else if (response.status === 404) reasonCode = 'RESOURCE_NOT_FOUND_SAME_SCOPE';
    else if (response.status === 409) reasonCode = 'SUBSTITUTE_TIME_CONFLICT';
    else if (response.status === 412) reasonCode = 'LEAVE_VERSION_MISMATCH';
    else if (response.status === 400) reasonCode = 'VALIDATION_FAILED';
    else reasonCode = 'SERVER_ERROR';
  }
  if (response.status === 403 && genericError && !messageReason) reasonCode = 'FORBIDDEN';
  if (response.status === 412) reasonCode = 'LEAVE_VERSION_MISMATCH';
  if (response.status === 409 && !reasonUi[reasonCode]) reasonCode = 'SUBSTITUTE_TIME_CONFLICT';
  const mapped = reasonUi[reasonCode] || reasonUi.SERVER_ERROR;
  const knownReasonCode = Boolean(reasonUi[reasonCode]);
  const message = knownReasonCode || GENERIC_NEST_ERRORS.has(messageText) ? mapped[1] : messageText || mapped[1];
  return { status: response.status, reasonCode, uiState: mapped[0], message };
}

function renderError(target, error) {
  const title = uiStateTitles[error.uiState] || 'İşlem tamamlanamadı';
  const message = reasonUi[error.reasonCode]?.[1] || 'İşlem tamamlanamadı.';
  target.innerHTML = `<div class="error-state" data-state="${escapeHtml(error.uiState || 'error_retryable')}">
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(message)}</p>
    <small class="recovery-hint">${escapeHtml(recoveryHint(error.uiState))}</small>
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
    offline_or_unavailable: 'Bağlantıyı kontrol edip yeniden deneyin.',
  };
  return hints[uiState] || 'Sorun devam ederse günlük işleri yenileyin.';
}

function renderBlockingState(target, reasonCode) {
  const mapped = reasonUi[reasonCode] || reasonUi.SERVER_ERROR;
  const title = uiStateTitles[mapped[0]] || 'İşlem bekliyor';
  target.innerHTML = `<div class="error-state" data-state="${escapeHtml(mapped[0])}">
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(mapped[1])}</p>
  </div>`;
  announce(mapped[1], 'warning');
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
  for (const id of ['#teacher-output', '#queue-output', '#impact-output', '#candidate-output']) {
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
  state.branchId = catalog.activeBranch?.code || '';
  state.branchLabel = catalog.activeBranch ? `${catalog.activeBranch.name} · ${catalog.activeBranch.code}` : '';
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
    announce('Oturum açıldı. Rol ve yetkileriniz sistem tarafından uygulanır.', 'success');
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
      method: 'POST', body: { branchName: branch.name, branchCode: branch.code },
    });
  } catch (error) {
    if (error && error.status === 404) {
      error = { ...error, reasonCode: 'BRANCH_NOT_VISIBLE', uiState: 'forbidden_non_enumerating' };
    }
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
      return renderBlockingState(target, 'TEACHER_COURSE_ELIGIBILITY_NOT_READY');
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
  const availability = String(pick(candidate, ['availabilityStatus'], 'unknown')).toLowerCase();
  const available = availability === 'available' || availability === 'free' || availability === 'musait';
  const eligible = Boolean(pick(candidate, ['courseEligible', 'eligible'], false));
  const selectable = eligible && available;
  const disabled = !selectable || !state.activeLeaveEtag;
  const eligibleText = eligible ? 'Bu dersi verebilir' : 'Bu dersi veremez';
  const availableText = available ? 'Bu saat müsait' : 'Bu saat meşgul';
  return `<article class="card candidate">
    <h3>${escapeHtml(pick(candidate, ['displayName', 'name'], 'Aday öğretmen'))}</h3>
    <p>${eligibleText} · ${availableText}</p>
    <span class="tag" data-tone="${selectable ? 'success' : 'danger'}">${selectable ? 'Seçilebilir aday' : eligible ? 'Şu an seçilemez' : 'Seçilemez aday'}</span>
    <button type="button" data-action="assign" data-teacher-id="${escapeHtml(teacherId)}" ${disabled ? 'disabled aria-describedby="etag-help"' : ''}>Bu öğretmeni görevlendir</button>
    <button type="button" data-action="clear" ${state.activeAssignmentId && state.activeLeaveEtag ? '' : 'disabled'}>Görevlendirmeyi temizle</button>
  </article>`;
}

async function createAssignment(teacherId) {
  if (!state.activeLeaveEtag) return announce('Güncel izin kaydı alınmadan görevlendirme yapılamaz.', 'warning');
  const target = $('#candidate-output');
  try {
    const { body, etag } = await apiRequest(`/daily-operations/leaves/${encodeURIComponent(state.activeLeaveId)}/events/${encodeURIComponent(state.activeScheduleEventId)}/substitution`, {
      method: 'POST',
      headers: { 'If-Match': state.activeLeaveEtag },
      body: { substituteTeacherId: teacherId },
    });
    captureLeaveVersion(body, etag);
    updateAssignmentStateFromEvents(asArray(body, ['events', 'affectedLessons', 'lessons', 'items']));
    if (!state.activeAssignmentId) state.activeAssignmentId = 'server-confirmed';
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
    });
    captureLeaveVersion(body, etag);
    updateAssignmentStateFromEvents(asArray(body, ['events', 'affectedLessons', 'lessons', 'items']));
    state.activeAssignmentId = '';
    announce('Görevlendirme temizlendi; günlük işler ve etki listesi yenileniyor.', 'success');
    updateWorkflowProgress();
    await loadImpact(state.activeLeaveId, state.activeScheduleEventId);
    await loadQueue();
  } catch (error) {
    renderError(target, error);
  }
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
const empty = (text) => `<div class="empty-state"><strong>Burada işlem yok</strong><p>${escapeHtml(text)}</p></div>`;

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
});

$('#login-form').addEventListener('submit', login);
$('#context-form').addEventListener('submit', updateContext);
$('#context-retry').addEventListener('click', retryCatalog);
$('#leave-form').addEventListener('submit', createLeave);
$('#load-own-leave').addEventListener('click', loadOwnLeave);
$('#refresh-queue').addEventListener('click', loadQueue);
renderNavigation();
updateWorkflowProgress();
