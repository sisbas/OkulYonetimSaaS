'use strict';

// #442 screen module — çizelge (schedule). Paylaşılan state, apiRequest ve
// hata normalizasyonu core'da (app.js); haftalık program akışı, gün şeridi,
// dikey gün ajandası ve taslak/yayın/revizyon disiplini bu modüle aittir.
//
// #450: Yönetici taslak açar, haftayı gün şeridi + ajanda olarak görür,
// ders ekler, kaydeder, güncel doğrulama kanıtını bekler ve yayınlar.
// Yayınlanmış program salt okunurdur; tek ileri yol yeni dönem taslağıdır.
//
// Revizyon disiplini (#441 story 75, #447, #452): GET yanıtı içerik-adresli
// bir ETag taşır; mutasyon `If-Match` başlığı ise HER ZAMAN sunucunun
// read-back gövdesindeki `revision` alanından kurulan belgelenmiş biçimdir
// (`"schedule:<id>:v<n>"`). İstemci revision aritmetiği YAPMAZ, fallback
// üretmez ve GET ETag'ini asla `If-Match` olarak göndermez.
//
// #452: 412 (bayat) ve 428 (eksik sürüm) ayrı anlam ve ayrı yüzeydir; ikisi de
// tüm mutation kontrollerini kilitler, hiçbiri otomatik yeniden denemez.
// Offline istemci okumaya devam eder, yazma yapamaz ve depolanan veriye
// düşmez. Kalıcı dersler ajanda içinde sahnelenir, tek `Taslağı kaydet`
// ile kalıcılaşır; yeni satırlar mevcut `#schedule-events` editöründe kalır.

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

const SCHEDULE_VERSION_COPY = {
  stale_version: {
    title: 'Program başka bir işlemle güncellendi',
    message: 'Program başka bir işlemle güncellendi; değişiklikleriniz korunuyor. Kaydetmek için önce yenileyin.',
    hint: 'Yenile\'ye basıp güncel sürümü yükleyin.',
    gateState: 'version_stale',
  },
  version_required: {
    title: 'Program sürümü doğrulanamadı',
    message: 'Programın sunucudaki sürümü alınamadı; hiçbir değişiklik gönderilemez.',
    hint: 'Yenile\'ye basıp programı yeniden yükleyin.',
    gateState: 'version_missing',
  },
};

function serverRevision(revision) {
  const value = Number(revision);
  return Number.isInteger(value) && value >= 1 ? value : 0;
}

/** Sunucu pozitif bir revision vermediyse istemci asla sürüm üretmez. */
function mutationToken(id, revision) {
  const value = Number(revision);
  if (!id || !Number.isInteger(value) || value < 1) return '';
  return `"schedule:${String(id)}:v${value}"`;
}

function scheduleMutationLocked() {
  // #452/#532 — 429 cooldown'u offline ile aynı kilide dahildir; aksi halde
  // bekleme süresince save/validate/publish kontrolleri açık kalır.
  return Boolean(state.scheduleVersionState) || mutationDisabled();
}

function canEditSchedule() {
  const read = state.scheduleRead;
  return Boolean(read && read.scheduleId && !read.readOnly
    && read.status !== 'published' && hasCapability('schedule:draft:update'));
}

function isScheduleVersionError(error) {
  const stateName = String(error?.uiState ?? '');
  return stateName === 'stale_version' || stateName === 'version_required';
}

function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function programmeDayLabel(day) {
  return PROGRAMME_DAY_LABELS[Number(day)] ?? 'Gün';
}

function toDraftEvent(ev) {
  return {
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
  };
}

function readEventsFromRead(read) {
  const events = Array.isArray(read?.events) ? read.events : [];
  return events.map(toDraftEvent);
}

/** #452 — ajanda ve kaydetme aynı çalışma kopyasını okur. */
function readEventsAsDraft() {
  return (Array.isArray(state.scheduleEvents) ? state.scheduleEvents : []).map(toDraftEvent);
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

/** Kalıcı çalışma kopyası + yeni satırlar: kaydedilecek tam ders listesi. */
function stagedEventsAsDraft() {
  return [...readEventsAsDraft(), ...rowsAsDraft()];
}

function findEventIndex(eventId) {
  const wanted = String(eventId ?? '');
  return (state.scheduleEvents || []).findIndex((ev) => String(ev?.eventId ?? '') === wanted);
}

function invalidateScheduleEvidence() {
  state.scheduleEvidence = null;
  resetValidationSummary();
  if (typeof renderConflictResolution === 'function') renderConflictResolution([]);
}

/** Yeni ekleme, düzenleme, silme ve geri alma aynı ölçütle dirty olur. */
function recomputeScheduleDirty() {
  state.scheduleDirty = JSON.stringify(stagedEventsAsDraft()) !== state.scheduleBaseline;
}

/** İstemci tarafı biçim doğrulaması: eksik/ geçersiz referans 500'e düşmesin. */
function programmeRowValidationMessage(rows = rowsAsDraft()) {
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
  return state.scheduleIfMatch;
}

function canPublishNow() {
  const read = state.scheduleRead;
  if (!read || read.readOnly || read.status === 'published') return false;
  if (scheduleMutationLocked()) return false;
  if (state.scheduleDirty) return false;
  if (stagedEventsAsDraft().length === 0) return false;
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
    const revision = serverRevision(item?.revision);
    const revisionLabel = revision ? ` · Revizyon ${revision}` : '';
    const label = `${displayStatus(item?.status)} · ${period || 'Dönem belirtilmedi'}${revisionLabel}`;
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

function renderScheduleVersionLock() {
  const copy = SCHEDULE_VERSION_COPY[state.scheduleVersionState];
  if (!copy) return false;
  const target = $('#schedule-status');
  target.dataset.state = state.scheduleVersionState;
  target.innerHTML = `<div class="error-state" data-state="${escapeHtml(state.scheduleVersionState)}">
    <strong>${escapeHtml(copy.title)}</strong>
    <p>${escapeHtml(copy.message)}</p>
    <small class="recovery-hint">${escapeHtml(copy.hint)}</small>
  </div>`;
  return true;
}

function renderScheduleStatus() {
  const target = $('#schedule-status');
  const read = state.scheduleRead;
  if (renderScheduleVersionLock()) return;
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
  const eventCount = Number(read.eventCount ?? stagedEventsAsDraft().length) || 0;
  const revision = serverRevision(read.revision);
  target.dataset.gridState = String(gridState);
  target.dataset.projection = String(read.projection ?? '');
  target.dataset.scheduleId = String(read.scheduleId);
  target.dataset.scheduleRevision = String(revision);
  const publishedAt = read.version?.publishedAt ? ` · Yayınlandı: ${programmeIsoDay(read.version.publishedAt)}` : '';
  const suffix = published ? ' · Salt okunur' : (state.scheduleDirty ? ' · Kaydedilmemiş değişiklik' : '');
  const revisionLabel = revision ? ` · Revizyon: ${revision}` : '';
  target.innerHTML = `<article class="card" data-schedule-id="${escapeHtml(String(read.scheduleId))}" data-schedule-revision="${escapeHtml(String(revision))}" data-grid-state="${escapeHtml(String(gridState))}" data-projection="${escapeHtml(String(read.projection ?? ''))}">
    <h3>${published ? 'Yayınlanmış program' : 'Taslak program'}</h3>
    <p>Geçerlilik: ${escapeHtml(programmePeriodLabel(read) || 'Belirtilmedi')}${escapeHtml(revisionLabel)}</p>
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

function scheduleEditFormMarkup(ev, disabled) {
  const eventId = String(ev?.eventId ?? '');
  const dayOptions = PROGRAMME_DAY_ORDER.map((day) => {
    const selected = Number(ev?.dayOfWeek ?? 1) === day ? ' selected' : '';
    return `<option value="${day}"${selected}${disabled}>${escapeHtml(programmeDayLabel(day))}</option>`;
  }).join('');
  const input = (field, label, value, type = 'text') =>
    `<label>${escapeHtml(label)} <input type="${type}" data-schedule-field="${escapeHtml(field)}" data-schedule-edit-event-id="${escapeHtml(eventId)}" value="${escapeHtml(String(value ?? ''))}" autocomplete="off"${disabled} /></label>`;
  return `<div class="grid-form agenda-edit-form" data-schedule-edit-form="${escapeHtml(eventId)}">
    <label>Gün <select data-schedule-field="dayOfWeek" data-schedule-edit-event-id="${escapeHtml(eventId)}"${disabled}>${dayOptions}</select></label>
    ${input('startTime', 'Başlangıç', programmeTime(ev?.startTime), 'time')}
    ${input('endTime', 'Bitiş', programmeTime(ev?.endTime), 'time')}
    ${input('teacherId', 'Öğretmen kimliği', ev?.teacherId)}
    ${input('teacherBranchId', 'Öğretmen görevlendirme kimliği', ev?.teacherBranchId)}
    ${input('studentGroupId', 'Sınıf kimliği', ev?.studentGroupId)}
    ${input('courseId', 'Ders kimliği', ev?.courseId)}
    ${input('roomId', 'Derslik kimliği', ev?.roomId)}
    ${input('timeSlotId', 'Zaman dilimi kimliği', ev?.timeSlotId)}
    <div class="quick-actions" role="group">
      <button type="button" data-action="schedule-event-edit-save" data-event-id="${escapeHtml(eventId)}"${disabled}>Tamam</button>
      <button type="button" data-action="schedule-event-edit-cancel" data-event-id="${escapeHtml(eventId)}"${disabled}>Vazgeç</button>
    </div>
  </div>`;
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
  const editable = canEditSchedule() && state.scheduleVersionState !== 'version_required';
  const disabled = scheduleMutationLocked() ? ' disabled' : '';
  target.innerHTML = events.map((ev, index) => {
    const eventId = String(ev?.eventId ?? '');
    const editing = editable && state.scheduleEditingEventId === eventId;
    const controls = editable
      ? `<div class="quick-actions" role="group">
          <button type="button" data-action="schedule-event-edit" data-event-id="${escapeHtml(eventId)}"${disabled}>Düzenle</button>
          <button type="button" data-action="schedule-event-delete" data-event-id="${escapeHtml(eventId)}"${disabled}>Sil</button>
        </div>`
      : '';
    return `<article class="agenda-item" data-schedule-event="${escapeHtml(String(ev?.eventId ?? ''))}">
      <p class="agenda-time">${escapeHtml(programmeTime(ev?.startTime) || '--:--')}–${escapeHtml(programmeTime(ev?.endTime) || '--:--')}</p>
      <div>
        <h3 class="agenda-title">${escapeHtml(String(ev?.timeSlotLabel ?? '').trim() || `Ders ${index + 1}`)}</h3>
        <div class="agenda-refs">${agendaRefChip('Öğretmen', !!ev?.teacherId)}${agendaRefChip('Sınıf', !!ev?.studentGroupId)}${agendaRefChip('Derslik', !!ev?.roomId)}${agendaRefChip('Zaman dilimi', !!ev?.timeSlotId)}</div>
      </div>
      ${editing ? scheduleEditFormMarkup(ev, disabled) : ''}
      ${controls}
    </article>`;
  }).join('');
}

function renderGate() {
  const target = $('#schedule-gate');
  const read = state.scheduleRead;
  let stateName = 'none';
  let text = '';
  if (read && read.scheduleId) {
    const versionCopy = SCHEDULE_VERSION_COPY[state.scheduleVersionState];
    if (versionCopy) {
      text = versionCopy.message;
      stateName = versionCopy.gateState;
    } else if (isOffline()) {
      text = 'Bağlantı yok; program görüntülenebilir ancak değişiklik kaydedilemez.';
      stateName = 'offline';
    } else if (read.readOnly === true || read.status === 'published') {
      text = 'Yayınlanmış program salt okunur; değişiklik için yeni dönem taslağı oluşturun.';
      stateName = 'readonly';
    } else {
      const staged = stagedEventsAsDraft().length;
      const revision = serverRevision(read.revision);
      if (staged === 0) {
        text = 'Yayın için en az bir ders gerekli.';
        stateName = 'closed_empty';
      } else if (state.scheduleDirty) {
        text = 'Kaydedilmemiş değişiklik var; önce taslağı kaydedin.';
        stateName = 'closed_dirty';
      } else {
        const evidence = state.scheduleEvidence;
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
  const cooldown = scheduleMutationLocked() ? ' disabled' : '';
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

function scheduleRowMarkup(row, index, disabled = '') {
  const dayOptions = PROGRAMME_DAY_ORDER.map((day) => {
    const selected = Number(row?.dayOfWeek ?? 1) === day ? ' selected' : '';
    return `<option value="${day}"${selected}${disabled}>${escapeHtml(programmeDayLabel(day))}</option>`;
  }).join('');
  const input = (field, label, value, attrs = '') => `<label>${escapeHtml(label)} <input data-schedule-field="${escapeHtml(field)}" value="${escapeHtml(String(value ?? ''))}" autocomplete="off"${disabled}${attrs} /></label>`;
  return `<article class="card" data-schedule-row="${index}">
    <h3>Yeni ders ${index + 1}</h3>
    <div class="grid-form">
      <label>Gün <select data-schedule-field="dayOfWeek">${dayOptions}</select></label>
      <label>Başlangıç <input data-schedule-field="startTime" type="time" value="${escapeHtml(String(row?.startTime ?? '09:00'))}"${disabled} /></label>
      <label>Bitiş <input data-schedule-field="endTime" type="time" value="${escapeHtml(String(row?.endTime ?? '09:40'))}"${disabled} /></label>
      ${input('teacherId', 'Öğretmen kimliği', row?.teacherId)}
      ${input('teacherBranchId', 'Öğretmen görevlendirme kimliği', row?.teacherBranchId)}
      ${input('studentGroupId', 'Sınıf kimliği', row?.studentGroupId)}
      ${input('courseId', 'Ders kimliği', row?.courseId)}
      ${input('roomId', 'Derslik kimliği', row?.roomId)}
      ${input('timeSlotId', 'Zaman dilimi kimliği', row?.timeSlotId)}
    </div>
    <div class="quick-actions" role="group">
      <button type="button" data-action="schedule-row-remove" data-schedule-index="${index}"${disabled}>Satırı sil</button>
    </div>
  </article>`;
}

function renderScheduleEditor() {
  const container = $('#schedule-editor');
  const addButton = $('#add-schedule-event');
  const saveButton = $('#save-schedule-draft');
  const list = $('#schedule-events');
  // 428'de editör gizlenir; 412'de görünür ama tüm kontroller disabled kalır.
  const visible = canEditSchedule() && state.scheduleVersionState !== 'version_required';
  container.classList.toggle('hidden', !visible);
  if (!visible) {
    list.innerHTML = '';
    addButton.disabled = true;
    saveButton.disabled = true;
    return;
  }
  const locked = scheduleMutationLocked();
  const disabled = locked ? ' disabled' : '';
  const rows = state.scheduleRows || [];
  list.innerHTML = rows.length
    ? rows.map((row, index) => scheduleRowMarkup(row, index, disabled)).join('')
    : '<p class="hint">Kaydedilmemiş ders yok; "Ders ekle" ile ekleyin.</p>';
  addButton.disabled = locked;
  saveButton.disabled = locked || !state.scheduleDirty;
  saveButton.setAttribute('aria-describedby', 'schedule-gate');
}

// #451 — bir bulgu, ait olduğu güne ve kendi kanonik durumuna ait kalır;
// başka bir bulguyla birleşmez. Çakışan ders (conflictingEventId) isme
// bağlanır; ham kimlikler yalnız data-* teşhis kanalında yaşar.
function findEventById(id) {
  const wanted = String(id ?? '').trim();
  if (!wanted) return null;
  const events = Array.isArray(state.scheduleEvents) ? state.scheduleEvents : [];
  return events.find((ev) => String(ev?.eventId ?? '') === wanted) ?? null;
}

function findingDayKey(reason) {
  const ownEvent = reason?.eventId ? findEventById(reason.eventId) : null;
  const asDay = (ev) => Number(ev?.dayOfWeek);
  if (ownEvent && Number.isInteger(asDay(ownEvent))) return asDay(ownEvent);
  const conflictEvent = reason?.conflictingEventId ? findEventById(reason.conflictingEventId) : null;
  if (conflictEvent && Number.isInteger(asDay(conflictEvent))) return asDay(conflictEvent);
  return 'genel';
}

function conflictLessonMarkup(conflictingEventId) {
  const conflictEvent = findEventById(conflictingEventId);
  if (!conflictEvent) return '<span class="finding-conflict">Çakıştığı kayıt bulunamadı.</span>';
  const when = `${programmeDayLabel(conflictEvent?.dayOfWeek)} ${programmeTime(conflictEvent?.startTime)}–${programmeTime(conflictEvent?.endTime)}`;
  return `<span class="finding-conflict">Çakıştığı ders: <button type="button" class="linklike" data-action="schedule-conflict-show" data-event-id="${escapeHtml(String(conflictEvent?.eventId ?? ''))}">${escapeHtml(when)}</button></span>`;
}

function renderConflictResolution(reasons) {
  const target = $('#schedule-conflicts');
  if (!target) return;
  const list = Array.isArray(reasons) ? reasons : [];
  if (!list.length) {
    target.innerHTML = '';
    return;
  }
  const groups = new Map();
  for (const reason of list) {
    const key = findingDayKey(reason);
    const bucket = groups.get(key) ?? [];
    bucket.push(reason);
    groups.set(key, bucket);
  }
  const dayKeys = PROGRAMME_DAY_ORDER.filter((day) => groups.has(day));
  const orderedKeys = groups.has('genel') ? [...dayKeys, 'genel'] : dayKeys;
  const renderItems = (items) => `<ul class="findings-list">${items.map((r) => {
    const code = pick(r, ['code'], '');
    const label = displayTerm(scheduleReasonLabels, code, 'Çözülmesi gereken bir bulgu');
    const reasonState = scheduleReasonState(code);
    const eventId = pick(r, ['eventId'], '');
    const conflictingEventId = pick(r, ['conflictingEventId'], '');
    return `<li data-schedule-reason="${escapeHtml(code)}" data-state="${escapeHtml(reasonState)}" class="finding-item">
      <span class="finding-label">${escapeHtml(label)}</span>
      ${conflictingEventId ? conflictLessonMarkup(conflictingEventId) : ''}
      ${eventId ? `<button type="button" class="finding-show" data-action="schedule-conflict-show" data-event-id="${escapeHtml(String(eventId))}">Göster</button>` : ''}
    </li>`;
  }).join('')}</ul>`;
  const renderGroup = (key) => {
    const items = groups.get(key);
    const isGenel = key === 'genel';
    const title = isGenel ? 'Genel' : programmeDayLabel(key);
    return `<section class="findings-day" data-finding-day="${isGenel ? 'genel' : String(key)}" data-finding-count="${items.length}">
      <h4>${escapeHtml(title)} · ${escapeHtml(String(items.length))} bulgu</h4>
      ${renderItems(items)}
    </section>`;
  };
  target.innerHTML = `<article class="card findings-card">
    <h3>Doğrulama bulguları</h3>
    <p class="hint">Çakışmalar elle çözülür: etkilenen dersi kontrol edip düzenleyin.</p>
    ${orderedKeys.map(renderGroup).join('')}
  </article>`;
}

// #451 — tam doğrulamanın koşu özeti: mod, kanıt durumu, yayın izni, revizyon,
// parmak izi ve yayın engelleyici çatışma sayısı. Kısmi doğrulama asla yayın
// kanıtı gibi çizilmez; editör geri bildirimi olarak etiketlenir.
function renderValidationSummary(evidence) {
  const target = $('#schedule-validation-summary');
  if (!target) return;
  if (!evidence) {
    resetValidationSummary();
    return;
  }
  const mode = String(evidence.mode ?? '').trim().toUpperCase() || 'UNKNOWN';
  const evidenceStatus = String(evidence.evidenceStatus ?? '').trim() || 'unknown';
  const authoritative = mode === 'FULL' && evidenceStatus === 'authoritative';
  const canPublish = evidence.canPublish === true;
  const revisionRaw = Number(evidence.scheduleRevision);
  const revision = Number.isFinite(revisionRaw) ? String(revisionRaw) : 'bilinmiyor';
  const conflictRaw = Number(evidence.hardConflictCount);
  const conflicts = Number.isFinite(conflictRaw) ? String(Math.max(0, conflictRaw)) : 'bilinmiyor';
  const fingerprint = String(evidence.inputFingerprint ?? '').trim();
  const publishability = authoritative ? (canPublish ? 'Evet' : 'Hayır') : 'Yayın kanıtı değil';
  target.hidden = false;
  target.classList.remove('hidden');
  target.dataset.mode = mode;
  target.dataset.evidenceStatus = evidenceStatus;
  target.dataset.publishability = authoritative ? (canPublish ? 'yes' : 'no') : 'not_evidence';
  const modeLabel = mode === 'FULL' ? 'Tam doğrulama' : mode === 'INCREMENTAL' ? 'Kısmi doğrulama' : 'Bilinmiyor';
  const statusLabel = authoritative ? 'Güncel' : 'Editör geri bildirimi';
  target.innerHTML = `<article class="validation-summary${authoritative ? '' : ' validation-summary-editor-feedback'}">
    <h3>Doğrulama özeti</h3>
    ${authoritative
      ? ''
      : '<p class="editor-feedback-note" role="note">Kısmi doğrulama çalıştı (editör geri bildirimi); bu sonucun yayın kararı değildir.</p>'}
    <dl class="validation-summary-grid">
      <div><dt>Doğrulama:</dt><dd>${escapeHtml(modeLabel)}</dd></div>
      <div><dt>Kanıt durumu:</dt><dd>${escapeHtml(statusLabel)}</dd></div>
      <div><dt>Yayın izni:</dt><dd>${escapeHtml(publishability)}</dd></div>
      <div><dt>Revizyon:</dt><dd>${escapeHtml(revision)}</dd></div>
      <div><dt>Kanıt parmak izi:</dt><dd class="fingerprint">${fingerprint ? escapeHtml(fingerprint) : 'bilinmiyor'}</dd></div>
      <div><dt>Yayın engelleyici çatışma:</dt><dd>${escapeHtml(conflicts)}</dd></div>
    </dl>
  </article>`;
}

function resetValidationSummary() {
  const target = $('#schedule-validation-summary');
  if (!target) return;
  target.hidden = true;
  target.classList.add('hidden');
  target.innerHTML = '';
  delete target.dataset.mode;
  delete target.dataset.evidenceStatus;
  delete target.dataset.publishability;
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
  state.scheduleIfMatch = '';
  state.scheduleVersionState = '';
  state.scheduleBaseline = '[]';
  state.scheduleEditingEventId = '';
  state.scheduleEditOriginal = null;
  state.scheduleDay = 1;
  // #451 — önceki programın kanıt özeti yeni kapsamda güncel gibi görünmesin.
  resetValidationSummary();
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
  const revision = serverRevision(read?.revision);
  state.scheduleRead = read ?? null;
  state.scheduleId = String(read?.scheduleId ?? scheduleId);
  state.scheduleRevision = revision;
  state.scheduleEvents = readEventsFromRead(read);
  state.scheduleRows = [];
  state.scheduleEvidence = null;
  state.scheduleDirty = false;
  state.scheduleEditingEventId = '';
  state.scheduleEditOriginal = null;
  resetValidationSummary();
  // GET ETag'i content-addressed'dir; `If-Match` yalnız gövdedeki sunucu
  // revision'ından kurulur. Sunucu vermediyse istemci sürüm uydurmaz.
  state.scheduleIfMatch = mutationToken(state.scheduleId, revision);
  state.scheduleVersionState = (!read?.readOnly && read?.status !== 'published' && !state.scheduleIfMatch)
    ? 'version_required' : '';
  state.scheduleBaseline = JSON.stringify(stagedEventsAsDraft());
  state.scheduleDay = pickDefaultDay(state.scheduleEvents, state.scheduleDay);
  renderConflictResolution([]);
  renderProgramme();
  return read;
}

// Sahnelenen ekleme/düzenleme/silme her liste/detay yenilemesinde kaybolur;
// sekme geçişi ve seçici değişimi de dahil her yeniden yükleme yolu aynı
// soruyu sorar.
function confirmDiscardRows(message) {
  if (state.scheduleDirty && typeof confirm === 'function') {
    return confirm(message);
  }
  return true;
}

function keepReadSurfaceOnOfflineFailure(target, error) {
  renderError(target, error);
  // #451 — kanıt özeti yeni bir kapsama ait değil; yine de güncel sayılmaz.
  resetValidationSummary();
  renderAgenda();
  renderGate();
  renderScheduleActions();
  renderScheduleEditor();
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
  const hasLoaded = Boolean(state.scheduleRead?.scheduleId);
  try {
    const { candidates, failures } = await loadProgrammeList();
    if (candidates.length === 0 && failures.length > 0) {
      if (hasLoaded && failures.some((failure) => failure?.status === 0)) {
        keepReadSurfaceOnOfflineFailure(target, failures[0]);
        return;
      }
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
    if (hasLoaded && error?.status === 0) {
      keepReadSurfaceOnOfflineFailure(target, error);
      return;
    }
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

function renderScheduleWorkSurfaces() {
  renderDayStrip();
  renderAgenda();
  renderGate();
  renderScheduleActions();
  renderScheduleEditor();
}

function openScheduleEventEditor(eventId) {
  if (!canEditSchedule() || scheduleMutationLocked()) return;
  const index = findEventIndex(eventId);
  if (index < 0) return;
  state.scheduleEditingEventId = String(eventId);
  state.scheduleEditOriginal = { ...state.scheduleEvents[index] };
  renderAgenda();
}

function applyScheduleEventField(eventId, field, value) {
  if (!canEditSchedule() || scheduleMutationLocked() || !field) return;
  const index = findEventIndex(eventId);
  if (index < 0) return;
  state.scheduleEvents[index] = { ...state.scheduleEvents[index], [field]: value };
  invalidateScheduleEvidence();
  recomputeScheduleDirty();
  renderGate();
  renderScheduleActions();
}

function commitScheduleEventEdit() {
  if (!state.scheduleEditingEventId) return;
  state.scheduleEditingEventId = '';
  state.scheduleEditOriginal = null;
  renderScheduleWorkSurfaces();
}

function cancelScheduleEventEdit() {
  if (!state.scheduleEditingEventId) return;
  const index = findEventIndex(state.scheduleEditingEventId);
  if (index >= 0 && state.scheduleEditOriginal) {
    state.scheduleEvents[index] = { ...state.scheduleEditOriginal };
  }
  state.scheduleEditingEventId = '';
  state.scheduleEditOriginal = null;
  invalidateScheduleEvidence();
  recomputeScheduleDirty();
  renderScheduleWorkSurfaces();
}

function removeScheduleEvent(eventId) {
  if (!canEditSchedule() || scheduleMutationLocked()) return;
  const index = findEventIndex(eventId);
  if (index < 0) return;
  state.scheduleEvents.splice(index, 1);
  if (state.scheduleEditingEventId === String(eventId)) {
    state.scheduleEditingEventId = '';
    state.scheduleEditOriginal = null;
  }
  invalidateScheduleEvidence();
  recomputeScheduleDirty();
  renderScheduleWorkSurfaces();
  announce('Ders ajandadan kaldırıldı; taslağı kaydedin.', 'success');
}

function addScheduleEvent() {
  if (!canEditSchedule()) {
    announce('Bu programda ders ekleyemezsiniz.', 'warning');
    return;
  }
  if (isOffline()) {
    announce('Bağlantı yok; ders eklenemez.', 'warning');
    return;
  }
  if (state.scheduleVersionState) {
    announce(SCHEDULE_VERSION_COPY[state.scheduleVersionState].message, 'warning');
    return;
  }
  // #452 — seçili gün hafta sonu da olsa kullanılır; sessizce Pazartesi'ye düşmez.
  const day = Number(state.scheduleDay);
  const selectedDay = Number.isInteger(day) && day >= 0 && day <= 6 ? day : 1;
  state.scheduleRows.push({
    eventId: newEventId(),
    teacherId: '',
    teacherBranchId: '',
    studentGroupId: '',
    courseId: '',
    roomId: '',
    timeSlotId: '',
    dayOfWeek: String(selectedDay),
    startTime: '09:00',
    endTime: '09:40',
  });
  invalidateScheduleEvidence();
  recomputeScheduleDirty();
  renderScheduleWorkSurfaces();
  announce('Yeni ders satırı eklendi.', 'success');
}

function removeScheduleRow(index) {
  if (scheduleMutationLocked() || !Array.isArray(state.scheduleRows) || !state.scheduleRows[index]) return;
  state.scheduleRows.splice(index, 1);
  invalidateScheduleEvidence();
  recomputeScheduleDirty();
  renderScheduleWorkSurfaces();
}

function handleScheduleRowInput(event) {
  const target = event && event.target;
  const field = target && target.dataset ? target.dataset.scheduleField : undefined;
  if (!field) return;
  const editId = target.dataset.scheduleEditEventId;
  if (editId) {
    applyScheduleEventField(editId, field, target.value);
    return;
  }
  if (scheduleMutationLocked()) return;
  const rowEl = target.closest ? target.closest('[data-schedule-row]') : null;
  const index = rowEl ? Number(rowEl.dataset.scheduleRow) : NaN;
  if (!Number.isInteger(index) || !state.scheduleRows[index]) return;
  state.scheduleRows[index] = { ...state.scheduleRows[index], [field]: target.value };
  invalidateScheduleEvidence();
  recomputeScheduleDirty();
  renderGate();
  renderScheduleActions();
}

function enterScheduleVersionLock(uiState) {
  const lock = uiState === 'version_required' ? 'version_required' : 'stale_version';
  state.scheduleVersionState = lock;
  if (lock === 'version_required') {
    state.scheduleIfMatch = '';
    state.scheduleEditingEventId = '';
    state.scheduleEditOriginal = null;
  }
  state.scheduleEvidence = null;
  resetValidationSummary();
  renderProgramme();
}

function handleScheduleMutationError(target, error) {
  if (isScheduleVersionError(error)) {
    enterScheduleVersionLock(error.uiState);
    announce(SCHEDULE_VERSION_COPY[state.scheduleVersionState].message, 'warning');
    return;
  }
  renderError(target, error);
  // #532 — 429 cooldown'u aynı anda kontrollere yansısın; hata yüzeyi
  // çizildiğinde butonlar hâlâ açık görünmesin.
  if (error?.uiState === 'rate_limited') renderScheduleWorkSurfaces();
}

async function saveScheduleDraft() {
  if (!requireSession()) return;
  if (!canEditSchedule()) {
    announce('Bu programda taslak kaydedemezsiniz.', 'warning');
    return;
  }
  if (mutationDisabled()) {
    announce(isOffline()
      ? 'Bağlantı yok; taslak kaydedilemez.'
      : 'Çok fazla istek; kısa bir süre sonra tekrar deneyin.', 'warning');
    return;
  }
  if (state.scheduleVersionState) {
    announce(SCHEDULE_VERSION_COPY[state.scheduleVersionState].message, 'warning');
    return;
  }
  if (!state.scheduleIfMatch) {
    enterScheduleVersionLock('version_required');
    announce(SCHEDULE_VERSION_COPY.version_required.message, 'warning');
    return;
  }
  if (!state.scheduleDirty) {
    announce('Kaydedilecek değişiklik yok.', 'warning');
    return;
  }
  // Tek yazma yolu: tüm çalışma kopyası tek If-Match ile gönderilir.
  const events = stagedEventsAsDraft();
  const message = programmeRowValidationMessage(events);
  if (message) {
    announce(message, 'warning');
    return;
  }
  const target = $('#schedule-status');
  target.innerHTML = loading('Taslak kaydediliyor');
  try {
    await apiRequest(`/schedules/${encodeURIComponent(state.scheduleId)}/draft`, {
      method: 'POST',
      headers: { 'If-Match': mutationIfMatch() },
      body: { branchId: getBranchId(), events },
    });
    try {
      await loadScheduleDetail(state.scheduleId);
      announce('Taslak kaydedildi.', 'success');
    } catch (readError) {
      // Yazma başarılı ama yeni revision okunamadı: sürüm uydurmadan kilitle.
      state.scheduleVersionState = 'version_required';
      state.scheduleIfMatch = '';
      state.scheduleEditingEventId = '';
      state.scheduleEditOriginal = null;
      renderProgramme();
      announce('Taslak kaydedildi ancak güncel sürüm alınamadı; yenileyin.', 'warning');
    }
  } catch (error) {
    handleScheduleMutationError(target, error);
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
  if (state.scheduleVersionState) {
    announce(SCHEDULE_VERSION_COPY[state.scheduleVersionState].message, 'warning');
    return;
  }
  if (mutationDisabled()) {
    announce(isOffline()
      ? 'Bağlantı yok; doğrulama çalıştırılamaz.'
      : 'Çok fazla istek; kısa bir süre sonra tekrar deneyin.', 'warning');
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
    const partial = !(state.scheduleEvidence?.mode === 'FULL'
      && state.scheduleEvidence?.evidenceStatus === 'authoritative');
    const canPublish = canPublishNow();
    renderConflictResolution(asArray(state.scheduleEvidence, ['reasons']));
    renderValidationSummary(state.scheduleEvidence);
    renderScheduleStatus();
    renderGate();
    renderScheduleActions();
    announce(canPublish
      ? 'Doğrulama geçti; yayınlanabilir.'
      : partial
        ? 'Kısmi doğrulama; yayın için tam doğrulama gerekli.'
        : 'Doğrulama yayın engelleri buldu.', canPublish ? 'success' : 'warning');
  } catch (error) {
    if (isScheduleVersionError(error)) {
      handleScheduleMutationError(target, error);
      renderConflictResolution([]);
      return;
    }
    renderError(target, error);
    renderConflictResolution([]);
    // #532 — doğrulama 429 ile dönerse kontroller bekleme boyunca kapansın.
    if (error?.uiState === 'rate_limited') renderScheduleWorkSurfaces();
    else resetValidationSummary();
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
  if (state.scheduleVersionState) {
    announce(SCHEDULE_VERSION_COPY[state.scheduleVersionState].message, 'warning');
    return;
  }
  if (mutationDisabled()) {
    announce(isOffline()
      ? 'Bağlantı yok; yayınlanamaz.'
      : 'Çok fazla istek; kısa bir süre sonra tekrar deneyin.', 'warning');
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
    resetValidationSummary();
    announce('Çizelge yayınlandı.', 'success');
  } catch (error) {
    handleScheduleMutationError(target, error);
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
  const action = button.dataset.action;
  if (action === 'schedule-row-remove') removeScheduleRow(Number(button.dataset.scheduleIndex));
  if (action === 'schedule-event-edit') openScheduleEventEditor(button.dataset.eventId);
  if (action === 'schedule-event-delete') removeScheduleEvent(button.dataset.eventId);
  if (action === 'schedule-event-edit-save') commitScheduleEventEdit();
  if (action === 'schedule-event-edit-cancel') cancelScheduleEventEdit();
  if (button.dataset.action === 'schedule-conflict-show') {
    const id = String(button.dataset.eventId ?? '');
    if (id) {
      try {
        let el = document.querySelector(`[data-schedule-event="${id}"]`);
        if (!el) {
          const ev = findEventById(id);
          if (ev && Number.isInteger(Number(ev?.dayOfWeek))) {
            state.scheduleDay = Number(ev.dayOfWeek);
            renderDayStrip();
            renderAgenda();
            el = document.querySelector(`[data-schedule-event="${id}"]`);
          }
        }
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
$('#schedule-agenda').addEventListener('input', handleScheduleRowInput);
$('#schedule-agenda').addEventListener('change', handleScheduleRowInput);

// #452 — bağlantı durumu değişince yalnız yüzey yeniden çizilir; otomatik
// yazma/okuma isteği yoktur (kullanıcı manuel yeniler).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('offline', () => {
    state.isOffline = true;
    if (state.scheduleRead?.scheduleId && typeof renderProgramme === 'function') renderProgramme();
  });
  window.addEventListener('online', () => {
    state.isOffline = false;
    if (state.scheduleRead?.scheduleId && typeof renderProgramme === 'function') renderProgramme();
  });
}

registerTabActivationHook('program', loadProgramme);
