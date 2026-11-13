'use strict';

// #442 screen module — çizelge (schedule). Paylaşılan state, apiRequest ve
// hata normalizasyonu core'da (app.js); taslak/yayın/revizyon akışı ve
// çizelge olay satırları bu modüle aittir.

function renderScheduleStatus() {
  const target = $('#schedule-status');
  if (!state.scheduleId) {
    empty(target, 'schedule');
    $('#schedule-events').innerHTML = '';
    return;
  }
  target.innerHTML = `<article class="card">
    <h3>Çizelge hazır</h3>
    <p>Kimlik: ${escapeHtml(state.scheduleId || '-')} · Revizyon: ${escapeHtml(state.scheduleRevision)}</p>
    <p>${state.scheduleEvents.length ? `Olay sayısı: ${state.scheduleEvents.length}` : 'Olay yok'}</p>
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
      <button type="button" data-action="schedule-row-update" data-schedule-index="${index}" ${mutationDisabled() ? 'disabled' : ''}>Satırı güncelle</button>
      <button type="button" data-action="schedule-row-remove" data-schedule-index="${index}" ${mutationDisabled() ? 'disabled' : ''}>Satırı sil</button>
    </div>
  </article>`;
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
    renderConflictResolution([]);
    announce('Çizelge oluşturuldu; olay satırları ekleyip taslağı kaydedin.', 'success');
  } catch (error) {
    renderError(target, error);
  }
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
    renderConflictResolution([]);
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
      ${reasons.length ? `<ul class="impact-list">${reasons.map((r) => `<li data-schedule-reason="${escapeHtml(pick(r, ['code'], ''))}">${escapeHtml(displayTerm(scheduleReasonLabels, pick(r, ['code'], ''), 'Doğrulanamayan bir bulgu'))}</li>`).join('')}</ul>` : ''}
    </article>`;
    announce(canPublish ? 'Doğrulama geçti; yayınlanabilir.' : 'Doğrulama engelleri var.', canPublish ? 'success' : 'warning');
    renderConflictResolution(reasons);
  } catch (error) {
    renderError(target, error);
    renderConflictResolution([]);
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

function distinctValues(events, field) {
  const seen = new Set();
  const out = [];
  for (const ev of events || []) {
    const v = String(ev && ev[field] ? ev[field] : '').trim();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

function eventDayLabel(ev) {
  const dayNumber = Number(pick(ev, ['dayOfWeek'], 3));
  const n = Number.isFinite(dayNumber) ? ((Math.trunc(dayNumber) % 7) + 7) % 7 : 3;
  return ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][n];
}

function eventSlotLabel(ev) {
  return `${eventDayLabel(ev)} ${pick(ev, ['startTime'], '')}-${pick(ev, ['endTime'], '')}`;
}

function summarizeDistinctSlots(events, field, value) {
  const slots = [];
  for (const ev of events || []) {
    if (String(ev && ev[field] ? ev[field] : '').trim() !== value) continue;
    const label = eventSlotLabel(ev);
    if (slots.includes(label)) continue;
    slots.push(label);
    if (slots.length >= 2) break;
  }
  if (!slots.length) return 'Ders';
  const rest = (events || []).filter((ev) => String(ev && ev[field] ? ev[field] : '').trim() === value).length - slots.length;
  return `${slots.join(' · ')}${rest > 0 ? ` (+${rest} ders)` : ''}`;
}

function populateProgramFilters() {
  const events = state.scheduleEvents || [];
  const branchSel = $('#branch-filter');
  const teacherSel = $('#teacher-filter');
  const roomSel = $('#room-filter');
  if (branchSel) {
    const prev = branchSel.value;
    branchSel.innerHTML = '<option value="">Tüm sınıflar</option>' + distinctValues(events, 'studentGroupId').map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(summarizeDistinctSlots(events, 'studentGroupId', v))}</option>`).join('');
    if (prev) branchSel.value = prev;
  }
  if (teacherSel) {
    const prev = teacherSel.value;
    teacherSel.innerHTML = '<option value="">Tüm öğretmenler</option>' + distinctValues(events, 'teacherId').map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(summarizeDistinctSlots(events, 'teacherId', v))}</option>`).join('');
    if (prev) teacherSel.value = prev;
  }
  if (roomSel) {
    const prev = roomSel.value;
    roomSel.innerHTML = '<option value="">Tüm derslikler</option>' + distinctValues(events, 'roomId').map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(summarizeDistinctSlots(events, 'roomId', v))}</option>`).join('');
    if (prev) roomSel.value = prev;
  }
}

function currentProgramFilters() {
  return {
    classCode: String($('#branch-filter')?.value || '').trim(),
    teacherId: String($('#teacher-filter')?.value || '').trim(),
    roomCode: String($('#room-filter')?.value || '').trim(),
  };
}

function filterEvents(events) {
  const f = currentProgramFilters();
  return (events || []).filter((ev) => {
    if (f.classCode && String(ev.studentGroupId || '').trim() !== f.classCode) return false;
    if (f.teacherId && String(ev.teacherId || '').trim() !== f.teacherId) return false;
    if (f.roomCode && String(ev.roomId || '').trim() !== f.roomCode) return false;
    return true;
  });
}

function renderLessonCards() {
  const target = $('#lesson-cards');
  if (!target) return;
  const filtered = filterEvents(state.scheduleEvents || []);
  if (!filtered.length) {
    empty(target, 'schedule');
    return;
  }
  target.innerHTML = filtered.map((ev, i) => {
    const dayLabel = eventDayLabel(ev);
    const refCount = [ev.teacherId, ev.studentGroupId, ev.roomId].filter(Boolean).length;
    const refNote = refCount ? `${refCount} referans atandı` : 'Referans atanmamış';
    return `<article class="card" data-lesson-card="${i}">
    <h3>${escapeHtml(dayLabel)} ${escapeHtml(pick(ev, ['startTime'], ''))}-${escapeHtml(pick(ev, ['endTime'], ''))}</h3>
    <p class="card-meta">
      <span>${escapeHtml(refNote)}</span>
      <span data-lesson-teacher="${escapeHtml(ev.teacherId || '')}"></span>
      <span data-lesson-group="${escapeHtml(ev.studentGroupId || '')}"></span>
      <span data-lesson-room="${escapeHtml(ev.roomId || '')}"></span>
    </p>
    <p class="hint">Kayıt ayrıntısı program düzenleyicidedir.</p>
  </article>`;
  }).join('');
}

function renderConflictResolution(reasons) {
  const target = $('#schedule-conflicts');
  if (!target) return;
  const list = Array.isArray(reasons) ? reasons : [];
  if (!list.length) {
    target.innerHTML = '';
    return;
  }
  target.innerHTML = `<article class="card">
    <h3>Çakışma çözümü (otomatik çözücü devre dışı)</h3>
    <p class="hint">Çakışmalar elle çözülür: etkilenen dersi düzenleyip aday öğretmen/derslik/saat seçin.</p>
    <ul class="impact-list">
      ${list.map((r) => {
        const code = pick(r, ['code'], '');
        const label = displayTerm(scheduleReasonLabels, code, 'Çözülmesi gereken bir bulgu');
        const eventId = pick(r, ['eventId'], '');
        const idx = eventId
          ? state.scheduleEvents.findIndex((ev) => String(ev && ev.eventId ? ev.eventId : '') === String(eventId))
          : -1;
        return `<li data-schedule-reason="${escapeHtml(code)}">
          <span>${escapeHtml(label)}</span>
          ${idx >= 0
            ? `<button type="button" data-action="schedule-conflict-edit" data-conflict-index="${idx}">Düzenle</button>`
            : ''}
        </li>`;
      }).join('')}
    </ul>
  </article>`;
}

// wrap renderScheduleStatus to also populate filters + lesson cards
const _originalRenderScheduleStatus = renderScheduleStatus;
renderScheduleStatus = function() {
  _originalRenderScheduleStatus();
  try { populateProgramFilters(); } catch (e) { /* noop */ }
  try { renderLessonCards(); } catch (e) { /* noop */ }
};

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.action === 'schedule-row-update') updateScheduleRow(Number(target.dataset.scheduleIndex));
  if (target.dataset.action === 'schedule-row-remove') {
    state.scheduleEvents.splice(Number(target.dataset.scheduleIndex), 1);
    renderScheduleStatus();
  }
  if (target.dataset.action === 'schedule-conflict-edit') {
    const idx = Number(target.dataset.conflictIndex);
    const row = document.querySelector(`[data-schedule-row="${idx}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

// filter wiring
['branch-filter', 'teacher-filter', 'room-filter'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => { renderLessonCards(); });
});

$('#schedule-create-form').addEventListener('submit', createSchedule);
$('#refresh-schedule-status').addEventListener('click', renderScheduleStatus);
$('#add-schedule-event').addEventListener('click', addScheduleEvent);
$('#save-schedule-draft').addEventListener('click', saveScheduleDraft);
$('#validate-schedule').addEventListener('click', validateSchedule);
$('#publish-schedule').addEventListener('click', publishSchedule);
$('#unpublish-schedule').addEventListener('click', unpublishSchedule);
