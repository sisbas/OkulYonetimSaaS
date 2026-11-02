'use strict';

// #442 screen module — yoklama (attendance). Paylaşılan state, apiRequest ve
// hata normalizasyonu core'da (app.js); oturum açma, kayıt işaretleme, lock
// ve kontrollü düzeltme akışı bu modüle aittir.

// #492 — beşinci durum "işaretlenmedi" bir kayıt DEĞİLDİR: kaydın yokluğudur.
// Bu yüzden POST edilen dört işaret ayrı tutulur; "işaretlenmedi" yalnız
// görüntüleme/özet durumudur (dürüst kopya: işaretlenmemiş devamsız sayılmaz).
const ATTENDANCE_MARKS = ['present', 'absent', 'late', 'excused'];

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

/**
 * #492 — oturum tamamlanma durumu.
 *
 * K-50: "tamamlama = kilitleme". Kilitli oturum TAMAMLANMIŞ sayılır; kilitli
 * olmayan (taslak/işaretleniyor) oturum EKSİK sayılır. Bu ayrım renk tek
 * başına değil, metinle ve `data-attendance-state` ile bildirilir.
 */
function attendanceCompletion(session) {
  const status = String(pick(session, ['status'], 'draft')).toLowerCase();
  if (status === 'locked') {
    return { key: 'complete', label: 'Tamamlanmış', tone: 'success' };
  }
  return { key: 'incomplete', label: 'Eksik', tone: 'warning' };
}

function attendanceCompletionBadge(session) {
  const completion = attendanceCompletion(session);
  return `<span class="tag" data-tone="${escapeHtml(completion.tone)}" data-attendance-state="${escapeHtml(completion.key)}">${escapeHtml(completion.label)}</span>`;
}

function applyAttendanceFilter() {
  const rows = Array.isArray(state.attendanceSessions) ? state.attendanceSessions : [];
  const filter = state.attendanceStatusFilter || '';
  const visible = filter ? rows.filter((session) => attendanceCompletion(session).key === filter) : rows;
  const target = $('#attendance-sessions');
  if (!rows.length) {
    empty(target, 'attendance');
    return;
  }
  if (!visible.length) {
    renderRegionState(
      target,
      'same_scope_empty',
      filter === 'incomplete' ? 'Bu kapsamda eksik oturum yok.' : 'Bu kapsamda tamamlanmış oturum yok.',
      'Yoklama oturumu yok',
    );
    return;
  }
  // Dürüst sayım: filtrelenen liste "tüm liste" gibi sunulmaz.
  target.innerHTML = `<p class="hint" id="attendance-session-count">${visible.length} / ${rows.length} oturum gösteriliyor</p>` +
    visible.map(renderAttendanceSessionCard).join('');
}

async function loadAttendanceSessions() {
  if (!requireSession()) return;
  const target = $('#attendance-sessions');
  target.innerHTML = loading('Yoklama oturumları getiriliyor');
  try {
    const { body } = await apiRequest('/attendance/sessions');
    state.attendanceSessions = asArray(body, ['sessions', 'items']);
    applyAttendanceFilter();
  } catch (error) {
    renderError(target, error);
  }
}

function setAttendanceFilter(nextFilter) {
  state.attendanceStatusFilter = nextFilter;
  document.querySelectorAll('#attendance-status-filter .chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String((chip.dataset.attendanceStatus || '') === nextFilter));
  });
}

function renderAttendanceSessionCard(session) {
  const sessionId = pick(session, ['id']);
  const roster = asArray(session, ['rosterSnapshot', 'roster']);
  const completion = attendanceCompletion(session);
  return `<article class="card" data-attendance-state="${escapeHtml(completion.key)}">
    <h3>Yoklama oturumu ${attendanceCompletionBadge(session)}</h3>
    <p class="card-meta">
      <span>${escapeHtml(formatStamp(pick(session, ['sessionDate'], '')))}</span>
      <span>Sürüm: ${escapeHtml(pick(session, ['version'], 0))}</span>
      <span>${roster.length ? `Öğrenci: ${roster.length}` : 'Öğrenci yok'}</span>
    </p>
    <p class="hint">${completion.key === 'complete'
      ? 'Tamamlanmış oturum kilitlidir; kayıtlar yalnız kontrollü düzeltme ile değişir.'
      : 'Eksik oturum: işaretleme tamamlanınca oturum kilitlenir.'}</p>
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
  const muted = mutationDisabled();
  // Kullanılabilirlik yakınsaması (#445): işaretleme/kilitleme/düzeltme
  // düğmeleri yalnızca aktörün izin anahtarının tabloda bulunduğu
  // istikametler için çizilir; zorlama yine sunucu @Permissions guard'ındadır.
  const canMark = canRequest('POST', `/attendance/sessions/${encodeURIComponent(sessionId)}/records`);
  const canLock = canRequest('POST', `/attendance/sessions/${encodeURIComponent(sessionId)}/lock`);
  const marked = new Map();
  asArray(session, ['records', 'recordRows']).forEach((record) => {
    const studentId = pick(record, ['studentId']);
    if (studentId) marked.set(String(studentId), String(pick(record, ['status'], '')));
  });
  const notMarkedIds = roster.filter((studentId) => !marked.has(String(studentId)));
  const rosterRows = roster.map((studentId, index) => {
    const current = marked.get(String(studentId)) || '';
    return `<li>
    <strong>Öğrenci ${index + 1}</strong>
    <span class="tag" data-tone="${escapeHtml(statusTone(current || 'unmarked'))}" data-mark-state="${escapeHtml(current || 'unmarked')}">${escapeHtml(current ? displayStatus(current) : 'İşaretlenmedi')}</span>
    ${locked
      ? canRequest('POST', `/attendance/sessions/${encodeURIComponent(sessionId)}/records/${encodeURIComponent(studentId)}/correction`)
        ? `<button type="button" data-action="attendance-correct" data-student-id="${escapeHtml(studentId)}" data-session-version="${version}" ${muted ? 'disabled' : ''}>Kontrollü düzeltme</button>`
        : '<span class="hint">Oturum kilitli; düzeltme yetkiniz kapsamında değil.</span>'
      : canMark
        ? `<span class="quick-actions">
            ${ATTENDANCE_MARKS.map((mark) => `<button type="button" data-action="attendance-mark" data-session-id="${escapeHtml(sessionId)}" data-student-id="${escapeHtml(studentId)}" data-mark="${mark}" aria-pressed="${current === mark}" ${muted ? 'disabled' : ''}>${escapeHtml(displayStatus(mark))}</button>`).join('')}
          </span>`
        : '<span class="hint">Kayıt görüntüleniyor; işaretleme yetkiniz kapsamında değil.</span>'}
  </li>`;
  }).join('');
  const actions = locked
    ? '<p class="hint" data-lock-state="locked">Oturum kilitli (tamamlanmış); kayıtlar kontrollü düzeltme (gözetim) akışıyla değişir.</p>'
    : `<div class="quick-actions">
        ${canMark && notMarkedIds.length
          ? `<button type="button" data-action="attendance-bulk-present" data-session-id="${escapeHtml(sessionId)}" data-pending-count="${notMarkedIds.length}" ${muted ? 'disabled' : ''}>Toplu geldi (${notMarkedIds.length})</button>`
          : ''}
        <button type="button" data-action="attendance-lock" data-session-id="${escapeHtml(sessionId)}" data-session-version="${version}" ${muted ? 'disabled' : ''}>Tamamla ve kilitle</button>
      </div>
      <p class="hint" data-lock-state="open">Tamamlamak = kilitlemek (K-50). Kilitlenince devamsızlık bildirimleri kuyruğa alınır ve kayıtlar yalnız kontrollü düzeltme ile değişir.</p>`;
  $('#attendance-detail').innerHTML = `<article class="card" data-state="${locked ? 'locked_state' : 'ready'}">
    <h3>Yoklama · ${escapeHtml(displayStatus(status))} ${attendanceCompletionBadge(session)} · Sürüm ${escapeHtml(version)}</h3>
    <p>${roster.length ? `Roster: ${roster.length} öğrenci` : 'Roster boş'}</p>
    <ul class="impact-list">${rosterRows || '<li>Roster yok.</li>'}</ul>
    ${canLock ? actions : '<p class="hint">Kilitleme yetkiniz kapsamında değil; kayıtlar yalnızca görüntülenir.</p>'}
  </article>`;
  renderAttendanceAbsences(session, roster, marked);
}

/**
 * #492 — devamsızlık sonuçları.
 *
 * Dürüst kopya: İŞARETLENMEMİŞ öğrenci devamsız SAYILMAZ. Sonuç yalnız açıkça
 * `absent` işaretlenen öğrencilerden oluşur; işaretlenmemişler ayrı bir sayı
 * olarak görünür ve "devamsız" listesine karışmaz.
 */
function renderAttendanceAbsences(session, roster, marked) {
  const target = $('#attendance-absences');
  if (!target) return;
  const absentIds = roster.filter((studentId) => marked.get(String(studentId)) === 'absent');
  const notMarkedIds = roster.filter((studentId) => !marked.has(String(studentId)));
  const counts = ATTENDANCE_MARKS.map((mark) => {
    const count = [...marked.values()].filter((value) => value === mark).length;
    return `${displayStatus(mark)}: ${count}`;
  }).join(' · ');
  target.innerHTML = `<article class="card" data-absence-summary>
    <h3>Devamsızlık sonuçları ${attendanceCompletionBadge(session)}</h3>
    <p class="card-meta"><span>${escapeHtml(counts)}</span><span>İşaretlenmedi: ${notMarkedIds.length}</span></p>
    <p>Devamsız sayısı: <strong data-absent-count="${absentIds.length}">${absentIds.length}</strong></p>
    <p class="hint" data-not-marked-copy>İşaretlenmemiş öğrenci devamsız sayılmaz; yalnız açıkça "Gelmedi" işaretlenen kayıtlar devamsızlık sonucuna girer.</p>
    ${absentIds.length
      ? `<ul class="impact-list">${absentIds.map((studentId) => {
          const ordinal = roster.indexOf(studentId) + 1;
          return `<li>Öğrenci ${escapeHtml(ordinal)} · Gelmedi</li>`;
        }).join('')}</ul>`
      : '<p class="hint">Bu oturumda açıkça devamsız işaretlenen öğrenci yok.</p>'}
  </article>`;
}

/**
 * #492 — "Toplu geldi".
 *
 * Yalnız HENÜZ işaretlenmemiş öğrencilere uygulanır (mevcut işaretler sessizce
 * ezilmez). Sunucuda toplu uç olmadığı için kayıtlar sırayla yazılır; bir hata
 * olursa akış durur ve kalan sayı DÜRÜSTÇE bildirilir (kısmi başarı "tamam"
 * gibi sunulmaz).
 */
async function bulkPresent(sessionId) {
  if (!requireSession()) return;
  const target = $('#attendance-detail');
  let remaining = [];
  try {
    const { body } = await apiRequest(`/attendance/sessions/${encodeURIComponent(sessionId)}/records`);
    const roster = asArray(body, ['rosterSnapshot', 'roster']);
    const marked = new Set(asArray(body, ['records', 'recordRows']).map((record) => String(pick(record, ['studentId'], ''))));
    remaining = roster.map(String).filter((studentId) => !marked.has(studentId));
  } catch (error) {
    renderError(target, error);
    return;
  }
  if (!remaining.length) return announce('Toplu geldi için işaretlenmemiş öğrenci yok.', 'neutral');
  let written = 0;
  for (const studentId of remaining) {
    try {
      await apiRequest(`/attendance/sessions/${encodeURIComponent(sessionId)}/records`, {
        method: 'POST',
        body: { studentId, status: 'present' },
      });
      written += 1;
    } catch (error) {
      announce(`Toplu geldi kısmen uygulandı: ${written}/${remaining.length}. Kalanlar için yeniden deneyin.`, 'warning');
      await openAttendanceSession(sessionId);
      return;
    }
  }
  announce(`Toplu geldi uygulandı: ${written}/${remaining.length} öğrenci.`, 'success');
  await openAttendanceSession(sessionId);
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
      versioned: true,
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
      versioned: true,
    });
    announce('Kontrollü düzeltme tamamlandı.', 'success');
    await openAttendanceSession(state.activeAttendanceSessionId);
  } catch (error) {
    renderError(target, error);
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.action === 'attendance-open') openAttendanceSession(target.dataset.sessionId);
  if (target.dataset.action === 'attendance-mark') markAttendance(target.dataset.sessionId, target.dataset.studentId, target.dataset.mark);
  if (target.dataset.action === 'attendance-lock') lockAttendance(target.dataset.sessionId, target.dataset.sessionVersion);
  if (target.dataset.action === 'attendance-correct') correctAttendance(target.dataset.studentId, target.dataset.sessionVersion);
  if (target.dataset.action === 'attendance-bulk-present') bulkPresent(target.dataset.sessionId);
  if (target.dataset.action === 'attendance-filter') setAttendanceFilter(target.dataset.attendanceStatus || '');
  if (target.dataset.action === 'attendance-filter' && target.classList.contains('chip')) applyAttendanceFilter();
});

$('#attendance-generate-form').addEventListener('submit', generateAttendance);
$('#refresh-attendance').addEventListener('click', loadAttendanceSessions);
