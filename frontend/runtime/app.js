'use strict';

const API_ROOT = '/api/v1';
const state = {
  accessToken: '',
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
  activeNotificationId: '',
  activeNotificationVersion: 0,
  scheduleId: '',
  scheduleRevision: 0,
  scheduleEvents: [],
  activeAttendanceSessionId: '',
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
  CLAIM_ACTIVE: ['conflict_blocking', 'Bu bildirim şu anda gönderiliyor; kısa süre sonra yenileyin.'],
  BACKOFF_ACTIVE: ['conflict_blocking', 'Yeniden deneme beklemede; biraz sonra tekrar deneyin.'],
  NOT_DISPATCHABLE: ['locked_state', 'Bu durumda gönderim eylemi uygulanamaz; kayıt durumunu yenileyin.'],
  CLAIM_LOST: ['conflict_blocking', 'Kayıt başka bir işlemle değişti; listeyi yenileyin.'],
  NOTIFICATION_NOT_FOUND: ['empty_or_not_found_same_scope', 'Bildirim bulunamadı veya kapsamınız dışında.'],
  NOTIFICATION_OUTBOX_SCOPE_REQUIRED: ['branch_context_required', 'Bildirim işlemi için şube bağlamı gerekli.'],
  NOTIFICATION_STATUS_FILTER_INVALID: ['validation_error', 'Durum filtresi geçersiz.'],
  'CONSENT NOT IN AN APPROVED STATE': ['conflict_blocking', 'Onay zaten kapalı veya geçersiz durumda; işlem yapılamaz.'],
  'NOTIFICATION DRAFT BULK VERSION CONFLICT': ['stale_version', 'Liste güncellendi; yenileyip tekrar deneyin.'],
  CONSENT_SUBJECT_TYPE_INVALID: ['validation_error', 'Onay özne türü geçersiz.'],
  CONSENT_REVOKE_BODY_REQUIRED: ['validation_error', 'Onay geri çekme bilgileri eksik.'],
  ATTENDANCE_SESSION_CONFLICT: ['conflict_blocking', 'Oturum kilitli; kontrollü düzeltme akışı gerekir.'],
  ATTENDANCE_OPTIMISTIC_CONFLICT: ['stale_version', 'Oturum güncellendi; yenileyip tekrar deneyin.'],
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
  blocked_consent: 'Onay engelli',
  dispatched: 'Gönderildi',
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

async function apiRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
  if (state.branchId && !path.startsWith('/context') && !path.startsWith('/auth/')) {
    headers['x-branch-code'] = state.branchId;
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_ROOT}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
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
  state.scheduleId = '';
  state.scheduleRevision = 0;
  state.scheduleEvents = [];
  state.activeAttendanceSessionId = '';
  for (const id of ['#teacher-output', '#queue-output', '#impact-output', '#candidate-output', '#leaves-output', '#consents-output', '#bulk-approve-output', '#schedule-status', '#schedule-events', '#attendance-sessions', '#attendance-detail']) {
    $(id).innerHTML = '';
  }
}

function applyCatalog(catalog) {
  state.branches = asArray(catalog, ['branches']);
  const selector = $('#branch-id');
  selector.innerHTML = '<option value="">Şube seçin</option>' + state.branches.map((branch) =>
    `<option value="${escapeHtml(branch.code)}">${escapeHtml(branch.name)} · ${escapeHtml(branch.code)}</option>`).join('');
  selector.disabled = !state.branches.length;
  state.branchId = catalog.activeBranch?.code || '';
  state.branchLabel = catalog.activeBranch ? `${catalog.activeBranch.name} · ${catalog.activeBranch.code}` : '';
  selector.value = state.branchId;
  updateWorkflowProgress();
}

function toIso8601(value) {
  return new Date(value).toISOString();
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
  const body = {
    email: $('#email').value.trim(),
    password: $('#password').value,
  };
  const tenantId = $('#tenant-id').value.trim();
  if (tenantId) body.tenantId = tenantId;
  try {
    const { body: result } = await apiRequest('/auth/login', { method: 'POST', body });
    state.accessToken = result.accessToken || '';
    state.tenantId = tenantId;
    setStatus(state.accessToken ? 'Oturum aktif' : 'Token alınamadı', state.accessToken ? 'success' : 'warning');
    updateWorkflowProgress();
    const { body: catalog } = await apiRequest('/context');
    applyCatalog(catalog);
    // Başarı bildirimi ancak katalog uygulandıktan sonra yayınlanır; aksi halde
    // şube seçimi yapılmaya hazır görünürken applyCatalog seçimi sıfırlar.
    announce('Oturum açıldı. Rol ve yetkileriniz sistem tarafından uygulanır.', 'success');
  } catch (error) {
    state.accessToken = '';
    setStatus('Oturum başarısız', 'danger');
    updateWorkflowProgress('session', 'Kimlik bilgilerini kontrol edin');
    renderError($('#teacher-output'), error);
  }
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
  try {
    const { body: catalog } = await apiRequest('/context/branch', {
      method: 'POST', body: { branchName: branch.name, branchCode: branch.code },
    });
    applyCatalog(catalog);
    await loadQueue();
  } catch (error) {
    updateWorkflowProgress('context', 'Şube seçimi doğrulanamadı');
    renderError($('#queue-output'), error);
  }
}

function activateTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.runtime-panel').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== name));
  $('#runtime-main').focus();
  if (name === 'notifications' && state.accessToken) loadNotifications();
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
    target.innerHTML = items.length ? items.map(renderQueueItem).join('') : empty('Aynı kapsamda açık ders bulunmuyor.');
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
    target.innerHTML = candidates.length ? candidates.map(renderCandidate).join('') : empty('Aynı scope içinde uygun aday yok.');
    updateWorkflowProgress();
  } catch (error) {
    updateWorkflowProgress('assignment', 'Aday listesi alınamadı');
    renderError(target, error);
  }
}

function renderCandidate(candidate) {
  const teacherId = pick(candidate, ['teacherId', 'candidateId']);
  const available = displayStatus(pick(candidate, ['availabilityStatus'], 'unknown'));
  const eligible = Boolean(pick(candidate, ['courseEligible', 'eligible'], false));
  const disabled = !eligible || !state.activeLeaveEtag;
  return `<article class="card candidate">
    <h3>${escapeHtml(pick(candidate, ['displayName', 'name'], 'Aday öğretmen'))}</h3>
    <p>Uygunluk: ${eligible ? 'Uygun' : 'Uygun değil'} · Durum: ${escapeHtml(available)}</p>
    <span class="tag" data-tone="${eligible ? 'success' : 'danger'}">${eligible ? 'Seçilebilir aday' : 'Seçilemez aday'}</span>
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

function renderLeaveEtag(leaveId, version) {
  return `"leave:${leaveId}:v${version}"`;
}

async function loadLeaves() {
  if (!requireSession()) return;
  const branchId = getBranchId();
  if (!branchId) return announce('İzin kararları için şube seçin.', 'warning');
  const target = $('#leaves-output');
  const query = new URLSearchParams({ branchId });
  target.innerHTML = loading('İzin talepleri getiriliyor');
  try {
    const { body } = await apiRequest(`/leaves?${query.toString()}`);
    const rows = asArray(body, ['leaves', 'items', 'requests', 'data']);
    target.innerHTML = rows.length ? rows.map(renderLeaveDecisionCard).join('') : empty('Bu kapsamda izin talebi yok.');
    announce(`${rows.length} izin talebi listelendi.`, 'success');
  } catch (error) {
    renderError(target, error);
  }
}

function renderLeaveDecisionCard(leave) {
  const leaveId = pick(leave, ['id']);
  const decision = String(pick(leave, ['decisionStatus'], 'unknown')).toLowerCase();
  const coverage = String(pick(leave, ['coverageStatus'], 'unknown')).toLowerCase();
  const pending = decision === 'pending' || decision === 'unknown';
  const etag = renderLeaveEtag(leaveId, Number(pick(leave, ['version'], 1)));
  return `<article class="card">
    <h3>İzin talebi · ${escapeHtml(displayStatus(decision))}</h3>
    <p class="card-meta">
      <span>Karşılık: ${escapeHtml(displayStatus(coverage))}</span>
      <span>${escapeHtml(pick(leave, ['reasonCode'], '-'))}</span>
      <span>${escapeHtml(formatStamp(pick(leave, ['createdAt'], '')))}</span>
    </p>
    ${pending
      ? `<div class="quick-actions">
          <button type="button" data-action="leave-decision" data-leave-id="${escapeHtml(leaveId)}" data-leave-decision="approve" data-leave-etag="${escapeHtml(etag)}">Onayla</button>
          <button type="button" data-action="leave-decision" data-leave-id="${escapeHtml(leaveId)}" data-leave-decision="reject" data-leave-etag="${escapeHtml(etag)}">Reddet</button>
        </div>`
      : '<p class="hint">Bu talebin kararı verilmiş; kayıt güncelliği listeyle birlikte tazelenir.</p>'}
  </article>`;
}

async function decideLeave(leaveId, decision, etag) {
  if (!requireSession()) return;
  const target = $('#leaves-output');
  target.innerHTML = loading('Karar sunucuda uygulanıyor');
  try {
    const { body } = await apiRequest(`/leaves/${encodeURIComponent(leaveId)}/${encodeURIComponent(decision)}`, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
    });
    const nextDecision = pick(body, ['decisionStatus'], '');
    announce(`İzin kararı tamamlandı${nextDecision ? ` · ${displayStatus(nextDecision)}` : ''}.`, 'success');
    await loadLeaves();
  } catch (error) {
    renderError(target, error);
  }
}

async function loadConsents() {
  if (!requireSession()) return;
  const target = $('#consents-output');
  target.innerHTML = loading('Onaylar getiriliyor');
  try {
    const { body } = await apiRequest('/consents');
    const rows = asArray(body, ['consents', 'items']);
    target.innerHTML = rows.length ? rows.map(renderConsentCard).join('') : empty('Bu kapsamda onay kaydı yok.');
    announce(`${rows.length} onay kaydı listelendi.`, 'success');
  } catch (error) {
    renderError(target, error);
  }
}

function renderConsentCard(row) {
  const subjectType = pick(row, ['subjectType'], 'student');
  const subjectRefId = pick(row, ['subjectRefId']);
  const consentType = pick(row, ['consentType'], '');
  const status = String(pick(row, ['status'], 'unknown')).toLowerCase();
  const revocable = status === 'approved';
  return `<article class="card">
    <h3>${escapeHtml(consentType)} · ${escapeHtml(displayStatus(status))}</h3>
    <p class="card-meta">
      <span>Özne: ${escapeHtml(subjectType)}</span>
      <span>Sürüm: ${escapeHtml(pick(row, ['version'], 0))}</span>
      <span>${escapeHtml(formatStamp(pick(row, ['createdAt'], '')))}</span>
    </p>
    ${revocable
      ? `<button type="button" data-action="consent-revoke" data-subject-ref-id="${escapeHtml(subjectRefId)}" data-subject-type="${escapeHtml(subjectType)}" data-consent-type="${escapeHtml(consentType)}">Onayı geri çek</button>`
      : '<p class="hint">Onay zaten kapalı; geri çekilecek bir kayıt yok.</p>'}
  </article>`;
}

async function revokeConsent(subjectRefId, subjectType, consentType) {
  if (!requireSession()) return;
  const target = $('#consents-output');
  target.innerHTML = loading('Onay geri çekiliyor');
  try {
    const { body } = await apiRequest('/consents/revoke', {
      method: 'POST',
      body: { subjectRefId, subjectType, consentType },
    });
    announce(`Onay geri çekildi · ${escapeHtml(pick(body, ['consentType'], consentType))} (${escapeHtml(displayStatus(pick(body, ['status'], 'revoked')))}).`, 'success');
    await loadConsents();
  } catch (error) {
    renderError(target, error);
  }
}

function groupDraftsBySession(rows) {
  const groups = new Map();
  for (const row of rows) {
    const sessionId = pick(row, ['sessionId'], '');
    const key = sessionId || 'no-session';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function renderSessionBulkAction(rows) {
  const approvable = rows.filter((row) => {
    const status = String(pick(row, ['status'], '')).toLowerCase();
    return status === 'pending' || status === 'blocked_consent';
  });
  if (!approvable.length) return '<p class="hint">Bu oturum için bekleyen onay yok.</p>';
  const expectedVersions = approvable.map((row) => ({
    id: pick(row, ['id']),
    version: Number(pick(row, ['version'], 0)),
  }));
  return `<button type="button" data-action="bulk-approve-session" data-session-id="${escapeHtml(pick(approvable[0], ['sessionId'], ''))}" data-versions="${escapeHtml(encodeURIComponent(JSON.stringify(expectedVersions)))}">Bu oturumun ${approvable.length} taslağını toplu onayla</button>`;
}

async function bulkApproveSession(sessionId, versionsCsv) {
  if (!requireSession()) return;
  let expectedVersions;
  try {
    expectedVersions = JSON.parse(decodeURIComponent(versionsCsv));
  } catch (_error) {
    return announce('Toplu onay için sürüm bilgisi çözülemedi.', 'warning');
  }
  const target = $('#bulk-approve-output');
  target.innerHTML = loading('Toplu onay sunucuda uygulanıyor');
  try {
    await apiRequest(`/notifications/drafts/session/${encodeURIComponent(sessionId)}/approve`, {
      method: 'POST',
      body: { expectedVersions },
    });
    announce('Oturum taslakları toplu onaylandı.', 'success');
    await loadNotifications();
  } catch (error) {
    renderError(target, error);
  }
}

async function createSchedule(event) {
  event.preventDefault();
  if (!requireSession()) return;
  const branchId = getBranchId();
  const target = $('#schedule-status');
  const effectiveFrom = $('#schedule-effective-from').value;
  const effectiveTo = $('#schedule-effective-to').value || null;
  if (!branchId || !effectiveFrom) return announce('Çizelge için şube ve geçerlilik başlangıcı gerekli.', 'warning');
  target.innerHTML = loading('Çizelge oluşturuluyor');
  try {
    const { body } = await apiRequest('/schedules', {
      method: 'POST',
      body: { branchId, effectiveFrom, effectiveTo },
    });
    state.scheduleId = pick(body, ['scheduleId', 'id'], '');
    state.scheduleRevision = Number(pick(body, ['revision', 'versionNo', 'revisionNo'], 1)) || 1;
    state.scheduleEvents = [];
    renderScheduleStatus();
    announce('Çizelge oluşturuldu; olay satırları ekleyip taslağı kaydedin.', 'success');
  } catch (error) {
    renderError(target, error);
  }
}

function renderScheduleStatus() {
  const target = $('#schedule-status');
  target.innerHTML = `<article class="card">
    <h3>${state.scheduleId ? 'Çizelge hazır' : 'Çizelge yok'}</h3>
    <p>Kimlik: ${escapeHtml(state.scheduleId || '-')} · Revizyon: ${escapeHtml(state.scheduleRevision)}</p>
    <p>Olay sayısı: ${state.scheduleEvents.length}</p>
  </article>`;
  $('#schedule-events').innerHTML = state.scheduleEvents.length
    ? state.scheduleEvents.map(renderScheduleEventRow).join('')
    : '<p class="hint">Henüz olay satırı yok; satır ekleyip doldurun.</p>';
}

function renderScheduleEventRow(event, index) {
  const hasAllRefs = Boolean(event.teacherId && event.studentGroupId && event.courseId && event.roomId && event.timeSlotId);
  return `<article class="card" data-schedule-row="${index}">
    <h3>Olay ${index + 1} · ${escapeHtml(pick(event, ['dayOfWeek'], ''))}. gün ${escapeHtml(pick(event, ['startTime'], ''))}-${escapeHtml(pick(event, ['endTime'], ''))}</h3>
    <p class="card-meta">
      <span>${hasAllRefs ? 'Referanslar tamam' : 'Referanslar eksik'}</span>
      <span>Olay: ${escapeHtml(pick(event, ['eventId'], '-'))}</span>
    </p>
    <div class="grid-form">
      <label>Gün (0-6) <input data-schedule-field="dayOfWeek" type="number" min="0" max="6" value="${escapeHtml(pick(event, ['dayOfWeek'], 0))}" /></label>
      <label>Başlangıç <input data-schedule-field="startTime" value="${escapeHtml(pick(event, ['startTime'], ''))}" /></label>
      <label>Bitiş <input data-schedule-field="endTime" value="${escapeHtml(pick(event, ['endTime'], ''))}" /></label>
      <label>Öğretmen <input data-schedule-field="teacherId" value="${escapeHtml(event.teacherId || '')}" /></label>
      <label>Şube (öğretmen ataması UUID) <input data-schedule-field="teacherBranchId" value="${escapeHtml(event.teacherBranchId || '')}" /></label>
      <label>Öğrenci grubu <input data-schedule-field="studentGroupId" value="${escapeHtml(event.studentGroupId || '')}" /></label>
      <label>Ders <input data-schedule-field="courseId" value="${escapeHtml(event.courseId || '')}" /></label>
      <label>Derslik <input data-schedule-field="roomId" value="${escapeHtml(event.roomId || '')}" /></label>
      <label>Zaman dilimi <input data-schedule-field="timeSlotId" value="${escapeHtml(event.timeSlotId || '')}" /></label>
    </div>
    <div class="quick-actions">
      <button type="button" data-action="schedule-row-update" data-schedule-index="${index}">Satırı güncelle</button>
      <button type="button" data-action="schedule-row-remove" data-schedule-index="${index}">Satırı sil</button>
    </div>
  </article>`;
}

function addScheduleEvent() {
  if (!state.scheduleId) return announce('Önce çizelge oluşturun.', 'warning');
  const defaults = {
    eventId: crypto.randomUUID ? crypto.randomUUID() : '',
    teacherId: '',
    teacherBranchId: '',
    studentGroupId: '',
    courseId: '',
    roomId: '',
    timeSlotId: '',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '09:40',
  };
  state.scheduleEvents.push(defaults);
  renderScheduleStatus();
}

function scheduleEventsFromForm() {
  return state.scheduleEvents.map((event, index) => {
    const row = document.querySelector(`[data-schedule-row="${index}"]`);
    const read = (name) => row?.querySelector(`[data-schedule-field="${name}"]`)?.value ?? event[name];
    return {
      eventId: event.eventId || '',
      teacherId: read('teacherId') || '',
      teacherBranchId: read('teacherBranchId') || '',
      studentGroupId: read('studentGroupId') || '',
      courseId: read('courseId') || '',
      roomId: read('roomId') || '',
      timeSlotId: read('timeSlotId') || '',
      dayOfWeek: Number(read('dayOfWeek')),
      startTime: read('startTime'),
      endTime: read('endTime'),
    };
  });
}

function updateScheduleRow(index) {
  if (!state.scheduleEvents[index]) return;
  const row = document.querySelector(`[data-schedule-row="${index}"]`);
  const read = (name) => row?.querySelector(`[data-schedule-field="${name}"]`)?.value ?? state.scheduleEvents[index][name];
  state.scheduleEvents[index] = {
    ...state.scheduleEvents[index],
    teacherId: read('teacherId') || '',
    teacherBranchId: read('teacherBranchId') || '',
    studentGroupId: read('studentGroupId') || '',
    courseId: read('courseId') || '',
    roomId: read('roomId') || '',
    timeSlotId: read('timeSlotId') || '',
    dayOfWeek: Number(read('dayOfWeek')),
    startTime: read('startTime'),
    endTime: read('endTime'),
  };
  renderScheduleStatus();
}

async function saveScheduleDraft() {
  if (!requireSession()) return;
  if (!state.scheduleId) return announce('Önce çizelge oluşturun.', 'warning');
  const branchId = getBranchId();
  const events = scheduleEventsFromForm();
  state.scheduleEvents = events;
  const target = $('#schedule-status');
  target.innerHTML = loading('Taslak kaydediliyor');
  try {
    await apiRequest(`/schedules/${encodeURIComponent(state.scheduleId)}/draft`, {
      method: 'POST',
      body: { branchId, events },
    });
    state.scheduleRevision += 1;
    announce('Taslak kaydedildi.', 'success');
    renderScheduleStatus();
  } catch (error) {
    renderError(target, error);
  }
}

async function validateSchedule() {
  if (!requireSession()) return;
  if (!state.scheduleId) return announce('Önce çizelge oluşturun.', 'warning');
  const branchId = getBranchId();
  const events = scheduleEventsFromForm();
  state.scheduleEvents = events;
  const target = $('#schedule-status');
  target.innerHTML = loading('Doğrulama sunucuda çalışıyor');
  try {
    const { body } = await apiRequest(`/schedules/${encodeURIComponent(state.scheduleId)}/validate`, {
      method: 'POST',
      body: { branchId, events, revision: state.scheduleRevision },
    });
    const evidence = body && body.evidence ? body.evidence : body;
    const status = String(pick(evidence, ['status'], 'invalid')).toLowerCase();
    const canPublish = Boolean(pick(evidence, ['canPublish'], false));
    const reasons = asArray(evidence, ['reasons']);
    target.innerHTML = `<article class="card">
      <h3>Doğrulama · ${escapeHtml(displayStatus(status === 'valid' ? 'published' : 'draft'))}</h3>
      <p>Yayınlanabilir: ${canPublish ? 'Evet' : 'Hayır'} · Çakışma: ${escapeHtml(pick(evidence, ['hardConflictCount'], 0))}</p>
      ${reasons.length ? `<ul class="impact-list">${reasons.slice(0, 10).map((r) => `<li>${escapeHtml(pick(r, ['code'], '-'))}</li>`).join('')}</ul>` : ''}
    </article>`;
    announce(canPublish ? 'Doğrulama geçti; yayınlanabilir.' : 'Doğrulama engelleri var.', canPublish ? 'success' : 'warning');
  } catch (error) {
    renderError(target, error);
  }
}

async function publishSchedule() {
  if (!requireSession()) return;
  if (!state.scheduleId) return announce('Önce çizelge oluşturun.', 'warning');
  const branchId = getBranchId();
  const events = scheduleEventsFromForm();
  state.scheduleEvents = events;
  const target = $('#schedule-status');
  target.innerHTML = loading('Çizelge yayınlanıyor');
  try {
    const { body } = await apiRequest(`/schedules/${encodeURIComponent(state.scheduleId)}/publish`, {
      method: 'POST',
      body: { branchId, events, revision: state.scheduleRevision, requestId: state.requestId || `${Date.now()}` },
    });
    void body;
    announce('Çizelge yayınlandı.', 'success');
    renderScheduleStatus();
  } catch (error) {
    renderError(target, error);
  }
}

async function unpublishSchedule() {
  if (!requireSession()) return;
  if (!state.scheduleId) return announce('Önce çizelge oluşturun.', 'warning');
  const branchId = getBranchId();
  const target = $('#schedule-status');
  target.innerHTML = loading('Yayından kaldırılıyor');
  try {
    await apiRequest(`/schedules/${encodeURIComponent(state.scheduleId)}/unpublish`, {
      method: 'POST',
      body: { branchId, revision: state.scheduleRevision, requestId: state.requestId || `${Date.now()}` },
    });
    announce('Çizelge yayından kaldırıldı.', 'success');
    renderScheduleStatus();
  } catch (error) {
    renderError(target, error);
  }
}

async function generateAttendance(event) {
  event.preventDefault();
  if (!requireSession()) return;
  const branchId = getBranchId();
  const scheduleEventId = $('#attendance-event-id').value.trim();
  const rosterText = $('#attendance-student-ids').value;
  const studentIds = rosterText
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!branchId || !scheduleEventId || !studentIds.length) {
    return announce('Yoklama oturumu için ders olayı ve öğrenci listesi gerekli.', 'warning');
  }
  const target = $('#attendance-detail');
  target.innerHTML = loading('Yoklama oturumu açılıyor');
  try {
    const { body } = await apiRequest('/attendance/sessions', {
      method: 'POST',
      body: {
        scheduleEventId,
        sessionDate: $('#attendance-session-date').value || state.date || new Date().toISOString().slice(0, 10),
        studentIds,
      },
    });
    state.activeAttendanceSessionId = pick(body, ['id'], '');
    announce('Yoklama oturumu açıldı; kayıtları işaretleyin.', 'success');
    await loadAttendanceSessions();
    if (state.activeAttendanceSessionId) await openAttendanceSession(state.activeAttendanceSessionId);
  } catch (error) {
    renderError(target, error);
  }
}

async function loadAttendanceSessions() {
  if (!requireSession()) return;
  const target = $('#attendance-sessions');
  target.innerHTML = loading('Yoklama oturumları getiriliyor');
  try {
    const { body } = await apiRequest('/attendance/sessions');
    const rows = asArray(body, ['sessions', 'items']);
    target.innerHTML = rows.length ? rows.map(renderAttendanceSessionCard).join('') : empty('Bu kapsamda yoklama oturumu yok.');
  } catch (error) {
    renderError(target, error);
  }
}

function renderAttendanceSessionCard(session) {
  const sessionId = pick(session, ['id']);
  const status = String(pick(session, ['status'], 'draft')).toLowerCase();
  const roster = asArray(session, ['rosterSnapshot', 'roster']);
  return `<article class="card">
    <h3>Yoklama oturumu · ${escapeHtml(displayStatus(status))}</h3>
    <p class="card-meta">
      <span>${escapeHtml(formatStamp(pick(session, ['sessionDate'], '')))}</span>
      <span>Sürüm: ${escapeHtml(pick(session, ['version'], 0))}</span>
      <span>Öğrenci: ${roster.length}</span>
    </p>
    <button type="button" data-action="attendance-open" data-session-id="${escapeHtml(sessionId)}">Oturumu aç ve kayıtları yönet</button>
  </article>`;
}

async function openAttendanceSession(sessionId) {
  if (!requireSession()) return;
  state.activeAttendanceSessionId = sessionId || state.activeAttendanceSessionId;
  if (!state.activeAttendanceSessionId) return announce('Önce listeden bir oturum açın.', 'warning');
  const target = $('#attendance-detail');
  target.innerHTML = loading('Oturum detayı getiriliyor');
  try {
    const { body } = await apiRequest(`/attendance/sessions/${encodeURIComponent(state.activeAttendanceSessionId)}/records`);
    renderAttendanceDetail(body);
  } catch (error) {
    renderError(target, error);
  }
}

function renderAttendanceDetail(session) {
  const sessionId = pick(session, ['id']);
  const status = String(pick(session, ['status'], 'draft')).toLowerCase();
  const version = Number(pick(session, ['version'], 0));
  const roster = asArray(session, ['rosterSnapshot', 'roster']);
  const locked = status === 'locked';
  const rosterRows = roster.map((studentId, index) => `<li>
    <strong>Öğrenci ${index + 1}</strong>
    <span>${escapeHtml(String(studentId).slice(0, 8))}…</span>
    ${locked
      ? `<button type="button" data-action="attendance-correct" data-student-id="${escapeHtml(studentId)}" data-session-version="${version}">Kontrollü düzeltme</button>`
      : `<span class="quick-actions">
          ${['present', 'absent', 'late', 'excused'].map((mark) => `<button type="button" data-action="attendance-mark" data-session-id="${escapeHtml(sessionId)}" data-student-id="${escapeHtml(studentId)}" data-mark="${mark}">${escapeHtml(displayStatus(mark))}</button>`).join('')}
        </span>`}
  </li>`).join('');
  const actions = locked
    ? '<p class="hint">Oturum kilitli; kayıtlar kontrollü düzeltme (gözetim) akışıyla değişir.</p>'
    : `<button type="button" data-action="attendance-lock" data-session-id="${escapeHtml(sessionId)}" data-session-version="${version}">Oturumu kilitle ve devamsızlıkları kuyruğa al</button>`;
  $('#attendance-detail').innerHTML = `<article class="card">
    <h3>Yoklama · ${escapeHtml(displayStatus(status))} · Sürüm ${escapeHtml(version)}</h3>
    <p>Roster: ${roster.length} öğrenci</p>
    <ul class="impact-list">${rosterRows || '<li>Roster yok.</li>'}</ul>
    ${actions}
  </article>`;
}

async function markAttendance(sessionId, studentId, mark) {
  if (!requireSession()) return;
  const target = $('#attendance-detail');
  target.innerHTML = loading('Kayıt işaretleniyor');
  try {
    await apiRequest(`/attendance/sessions/${encodeURIComponent(sessionId)}/records`, {
      method: 'POST',
      body: { studentId, status: mark },
    });
    announce('Yoklama kaydı işaretlendi.', 'success');
    await openAttendanceSession(sessionId);
  } catch (error) {
    renderError(target, error);
  }
}

async function lockAttendance(sessionId, version) {
  if (!requireSession()) return;
  const target = $('#attendance-detail');
  target.innerHTML = loading('Oturum kilitleniyor');
  try {
    const { body } = await apiRequest(`/attendance/sessions/${encodeURIComponent(sessionId)}/lock`, {
      method: 'POST',
      body: { expectedVersion: Number(version) },
    });
    state.activeAttendanceSessionId = pick(body, ['id'], sessionId);
    announce('Oturum kilitlendi; devamsızlık bildirimleri kuyruğa alındı.', 'success');
    await openAttendanceSession(state.activeAttendanceSessionId);
  } catch (error) {
    renderError(target, error);
  }
}

async function correctAttendance(studentId, sessionVersion) {
  if (!requireSession()) return;
  const status = window.prompt('Düzeltme durumu (present/absent/late/excused):', 'present');
  if (!status) return;
  const reasonCode = window.prompt('Kapalı gerekçe kodu (data_entry_error / teacher_review / process_error):', 'data_entry_error');
  if (!reasonCode) return;
  const target = $('#attendance-detail');
  target.innerHTML = loading('Kontrollü düzeltme uygulanıyor');
  try {
    await apiRequest(`/attendance/sessions/${encodeURIComponent(state.activeAttendanceSessionId)}/records/${encodeURIComponent(studentId)}/correction`, {
      method: 'POST',
      body: { status, reasonCode, expectedVersion: Number(sessionVersion) },
    });
    announce('Kontrollü düzeltme tamamlandı.', 'success');
    await openAttendanceSession(state.activeAttendanceSessionId);
  } catch (error) {
    renderError(target, error);
  }
}

function formatStamp(value) {
  if (!value) return 'Zaman bilgisi yok';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('tr-TR');
}

async function loadNotifications() {
  if (!requireSession()) return;
  const branchId = getBranchId();
  if (!branchId) return announce('Bildirim listesi için şube seçin.', 'warning');
  const target = $('#notifications-list');
  const query = new URLSearchParams({ limit: '20', offset: '0' });
  const filter = $('#notification-status-filter').value;
  if (filter) query.set('status', filter);
  target.innerHTML = loading('Bildirimler getiriliyor');
  try {
    const { body } = await apiRequest(`/notifications?${query.toString()}`);
    const rows = asArray(body, ['notifications', 'items']);
    target.innerHTML = rows.length ? rows.map(renderNotificationCard).join('') : empty('Bu kapsamda bildirim yok.');
    const bulkTarget = $('#bulk-approve-output');
    const bulkActions = rows.some((row) => pick(row, ['sessionId'], ''))
      ? [...groupDraftsBySession(rows).entries()]
          .filter(([sessionId]) => sessionId !== 'no-session')
          .map(([sessionId, sessionRows]) => `<article class="card">
            <h3>Oturum ${escapeHtml(String(sessionId).slice(0, 8))}…</h3>
            ${renderSessionBulkAction(sessionRows)}
          </article>`).join('')
      : '';
    bulkTarget.innerHTML = bulkActions;
    announce(`${rows.length} bildirim listelendi.`, 'success');
  } catch (error) {
    renderError(target, error);
  }
}

function renderNotificationCard(row) {
  const status = pick(row, ['status'], 'unknown');
  return `<article class="card">
    <h3>${escapeHtml(pick(row, ['eventType'], 'Bildirim'))}</h3>
    <p class="card-meta">
      <span>Kanal: ${escapeHtml(pick(row, ['channel'], '-'))}</span>
      <span>Deneme: ${escapeHtml(pick(row, ['attempts'], 0))}</span>
      <span>${escapeHtml(formatStamp(pick(row, ['createdAt'], '')))}</span>
    </p>
    <span class="tag" data-tone="${escapeHtml(statusTone(status))}">${escapeHtml(displayStatus(status))}</span>
    <button type="button" data-action="notification-detail" data-notification-id="${escapeHtml(pick(row, ['id']))}">Detayı ve eylemleri aç</button>
  </article>`;
}

async function openNotificationDetail(id) {
  if (!requireSession()) return;
  state.activeNotificationId = id || state.activeNotificationId;
  if (!state.activeNotificationId) return announce('Önce listeden bir bildirim açın.', 'warning');
  const target = $('#notification-detail');
  target.innerHTML = loading('Bildirim detayı getiriliyor');
  try {
    const { body } = await apiRequest(`/notifications/${encodeURIComponent(state.activeNotificationId)}`);
    renderNotificationDetail(body);
  } catch (error) {
    renderError(target, error);
  }
}

function notificationActionLabel(action) {
  const labels = {
    approve: 'Taslağı onayla',
    close: 'Taslağı kapat',
    execute: 'Gönderimi yürüt',
    retry: 'Yeniden uygunluğa al',
    cancel: 'İptal et',
  };
  return labels[action] || action;
}

function renderReceiptRow(receipt) {
  const errorCode = pick(receipt, ['errorCode']);
  return `<li>
    <strong>Deneme ${escapeHtml(pick(receipt, ['attempt'], '?'))} · ${escapeHtml(pick(receipt, ['outcome'], '-'))}</strong>
    <span>${escapeHtml(formatStamp(pick(receipt, ['createdAt'], '')))}</span>
    <span>Sağlayıcı: ${escapeHtml(pick(receipt, ['providerRef'], '-'))}</span>
    <span class="tag" data-tone="${escapeHtml(pick(receipt, ['simulated'], false) ? 'neutral' : 'warning')}">${escapeHtml(pick(receipt, ['simulated'], false) ? 'simüle' : 'canlı')}</span>
    ${errorCode ? `<span class="tag" data-tone="danger">${escapeHtml(String(errorCode))}</span>` : ''}
  </li>`;
}

function renderNotificationDetail(body) {
  const row = body && body.row ? body.row : {};
  const actions = asArray(body, ['availableActions']);
  const receipts = asArray(body, ['receipts']);
  state.activeNotificationId = pick(row, ['id'], state.activeNotificationId);
  state.activeNotificationVersion = Number(pick(row, ['version'], 0));
  const status = pick(row, ['status'], 'unknown');
  const reason = pick(row, ['reason']);
  const actionButtons = actions.length
    ? actions.map((action) => `<button type="button" data-action="notification-run" data-notification-action="${escapeHtml(action)}">${escapeHtml(notificationActionLabel(action))}</button>`).join('')
    : '<p class="hint">Sunucu bu durumda izin verilen bir eylem döndürmedi.</p>';
  $('#notification-detail').innerHTML = `<article class="card">
    <h3>${escapeHtml(pick(row, ['eventType'], 'Bildirim'))} · ${escapeHtml(displayStatus(status))}</h3>
    <p class="card-meta">
      <span>Kanal: ${escapeHtml(pick(row, ['channel'], '-'))}</span>
      <span>Deneme: ${escapeHtml(pick(row, ['attempts'], 0))}</span>
      <span>Sürüm: ${escapeHtml(pick(row, ['version'], 0))}</span>
      <span>Onay sürümü: ${escapeHtml(pick(row, ['consentVersion'], '-'))}</span>
      <span>${escapeHtml(formatStamp(pick(row, ['createdAt'], '')))}</span>
    </p>
    ${reason ? `<p>Gerekçe: ${escapeHtml(String(reason))}</p>` : ''}
    <div class="quick-actions">${actionButtons}</div>
    <strong>Gönderim kanıtları</strong>
    ${receipts.length ? `<ul class="impact-list">${receipts.map(renderReceiptRow).join('')}</ul>` : '<p class="hint">Gönderim kanıtı (receipt) yok veya görüntüleme yetkiniz sınırlı.</p>'}
  </article>`;
}

async function runNotificationAction(action) {
  if (!requireSession()) return;
  const id = state.activeNotificationId;
  if (!id) return announce('Önce listeden bir bildirim açın.', 'warning');
  const target = $('#notification-detail');
  let path = `/notifications/${encodeURIComponent(id)}/${encodeURIComponent(action)}`;
  let body;
  if (action === 'approve' || action === 'close') {
    path = `/notifications/drafts/${encodeURIComponent(id)}/${encodeURIComponent(action)}`;
    body = { expectedVersion: state.activeNotificationVersion };
  }
  target.innerHTML = loading('İşlem sunucuda uygulanıyor');
  try {
    const { body: result } = await apiRequest(path, { method: 'POST', ...(body ? { body } : {}) });
    const nextStatus = pick(result, ['status'], '');
    announce(`İşlem tamamlandı${nextStatus ? ` · ${displayStatus(nextStatus)}` : ''}.`, 'success');
    await openNotificationDetail(id);
    await loadNotifications();
  } catch (error) {
    renderError(target, error);
    if (error.uiState === 'stale_version' || error.uiState === 'version_required') await openNotificationDetail(id);
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
  if (target.dataset.action === 'notification-detail') openNotificationDetail(target.dataset.notificationId);
  if (target.dataset.action === 'notification-run') runNotificationAction(target.dataset.notificationAction);
  if (target.dataset.action === 'leave-decision') decideLeave(target.dataset.leaveId, target.dataset.leaveDecision, target.dataset.leaveEtag);
  if (target.dataset.action === 'consent-revoke') revokeConsent(target.dataset.subjectRefId, target.dataset.subjectType, target.dataset.consentType);
  if (target.dataset.action === 'bulk-approve-session') bulkApproveSession(target.dataset.sessionId, target.dataset.versions);
  if (target.dataset.action === 'schedule-row-update') updateScheduleRow(Number(target.dataset.scheduleIndex));
  if (target.dataset.action === 'schedule-row-remove') {
    state.scheduleEvents.splice(Number(target.dataset.scheduleIndex), 1);
    renderScheduleStatus();
  }
  if (target.dataset.action === 'attendance-open') openAttendanceSession(target.dataset.sessionId);
  if (target.dataset.action === 'attendance-mark') markAttendance(target.dataset.sessionId, target.dataset.studentId, target.dataset.mark);
  if (target.dataset.action === 'attendance-lock') lockAttendance(target.dataset.sessionId, target.dataset.sessionVersion);
  if (target.dataset.action === 'attendance-correct') correctAttendance(target.dataset.studentId, target.dataset.sessionVersion);
});

$('#login-form').addEventListener('submit', login);
$('#context-form').addEventListener('submit', updateContext);
$('#leave-form').addEventListener('submit', createLeave);
$('#schedule-create-form').addEventListener('submit', createSchedule);
$('#attendance-generate-form').addEventListener('submit', generateAttendance);
$('#load-own-leave').addEventListener('click', loadOwnLeave);
$('#refresh-queue').addEventListener('click', loadQueue);
$('#refresh-leaves').addEventListener('click', loadLeaves);
$('#refresh-notifications').addEventListener('click', loadNotifications);
$('#apply-notification-filter').addEventListener('click', loadNotifications);
$('#refresh-consents').addEventListener('click', loadConsents);
$('#refresh-schedule-status').addEventListener('click', renderScheduleStatus);
$('#add-schedule-event').addEventListener('click', addScheduleEvent);
$('#save-schedule-draft').addEventListener('click', saveScheduleDraft);
$('#validate-schedule').addEventListener('click', validateSchedule);
$('#publish-schedule').addEventListener('click', publishSchedule);
$('#unpublish-schedule').addEventListener('click', unpublishSchedule);
$('#refresh-attendance').addEventListener('click', loadAttendanceSessions);
updateWorkflowProgress();
