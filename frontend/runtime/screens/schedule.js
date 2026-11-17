'use strict';

// #442 screen module — çizelge (schedule). Paylaşılan state, apiRequest ve
// hata normalizasyonu core'da (app.js); haftalık program akışı, gün şeridi,
// dikey gün ajandası ve taslak/yayın/revizyon disiplini bu modüle aittir.
//
// #450: Yönetici taslak açar, haftayı gün şeridi + ajanda olarak görür,
// ders ekler, kaydeder, güncel doğrulama kanıtını bekler ve yayınlar.
// Yayınlanmış program salt okunurdur; tek ileri yol yeni dönem taslağıdır.
//
// Revizyon disiplini (#441 story 75, #447): yanıt header'ı `Content-Length`-
// benzeri bir content-hash ETag taşır; mutasyon `If-Match` başlığı ise HER
// ZAMAN yanıt gövdesindeki `revision` alanından kurulan belgelenmiş biçimdir
// (`"schedule:<id>:v<n>"`). İstemci revision aritmetiği YAPMAZ ve GET ETag'ini
// asla `If-Match` olarak göndermez; her mutasyondan sonra kaynağı yeniden
// okur (read-after-write).

const PROGRAMME_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const PROGRAMME_WEEKDAYS = [1, 2, 3, 4, 5];
const PROGRAMME_DAY_LABELS = {
  0: 'Pazar',
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
  6: 'Cumartesi',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function programmeTime(value) {
  const raw = String(value ?? '').trim();
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

function programmeIsoDay(value) {
  return String(value ?? '').trim().slice(0, 10);
}

function programmePeriodLabel(read) {
  const from = programmeIsoDay(read?.effectiveFrom);
  const to = programmeIsoDay(read?.effectiveTo);
  if (from && to) return `${from} – ${to}`;
  return from || to || '';
}

function mutationToken(id, revision) {
  return `"schedule:${String(id)}:v${Number(revision) || 1}"`;
}

function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function programmeDayLabel(day) {
  return PROGRAMME_DAY_LABELS[Number(day)] ?? 'Gün';
}

function readEventsAsDraft() {
  const events = Array.isArray(state.scheduleRead?.events) ? state.scheduleRead.events : [];
  return events.map((ev) => ({
    eventId: String(ev?.eventId ?? ''),
    teacherId: String(ev?.teacherId ?? ''),
    teacherBranchId: String(ev?.teacherBranchId ?? ''),
    studentGroupId: String(ev?.studentGroupId ?? ''),
    courseId: String(ev?.courseId ?? ''),
    roomId: String(ev?.roomId ?? ''),
    timeSlotId: String(ev?.timeSlotId ?? ''),
    dayOfWeek: Number(ev?.dayOfWeek ?? 1),
    startTime: programmeTime(ev?.startTime),
    endTime: programmeTime(ev?.endTime),
    timeSlotLabel: ev?.timeSlotLabel ?? null,
  }));
}

function rowsAsDraft() {
  return (state.scheduleRows || []).map((row) => ({
    eventId: String(row?.eventId ?? '') || newEventId(),
    teacherId: String(row?.teacherId ?? '').trim(),
    teacherBranchId: String(row?.teacherBranchId ?? '').trim(),
    studentGroupId: String(row?.studentGroupId ?? '').trim(),
    courseId: String(row?.courseId ?? '').trim(),
    roomId: String(row?.roomId ?? '').trim(),
    timeSlotId: String(row?.timeSlotId ?? '').trim(),
    dayOfWeek: Number(row?.dayOfWeek ?? 1),
    startTime: programmeTime(row?.startTime),
    endTime: programmeTime(row?.endTime),
    timeSlotLabel: null,
  }));
}

function newEventId() {
  return (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

/** İstemci tarafı biçim doğrulaması: eksik/ geçersiz referans 500'e düşmesin. */
function programmeRowValidationMessage() {
  const rows = rowsAsDraft();
  const references = [
    ['teacherId', 'Öğretmen'],
    ['teacherBranchId', 'Öğretmen görevlendirmesi'],
    ['studentGroupId', 'Sınıf'],
    ['courseId', 'Ders'],
    ['roomId', 'Derslik'],
    ['timeSlotId', 'Zaman dilimi'],
  ];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const label = `${index + 1}. ders`;
    for (const [key, name] of references) {
      const value = String(row[key] ?? '').trim();
      if (!value) return `${label}: ${name} kimliği gerekli.`;
      if (!UUID_PATTERN.test(value)) return `${label}: ${name} kimliği geçersiz.`;
    }
    if (!Number.isInteger(row.dayOfWeek) || row.dayOfWeek < 0 || row.dayOfWeek > 6) {
      return `${label}: gün 0-6 arasında olmalı.`;
    }
    if (!TIME_PATTERN.test(row.startTime) || !TIME_PATTERN.test(row.endTime)) {
      return `${label}: saat HH:MM biçiminde olmalı.`;
    }
    if (timeToMinutes(row.startTime) >= timeToMinutes(row.endTime)) {
      return `${label}: bitiş saati, başlangıçtan sonra olmalı.`;
    }
  }
  return null;
}

function mutationIfMatch() {
  return state.scheduleEtag;
}

function canPublishNow() {
  const read = state.scheduleRead;
  if (!read || read.readOnly || read.status === 'published') return false;
  if (state.scheduleDirty) return false;
  if (readEventsAsDraft().length === 0) return false;
  const evidence = state.scheduleEvidence;
  if (!evidence) return false;
  if (evidence.mode !== 'FULL' || evidence.evidenceStatus !== 'authoritative') return false;
  if (!evidence.canPublish) return false;
  if (Number(evidence.scheduleRevision) !== Number(read.revision)) return false;
  return hasCapability('schedule:publish');
}

function filteredScheduleEvents() {
  return filterEvents(Array.isArray(state.scheduleEvents) ? state.scheduleEvents.slice() : []);
}

function scheduleDayCounts(events) {
  const counts = {};
  for (const ev of events) {
    const day = Number(ev?.dayOfWeek);
    if (!Number.isInteger(day)) continue;
    counts[day] = (counts[day] || 0) + 1;
  }
  return counts;
}

function pickDefaultDay(events, preferred) {
  const present = new Set((events || []).map((ev) => Number(ev?.dayOfWeek)));
  if (Number.isInteger(preferred) && PROGRAMME_DAY_ORDER.includes(preferred)
    && (present.has(preferred) || PROGRAMME_WEEKDAYS.includes(preferred))) {
    return preferred;
  }
  const today = new Date().getDay();
  if (present.has(today)) return today;
  const first = PROGRAMME_DAY_ORDER.find((day) => present.has(day));
  return first ?? 1;
}

function compareByStart(a, b) {
  const start = String(a?.startTime ?? '').localeCompare(String(b?.startTime ?? ''));
  if (start !== 0) return start;
  const end = String(a?.endTime ?? '').localeCompare(String(b?.endTime ?? ''));
  if (end !== 0) return end;
  return String(a?.eventId ?? '').localeCompare(String(b?.eventId ?? ''));
}

function renderProgrammePicker() {
  const items = Array.isArray(state.scheduleList) ? state.scheduleList : [];
  const picker = $('#schedule-programme-picker');
  const select = $('#schedule-programme-select');
  const show = items.length > 1;
  picker.classList.toggle('hidden', !show);
  if (!show) {
    select.innerHTML = '';
    return;
  }
  select.innerHTML = items.map((item) => {
    const period = programmePeriodLabel(item);
    const revision = Number(item?.revision) || 1;
    const label = `${displayStatus(item?.status)} · ${period || 'Dönem belirtilmedi'} · Revizyon ${revision}`;
    const selected = String(item?.scheduleId) === String(state.scheduleId) ? ' selected' : '';
    return `<option value="${escapeHtml(String(item?.scheduleId ?? ''))}"${selected}>${escapeHtml(label)}</option>`;
  }).join('');
}

function renderProgrammeScope() {
  const target = $('#program-scope');
  const branch = state.branchLabel || 'Şube seçilmedi';
  const read = state.scheduleRead;
  if (!read || !read.scheduleId) {
    target.textContent = branch;
    return;
  }
  const period = programmePeriodLabel(read);
  target.textContent = `${branch} · ${period || 'Dönem belirtilmedi'}`;
}

function renderScheduleStatus() {
  const target = $('#schedule-status');
  const read = state.scheduleRead;
  if (!read || !read.scheduleId) {
    delete target.dataset.scheduleId;
    delete target.dataset.scheduleRevision;
    delete target.dataset.gridState;
    delete target.dataset.projection;
    empty(target, 'schedule');
    return;
  }
  const published = read.readOnly === true
    || String(read.gridState) === 'weekly_grid_ready_published'
    || read.status === 'published';
  const gridState = read.gridState
    || (published ? 'weekly_grid_ready_published' : 'weekly_grid_ready_draft');
  const eventCount = Number(read.eventCount ?? readEventsAsDraft().length) || 0;
  const revision = Number(read.revision) || 1;
  target.dataset.gridState = String(gridState);
  target.dataset.projection = String(read.projection ?? '');
  target.dataset.scheduleId = String(read.scheduleId);
  target.dataset.scheduleRevision = String(revision);
  const publishedAt = read.version?.publishedAt ? ` · Yayınlandı: ${programmeIsoDay(read.version.publishedAt)}` : '';
  const suffix = published ? ' · Salt okunur' : '';
  target.innerHTML = `<article class="card" data-schedule-id="${escapeHtml(String(read.scheduleId))}" data-schedule-revision="${escapeHtml(String(revision))}" data-grid-state="${escapeHtml(String(gridState))}" data-projection="${escapeHtml(String(read.projection ?? ''))}">
    <h3>${published ? 'Yayınlanmış program' : 'Taslak program'}</h3>
    <p>Geçerlilik: ${escapeHtml(programmePeriodLabel(read) || 'Belirtilmedi')} · Revizyon: ${escapeHtml(String(revision))}</p>
    <p>${escapeHtml(String(eventCount))} ders${escapeHtml(suffix)}${escapeHtml(publishedAt)}</p>
  </article>`;
}

function renderDayStrip() {
  const target = $('#schedule-daystrip');
  const read = state.scheduleRead;
  if (!read || !read.scheduleId) {
    target.innerHTML = '';
    target.classList.add('hidden');
    return;
  }
  const events = filteredScheduleEvents();
  const counts = scheduleDayCounts(events);
  const days = PROGRAMME_DAY_ORDER.filter((day) => PROGRAMME_WEEKDAYS.includes(day) || counts[day] > 0 || state.scheduleDay === day);
  target.innerHTML = days.map((day) => {
    const selected = state.scheduleDay === day;
    return `<button type="button" class="chip day-chip${selected ? ' is-active' : ''}" data-day="${day}" aria-pressed="${selected ? 'true' : 'false'}">
      <span>${escapeHtml(programmeDayLabel(day))}</span><small>${escapeHtml(String(counts[day] || 0))} ders</small>
    </button>`;
  }).join('');
  target.classList.remove('hidden');
}

function agendaRefChip(label, present) {
  return `<span class="tag" data-tone="${present ? 'success' : 'warning'}">${escapeHtml(label)}${present ? '' : ' yok'}</span>`;
}

function renderAgenda() {
  const target = $('#schedule-agenda');
  const read = state.scheduleRead;
  if (!read || !read.scheduleId) {
    target.innerHTML = '';
    return;
  }
  const events = filteredScheduleEvents().filter((ev) => Number(ev?.dayOfWeek) === state.scheduleDay).sort(compareByStart);
  if (!events.length) {
    empty(target, 'scheduleDay');
    return;
  }
  target.innerHTML = events.map((ev, index) => `<article class="agenda-item" data-schedule-event="${escapeHtml(String(ev?.eventId ?? ''))}">
    <p class="agenda-time">${escapeHtml(programmeTime(ev?.startTime) || '--:--')}–${escapeHtml(programmeTime(ev?.endTime) || '--:--')}</p>
    <div>
      <h3 class="agenda-title">${escapeHtml(String(ev?.timeSlotLabel ?? '').trim() || `Ders ${index + 1}`)}</h3>
      <div class="agenda-refs">${agendaRefChip('Öğretmen', !!ev?.teacherId)}${agendaRefChip('Sınıf', !!ev?.studentGroupId)}${agendaRefChip('Derslik', !!ev?.roomId)}${agendaRefChip('Zaman dilimi', !!ev?.timeSlotId)}</div>
    </div>
  </article>`).join('');
}

function renderGate() {
  const target = $('#schedule-gate');
  const read = state.scheduleRead;
  let stateName = 'none';
  let text = '';
  if (read && read.scheduleId) {
    if (read.readOnly === true || read.status === 'published') {
      text = 'Yayınlanmış program salt okunur; değişiklik için yeni dönem taslağı oluşturun.';
      stateName = 'readonly';
    } else {
      const unsaved = state.scheduleRows.length;
      const eventCount = Number(read.eventCount ?? readEventsAsDraft().length) || 0;
      const total = eventCount + unsaved;
      if (total === 0) {
        text = 'Yayın için en az bir ders gerekli.';
        stateName = 'closed_empty';
      } else if (unsaved > 0) {
        text = 'Kaydedilmemiş değişiklik var; önce taslağı kaydedin.';
        stateName = 'closed_dirty';
      } else {
        const evidence = state.scheduleEvidence;
        const revision = Number(read.revision) || 1;
        if (!evidence || Number(evidence.scheduleRevision) !== revision) {
          text = 'Yayın için güncel doğrulama gerekli.';
          stateName = 'closed_stale';
        } else if (evidence.mode !== 'FULL' || evidence.evidenceStatus !== 'authoritative') {
          text = 'Yayın için güncel doğrulama gerekli.';
          stateName = 'closed_stale';
        } else if (!evidence.canPublish) {
          text = 'Doğrulama yayın engelleri buldu.';
          stateName = 'closed_conflicts';
        } else {
          text = 'Doğrulama güncel; program yayınlanabilir.';
          stateName = 'ready';
        }
      }
    }
  }
  target.dataset.gateState = stateName;
  target.textContent = text;
  target.classList.toggle('hidden', !text);
}

function renderScheduleActions() {
  const target = $('#schedule-actions');
  const read = state.scheduleRead;
  const cooldown = mutationDisabled() ? ' disabled' : '';
  let markup = '';
  if (read && read.scheduleId && !read.readOnly && read.status !== 'published') {
    if (hasCapability('schedule:validate')) {
      markup += `<button id="validate-schedule" type="button"${state.scheduleDirty ? ' disabled' : ''}${cooldown}>Doğrula</button>`;
    }
    if (hasCapability('schedule:publish')) {
      markup += `<button id="publish-schedule" type="button"${canPublishNow() ? '' : ' disabled'} aria-describedby="schedule-gate"${cooldown}>Yayınla</button>`;
    }
  } else if (read && read.scheduleId && (read.readOnly || read.status === 'published') && hasCapability('schedule:draft:create')) {
    markup += `<button id="new-schedule-draft" type="button" data-action="schedule-new-draft"${cooldown}>Yeni taslak oluştur</button>`;
  }
  target.innerHTML = markup;
}

function scheduleRowMarkup(row, index) {
  const dayOptions = PROGRAMME_DAY_ORDER.map((day) => {
    const selected = Number(row?.dayOfWeek ?? 1) === day ? ' selected' : '';
    return `<option value="${day}"${selected}>${escapeHtml(programmeDayLabel(day))}</option>`;
  }).join('');
  const input = (field, label, value, attrs = '') => `<label>${escapeHtml(label)} <input data-schedule-field="${escapeHtml(field)}" value="${escapeHtml(String(value ?? ''))}" autocomplete="off"${attrs} /></label>`;
  return `<article class="card" data-schedule-row="${index}">
    <h3>Yeni ders ${index + 1}</h3>
    <div class="grid-form">
      <label>Gün <select data-schedule-field="dayOfWeek">${dayOptions}</select></label>
      <label>Başlangıç <input data-schedule-field="startTime" type="time" value="${escapeHtml(String(row?.startTime ?? '09:00'))}" /></label>
      <label>Bitiş <input data-schedule-field="endTime" type="time" value="${escapeHtml(String(row?.endTime ?? '09:40'))}" /></label>
      ${input('teacherId', 'Öğretmen kimliği', row?.teacherId)}
      ${input('teacherBranchId', 'Öğretmen görevlendirme kimliği', row?.teacherBranchId)}
      ${input('studentGroupId', 'Sınıf kimliği', row?.studentGroupId)}
      ${input('courseId', 'Ders kimliği', row?.courseId)}
      ${input('roomId', 'Derslik kimliği', row?.roomId)}
      ${input('timeSlotId', 'Zaman dilimi kimliği', row?.timeSlotId)}
    </div>
    <div class="quick-actions" role="group">
      <button type="button" data-action="schedule-row-remove" data-schedule-index="${index}">Satırı sil</button>
    </div>
  </article>`;
}

function renderScheduleEditor() {
  const container = $('#schedule-editor');
  const addButton = $('#add-schedule-event');
  const saveButton = $('#save-schedule-draft');
  const list = $('#schedule-events');
  const read = state.scheduleRead;
  const editable = Boolean(read && read.scheduleId && !read.readOnly && read.status !== 'published');
  const canUpdate = hasCapability('schedule:draft:update');
  const visible = editable && canUpdate;
  container.classList.toggle('hidden', !visible);
  if (!visible) {
    list.innerHTML = '';
    addButton.disabled = true;
    saveButton.disabled = true;
    return;
  }
  const rows = state.scheduleRows || [];
  const unsaved = rows.length;
  list.innerHTML = unsaved
    ? rows.map(scheduleRowMarkup).join('')
    : '<p class="hint">Kaydedilmemiş ders yok; "Ders ekle" ile ekleyin.</p>';
  addButton.disabled = mutationDisabled();
  saveButton.disabled = unsaved === 0 || mutationDisabled();
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
    <h3>Doğrulama bulguları</h3>
    <p class="hint">Çakışmalar elle çözülür: etkilenen dersi kontrol edip düzenleyin.</p>
    <ul class="impact-list">
      ${list.map((r) => {
        const code = pick(r, ['code'], '');
        const label = displayTerm(scheduleReasonLabels, code, 'Çözülmesi gereken bir bulgu');
        const eventId = pick(r, ['eventId'], '');
        return `<li data-schedule-reason="${escapeHtml(code)}">
          <span>${escapeHtml(label)}</span>
          ${eventId ? `<button type="button" data-action="schedule-conflict-show" data-event-id="${escapeHtml(String(eventId))}">Göster</button>` : ''}
        </li>`;
      }).join('')}
    </ul>
  </article>`;
}

function renderProgramme() {
  renderProgrammePicker();
  renderProgrammeScope();
  renderScheduleStatus();
  renderDayStrip();
  renderAgenda();
  renderGate();
  renderScheduleActions();
  renderScheduleEditor();
  const createForm = document.getElementById('schedule-create-form');
  if (createForm) {
    const read = state.scheduleRead;
    const show = hasCapability('schedule:draft:create') && (!read || !read.scheduleId || read.readOnly || read.status === 'published');
    createForm.classList.toggle('hidden', !show);
  }
  try { populateProgramFilters(); } catch (e) { /* filtre seçenekleri ikincil */ }
}

function selectScheduleDay(day) {
  const value = Number(day);
  if (!PROGRAMME_DAY_ORDER.includes(value)) return;
  state.scheduleDay = value;
  renderDayStrip();
  renderAgenda();
}

function resetProgrammeState() {
  state.scheduleRead = null;
  state.scheduleId = '';
  state.scheduleRevision = 0;
  state.scheduleEvents = [];
  state.scheduleRows = [];
  state.scheduleEvidence = null;
  state.scheduleDirty = false;
  state.scheduleEtag = '';
  state.scheduleDay = 1;
}

function pickProgrammeCandidate(candidates, preferredId) {
  if (!candidates.length) return null;
  if (preferredId && candidates.some((item) => String(item?.scheduleId) === String(preferredId))) {
    return preferredId;
  }
  const draft = candidates.find((item) => item?.status === 'draft');
  return (draft || candidates[0])?.scheduleId ?? null;
}

async function loadProgrammeList() {
  const candidates = [];
  const failures = [];
  if (hasCapability('schedule:draft:read')) {
    try {
      const { body } = await apiRequest('/schedules/drafts');
      candidates.push(...asArray(body, ['items']));
    } catch (error) {
      failures.push(error);
    }
  }
  if (hasAnyCapability(['schedule:read', 'schedule:own:read'])) {
    try {
      const { body } = await apiRequest('/schedules/published');
      candidates.push(...asArray(body, ['items']));
    } catch (error) {
      failures.push(error);
    }
  }
  const seen = new Set();
  const unique = candidates.filter((item) => {
    const id = String(item?.scheduleId ?? '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { candidates: unique, failures };
}

async function loadScheduleDetail(scheduleId) {
  const { body: read } = await apiRequest(`/schedules/${encodeURIComponent(scheduleId)}`);
  state.scheduleRead = read ?? null;
  state.scheduleId = String(read?.scheduleId ?? scheduleId);
  state.scheduleRevision = Number(read?.revision) || 1;
  state.scheduleEvents = Array.isArray(read?.events) ? read.events : [];
  state.scheduleRows = [];
  state.scheduleEvidence = null;
  state.scheduleDirty = false;
  // GET ETag'i content-addressed'dir; `If-Match` gövdedeki revision'dan kurulur.
  state.scheduleEtag = mutationToken(state.scheduleId, state.scheduleRevision);
  state.scheduleDay = pickDefaultDay(state.scheduleEvents, state.scheduleDay);
  renderConflictResolution([]);
  renderProgramme();
  return read;
}

// Kaydedilmemiş satırlar her liste/detay yenilemesinde kaybolur; sekme
// geçişi ve seçici değişimi de dahil her yeniden yükleme yolu aynı soruyu
// sorar.
function confirmDiscardRows(message) {
  if (state.scheduleRows.length && typeof confirm === 'function') {
    return confirm(message);
  }
  return true;
}

async function loadProgramme() {
  if (!requireSession()) return;
  if (!confirmDiscardRows('Kaydedilmemiş dersler kaybolur. Yine de yenilensin mi?')) return;
  const canManagement = hasCapability('schedule:draft:read');
  const canPublished = hasAnyCapability(['schedule:read', 'schedule:own:read']);
  if (!canManagement && !canPublished) {
    resetProgrammeState();
    renderProgramme();
    return;
  }
  const target = $('#schedule-status');
  try {
    const { candidates, failures } = await loadProgrammeList();
    if (candidates.length === 0 && failures.length > 0) {
      resetProgrammeState();
      renderProgramme();
      renderError(target, failures[0]);
      return;
    }
    state.scheduleList = candidates;
    const selectedId = pickProgrammeCandidate(candidates, state.scheduleId);
    if (!selectedId) {
      resetProgrammeState();
      renderProgramme();
      return;
    }
    await loadScheduleDetail(selectedId);
  } catch (error) {
    resetProgrammeState();
    renderProgramme();
    renderError(target, error);
  }
}

// ---------------------------------------------------------------------------
// Program akışları
// ---------------------------------------------------------------------------

async function createSchedule(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (!requireSession()) return;
  if (!hasCapability('schedule:draft:create')) {
    announce('Bu işlem için yetkiniz yok.', 'warning');
    return;
  }
  const branchId = getBranchId();
  const effectiveFrom = $('#schedule-effective-from').value;
  const effectiveTo = $('#schedule-effective-to').value;
  if (!branchId) {
    announce('Önce şube seçin.', 'warning');
    return;
  }
  if (!effectiveFrom || !effectiveTo) {
    announce('Geçerlilik başlangıcı ve sonu gerekli.', 'warning');
    return;
  }
  if (effectiveFrom > effectiveTo) {
    announce('Geçerlilik sonu, başlangıçtan önce olamaz.', 'warning');
    return;
  }
  const target = $('#schedule-status');
  target.innerHTML = loading('Çizelge oluşturuluyor');
  try {
    const { body } = await apiRequest('/schedules/drafts', {
      method: 'POST',
      body: { branchId, effectiveFrom, effectiveTo },
    });
    const id = pick(body, ['scheduleId', 'id'], '');
    const form = document.getElementById('schedule-create-form');
    if (form && typeof form.reset === 'function') form.reset();
    await loadScheduleDetail(id);
    announce('Çizelge oluşturuldu; ders ekleyip kaydedin.', 'success');
  } catch (error) {
    renderError(target, error);
  }
}

function addScheduleEvent() {
  if (!state.scheduleRead || !state.scheduleRead.scheduleId) {
    announce('Önce bir program seçin veya oluşturun.', 'warning');
    return;
  }
  if (state.scheduleRead.readOnly || state.scheduleRead.status === 'published') {
    announce('Yayınlanmış program değiştirilemez.', 'warning');
    return;
  }
  if (!hasCapability('schedule:draft:update')) {
    announce('Bu işlem için yetkiniz yok.', 'warning');
    return;
  }
  const day = PROGRAMME_WEEKDAYS.includes(state.scheduleDay) ? state.scheduleDay : 1;
  state.scheduleRows.push({
    eventId: newEventId(),
    teacherId: '',
    teacherBranchId: '',
    studentGroupId: '',
    courseId: '',
    roomId: '',
    timeSlotId: '',
    dayOfWeek: String(day),
    startTime: '09:00',
    endTime: '09:40',
  });
  state.scheduleDirty = true;
  state.scheduleEvidence = null;
  renderScheduleEditor();
  renderGate();
  renderScheduleActions();
  announce('Yeni ders satırı eklendi.', 'success');
}

function removeScheduleRow(index) {
  if (!Array.isArray(state.scheduleRows) || !state.scheduleRows[index]) return;
  state.scheduleRows.splice(index, 1);
  state.scheduleDirty = state.scheduleRows.length > 0;
  renderScheduleEditor();
  renderGate();
  renderScheduleActions();
}

function handleScheduleRowInput(event) {
  const target = event && event.target;
  const field = target && target.dataset ? target.dataset.scheduleField : undefined;
  if (!field) return;
  const rowEl = target.closest ? target.closest('[data-schedule-row]') : null;
  const index = rowEl ? Number(rowEl.dataset.scheduleRow) : NaN;
  if (!Number.isInteger(index) || !state.scheduleRows[index]) return;
  state.scheduleRows[index] = { ...state.scheduleRows[index], [field]: target.value };
  state.scheduleEvidence = null;
  renderGate();
  renderScheduleActions();
}

async function saveScheduleDraft() {
  if (!requireSession()) return;
  const read = state.scheduleRead;
  if (!read || !read.scheduleId) {
    announce('Önce bir program seçin.', 'warning');
    return;
  }
  if (read.readOnly || read.status === 'published') {
    announce('Yayınlanmış program değiştirilemez.', 'warning');
    return;
  }
  if (!hasCapability('schedule:draft:update')) {
    announce('Bu işlem için yetkiniz yok.', 'warning');
    return;
  }
  if (!state.scheduleRows.length) {
    announce('Kaydedilecek yeni ders yok.', 'warning');
    return;
  }
  const message = programmeRowValidationMessage();
  if (message) {
    announce(message, 'warning');
    return;
  }
  const events = [...readEventsAsDraft(), ...rowsAsDraft()];
  const target = $('#schedule-status');
  target.innerHTML = loading('Taslak kaydediliyor');
  try {
    await apiRequest(`/schedules/${encodeURIComponent(state.scheduleId)}/draft`, {
      method: 'POST',
      headers: { 'If-Match': mutationIfMatch() },
      body: { branchId: getBranchId(), events },
    });
    await loadScheduleDetail(state.scheduleId);
    announce('Taslak kaydedildi.', 'success');
  } catch (error) {
    renderError(target, error);
  }
}

async function validateSchedule(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (!requireSession()) return;
  const read = state.scheduleRead;
  if (!read || !read.scheduleId) {
    announce('Önce bir program seçin.', 'warning');
    return;
  }
  if (read.readOnly || read.status === 'published') {
    announce('Yayınlanmış program için doğrulama çalıştırılamaz.', 'warning');
    return;
  }
  if (state.scheduleDirty) {
    announce('Kaydedilmemiş değişiklik var; önce taslağı kaydedin.', 'warning');
    return;
  }
  const target = $('#schedule-status');
  target.innerHTML = loading('Doğrulama sunucuda çalışıyor');
  try {
    const { body } = await apiRequest(`/schedules/${encodeURIComponent(state.scheduleId)}/validate`, {
      method: 'POST',
      headers: { 'If-Match': mutationIfMatch() },
      body: { branchId: getBranchId(), events: readEventsAsDraft() },
    });
    state.scheduleEvidence = body && body.evidence ? body.evidence : body;
    const canPublish = canPublishNow();
    renderConflictResolution(asArray(state.scheduleEvidence, ['reasons']));
    renderScheduleStatus();
    renderGate();
    renderScheduleActions();
    announce(canPublish ? 'Doğrulama geçti; yayınlanabilir.' : 'Doğrulama yayın engelleri buldu.', canPublish ? 'success' : 'warning');
  } catch (error) {
    renderError(target, error);
    renderConflictResolution([]);
  }
}

async function publishSchedule() {
  if (!requireSession()) return;
  const read = state.scheduleRead;
  if (!read || !read.scheduleId) {
    announce('Önce bir program seçin.', 'warning');
    return;
  }
  if (read.readOnly || read.status === 'published') {
    announce('Program zaten yayınlanmış.', 'warning');
    return;
  }
  if (!hasCapability('schedule:publish')) {
    announce('Bu işlem için yetkiniz yok.', 'warning');
    return;
  }
  if (!canPublishNow()) {
    announce('Yayın kapalı: güncel doğrulama gerekir.', 'warning');
    renderGate();
    renderScheduleActions();
    return;
  }
  const target = $('#schedule-status');
  target.innerHTML = loading('Çizelge yayınlanıyor');
  try {
    await apiRequest(`/schedules/${encodeURIComponent(state.scheduleId)}/publish`, {
      method: 'POST',
      headers: { 'If-Match': mutationIfMatch() },
      body: { branchId: getBranchId(), events: readEventsAsDraft() },
    });
    const form = document.getElementById('schedule-create-form');
    if (form && typeof form.reset === 'function') form.reset();
    await loadScheduleDetail(state.scheduleId);
    renderConflictResolution([]);
    announce('Çizelge yayınlandı.', 'success');
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

function eventSlotLabel(ev) {
  return `${programmeDayLabel(ev?.dayOfWeek)} ${programmeTime(ev?.startTime)}-${programmeTime(ev?.endTime)}`;
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
  const events = Array.isArray(state.scheduleEvents) ? state.scheduleEvents : [];
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

document.addEventListener('click', (event) => {
  const clickTarget = event && event.target;
  if (!clickTarget || typeof clickTarget.closest !== 'function') return;
  const dayButton = clickTarget.closest('[data-day]');
  if (dayButton && dayButton.closest && dayButton.closest('#schedule-daystrip')) {
    selectScheduleDay(dayButton.dataset.day);
    return;
  }
  const button = clickTarget.closest('button');
  if (!button) return;
  if (button.dataset.action === 'schedule-row-remove') removeScheduleRow(Number(button.dataset.scheduleIndex));
  if (button.dataset.action === 'schedule-conflict-show') {
    const id = String(button.dataset.eventId ?? '');
    if (id) {
      try {
        const el = document.querySelector(`[data-schedule-event="${id}"]`);
        if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (error) { /* bulgu başka günde olabilir */ }
    }
  }
  if (button.id === 'validate-schedule') validateSchedule();
  if (button.id === 'publish-schedule') publishSchedule();
  if (button.dataset.action === 'schedule-new-draft') {
    const from = document.getElementById('schedule-effective-from');
    if (from && typeof from.focus === 'function') {
      from.focus();
      if (typeof from.scrollIntoView === 'function') from.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
});

// filter wiring
['branch-filter', 'teacher-filter', 'room-filter'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => { renderDayStrip(); renderAgenda(); });
});

$('#schedule-create-form').addEventListener('submit', createSchedule);
$('#refresh-schedule-status').addEventListener('click', loadProgramme);
$('#add-schedule-event').addEventListener('click', addScheduleEvent);
$('#save-schedule-draft').addEventListener('click', saveScheduleDraft);
$('#schedule-programme-select').addEventListener('change', (event) => {
  const targetElement = event?.target;
  const selected = String(targetElement?.value ?? '');
  if (!selected) return;
  if (!confirmDiscardRows('Kaydedilmemiş dersler kaybolur. Yine de yükleme yapılsın mı?')) {
    if (targetElement) targetElement.value = state.scheduleId;
    return;
  }
  loadScheduleDetail(selected).catch((error) => renderError($('#schedule-status'), error));
});
$('#schedule-events').addEventListener('input', handleScheduleRowInput);
$('#schedule-events').addEventListener('change', handleScheduleRowInput);

registerTabActivationHook('program', loadProgramme);
