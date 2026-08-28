'use strict';

const API_ROOT = '/api/v1';
const state = {
  accessToken: '',
  tenantId: '',
  branchId: '',
  date: '',
  activeLeaveId: '',
  activeScheduleEventId: '',
  activeLeaveEtag: '',
  activeAssignmentId: '',
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
  IMPACT_ANALYSIS_NOT_READY: ['impact_analysis_not_ready', 'İzin etkisi netleşmeden işlem tamamlanamaz.'],
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
  impact_analysis_not_ready: 'Etki analizi bekleniyor',
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

const $ = (selector) => document.querySelector(selector);

function setStatus(text, tone = 'neutral') {
  const el = $('#session-status');
  el.textContent = text;
  el.dataset.tone = tone;
}

function announce(message, tone = 'neutral') {
  const el = $('#message-region');
  el.innerHTML = `<div class="notice" data-tone="${tone}">${escapeHtml(message)}</div>`;
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
  </div>`;
  announce(message, 'danger');
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
    return false;
  }
  return true;
}

function getBranchId() {
  const branchId = state.branchId || $('#branch-id').value.trim();
  if (branchId) state.branchId = branchId;
  return branchId;
}

function toIso8601(value) {
  return new Date(value).toISOString();
}

async function login(event) {
  event.preventDefault();
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
    announce('Oturum açıldı. Rol ve yetkileriniz sistem tarafından uygulanır.', 'success');
  } catch (error) {
    state.accessToken = '';
    setStatus('Oturum başarısız', 'danger');
    renderError($('#teacher-output'), error);
  }
}

async function updateContext(event) {
  event.preventDefault();
  state.branchId = $('#branch-id').value.trim();
  state.date = $('#operation-date').value;
  await loadQueue();
}

function activateTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.runtime-panel').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== name));
  $('#runtime-main').focus();
}

async function createLeave(event) {
  event.preventDefault();
  if (!requireSession()) return;
  const branchId = getBranchId();
  if (!branchId) return announce('İzin talebi için şube seçin.', 'warning');
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
    target.innerHTML = renderLeaveCard(leave, 'Kendi izin talebiniz oluşturuldu');
    announce('İzin talebi kaydedildi.', 'success');
  } catch (error) {
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
  } catch (error) {
    renderError(target, error);
  }
}

async function loadQueue() {
  if (!requireSession()) return;
  const target = $('#queue-output');
  const branchId = getBranchId();
  if (!branchId) return announce('Günlük işler için şube seçin.', 'warning');
  state.date = state.date || $('#operation-date').value;
  const query = new URLSearchParams({ branchId });
  if (state.date) query.set('date', state.date);
  target.innerHTML = loading('Günlük işler getiriliyor');
  try {
    const { body } = await apiRequest(`/daily-operations/today?${query.toString()}`);
    const items = asArray(body, ['items', 'lessons', 'queue']);
    target.innerHTML = items.length ? items.map(renderQueueItem).join('') : empty('Aynı kapsamda açık ders bulunmuyor.');
    announce('Günlük işler yenilendi.', 'success');
  } catch (error) {
    renderError(target, error);
  }
}

function renderQueueItem(item) {
  const leaveId = pick(item, ['leaveRequestId']);
  const eventId = pick(item, ['scheduleEventId', 'eventId']);
  const stateLabel = displayStatus(pick(item, ['state', 'coverageStatus', 'assignmentStatus'], 'unknown'));
  return `<article class="card">
    <h3>${escapeHtml(pick(item, ['courseLabel', 'title'], 'Ders'))}</h3>
    <p>${escapeHtml(pick(item, ['occurrenceDate', 'date'], ''))} ${escapeHtml(pick(item, ['timeRange', 'time'], ''))}</p>
    <p>${escapeHtml(pick(item, ['studentGroupLabel', 'groupLabel'], ''))} · ${escapeHtml(pick(item, ['roomLabel'], ''))}</p>
    <span class="tag">${escapeHtml(stateLabel)}</span>
    <button type="button" data-action="impact" data-leave-id="${escapeHtml(leaveId)}" data-event-id="${escapeHtml(eventId)}">Etkiyi aç</button>
  </article>`;
}

async function loadImpact(leaveId, eventId) {
  if (!requireSession()) return;
  state.activeLeaveId = leaveId || state.activeLeaveId;
  state.activeScheduleEventId = eventId || state.activeScheduleEventId;
  const target = $('#impact-output');
  if (!state.activeLeaveId) return announce('Etki analizi için izin talebi seçin.', 'warning');
  target.innerHTML = loading('İzin etkisi getiriliyor');
  try {
    const { body, etag } = await apiRequest(`/daily-operations/leaves/${encodeURIComponent(state.activeLeaveId)}/impact`);
    captureLeaveVersion(body, etag);
    const events = asArray(body, ['events', 'affectedLessons', 'lessons', 'items']);
    if (!state.activeScheduleEventId && events[0]) state.activeScheduleEventId = eventIdentity(events[0]);
    updateAssignmentStateFromEvents(events);
    target.innerHTML = renderImpact(body, events);
  } catch (error) {
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
}

function renderImpact(body, events) {
  const rows = events.map((event) => `<li>
    <strong>${escapeHtml(pick(event, ['courseLabel'], 'Ders'))}</strong>
    <span>${escapeHtml(pick(event, ['occurrenceDate'], ''))} ${escapeHtml(pick(event, ['timeRange'], ''))}</span>
    <span>${escapeHtml(displayStatus(pick(event, ['state', 'assignmentStatus', 'coverageStatus'], 'open')))}</span>
    <button type="button" data-action="candidates" data-event-id="${escapeHtml(eventIdentity(event))}">Adayları getir</button>
  </li>`).join('');
  return `<div class="summary"><b>Ders karşılığı:</b> ${escapeHtml(displayStatus(pick(body, ['coverageStatus'], 'unknown')))}</div>
    <ul class="impact-list">${rows || '<li>Etki satırı yok.</li>'}</ul>`;
}

async function loadCandidates(eventId) {
  if (!requireSession()) return;
  state.activeScheduleEventId = eventId || state.activeScheduleEventId;
  const target = $('#candidate-output');
  if (!state.activeLeaveId || !state.activeScheduleEventId) return announce('Aday listesi için etkilenen dersi seçin.', 'warning');
  target.innerHTML = loading('Adaylar getiriliyor');
  try {
    const { body } = await apiRequest(`/daily-operations/leaves/${encodeURIComponent(state.activeLeaveId)}/events/${encodeURIComponent(state.activeScheduleEventId)}/candidates`);
    if (body?.eligibilityFinalized === false) return renderBlockingState(target, 'TEACHER_COURSE_ELIGIBILITY_NOT_READY');
    const candidates = asArray(body, ['candidates', 'items']);
    target.innerHTML = candidates.length ? candidates.map(renderCandidate).join('') : empty('Aynı scope içinde uygun aday yok.');
  } catch (error) {
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
    <button type="button" data-action="assign" data-teacher-id="${escapeHtml(teacherId)}" ${disabled ? 'disabled aria-describedby="etag-help"' : ''}>Görevlendir</button>
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
    announce('Görevlendirme kaydedildi; günlük işler ve etki listesi yenileniyor.', 'success');
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
    announce('Görevlendirme temizlendi; günlük işler ve etki listesi yenileniyor.', 'success');
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

const loading = (text) => `<div class="loading" role="status">${escapeHtml(text)}...</div>`;
const empty = (text) => `<div class="empty-state">${escapeHtml(text)}</div>`;

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.classList.contains('tab')) activateTab(target.dataset.tab);
  if (target.dataset.action === 'impact') loadImpact(target.dataset.leaveId, target.dataset.eventId);
  if (target.dataset.action === 'candidates') loadCandidates(target.dataset.eventId);
  if (target.dataset.action === 'assign') createAssignment(target.dataset.teacherId);
  if (target.dataset.action === 'clear') clearAssignment();
});

$('#login-form').addEventListener('submit', login);
$('#context-form').addEventListener('submit', updateContext);
$('#leave-form').addEventListener('submit', createLeave);
$('#load-own-leave').addEventListener('click', loadOwnLeave);
$('#refresh-queue').addEventListener('click', loadQueue);
