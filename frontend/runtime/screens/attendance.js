'use strict';

// #442 screen module — yoklama (attendance). Paylaşılan state, apiRequest ve
// hata normalizasyonu core'da (app.js); oturum açma, kayıt işaretleme, lock
// ve kontrollü düzeltme akışı bu modüle aittir.

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
    if (rows.length) {
      target.innerHTML = rows.map(renderAttendanceSessionCard).join('');
    } else {
      empty(target, 'attendance');
    }
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
      <span>${roster.length ? `Öğrenci: ${roster.length}` : 'Öğrenci yok'}</span>
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
  const muted = mutationDisabled();
  const rosterRows = roster.map((studentId, index) => `<li>
    <strong>Öğrenci ${index + 1}</strong>
    ${locked
      ? `<button type="button" data-action="attendance-correct" data-student-id="${escapeHtml(studentId)}" data-session-version="${version}" ${muted ? 'disabled' : ''}>Kontrollü düzeltme</button>`
      : `<span class="quick-actions">
          ${['present', 'absent', 'late', 'excused'].map((mark) => `<button type="button" data-action="attendance-mark" data-session-id="${escapeHtml(sessionId)}" data-student-id="${escapeHtml(studentId)}" data-mark="${mark}" ${muted ? 'disabled' : ''}>${escapeHtml(displayStatus(mark))}</button>`).join('')}
        </span>`}
  </li>`).join('');
  const actions = locked
    ? '<p class="hint">Oturum kilitli; kayıtlar kontrollü düzeltme (gözetim) akışıyla değişir.</p>'
    : `<button type="button" data-action="attendance-lock" data-session-id="${escapeHtml(sessionId)}" data-session-version="${version}" ${muted ? 'disabled' : ''}>Oturumu kilitle ve devamsızlıkları kuyruğa al</button>`;
  $('#attendance-detail').innerHTML = `<article class="card">
    <h3>Yoklama · ${escapeHtml(displayStatus(status))} · Sürüm ${escapeHtml(version)}</h3>
    <p>${roster.length ? `Roster: ${roster.length} öğrenci` : 'Roster boş'}</p>
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
});

$('#attendance-generate-form').addEventListener('submit', generateAttendance);
$('#refresh-attendance').addEventListener('click', loadAttendanceSessions);
