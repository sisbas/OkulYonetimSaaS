'use strict';

// #489 screen module — Bugün. Mock-up frontend/design/bugun.html portu:
// istatistik şeridi + izin-projeksiyonu kuyruğu + ikincil bugün yoklama
// oturumları + aktör kesitleri. Tüm bölge durumları tek yoldan: renderRegionState
// (K-40/K-41), fail-closed izin kapısı (#445) ve EMPTY_COPY / renderError
// seam'leri korunur.

function bugunTodayQuery() {
  const query = new URLSearchParams({ branchId: getBranchId() });
  if (state.date) query.set('date', state.date);
  return query.toString();
}

function bugunToDay(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function bugunQueueInfo(item) {
  const coverageStatus = pick(item, ['coverageStatus'], 'unresolved');
  const assigned = Boolean(String(pick(item, ['substituteAssignmentId'], '') || pick(item, ['assignmentStatus'], '') || '').trim());
  const unresolved = coverageStatus === 'unresolved' || coverageStatus === 'open';
  const covered = coverageStatus === 'covered';
  const partiallyCovered = coverageStatus === 'partially_covered';
  const notRequired = coverageStatus === 'not_required';
  const tag = covered
    ? 'Karşılandı'
    : partiallyCovered
      ? 'Kısmen karşılandı'
      : notRequired
        ? 'Karşılık gerekmiyor'
        : unresolved
          ? 'Karşılık bekliyor'
          : displayStatus(coverageStatus);
  const tone = covered ? 'success' : partiallyCovered || unresolved ? 'warning' : notRequired ? 'neutral' : statusTone(coverageStatus);
  return { coverageStatus, assigned, unresolved, tag, tone };
}

function renderBugunQueueItem(item) {
  const courseLabel = pick(item, ['courseLabel', 'title'], 'Ders');
  const groupLabel = pick(item, ['studentGroupLabel', 'groupLabel'], '');
  const label = groupLabel ? `${courseLabel} · ${groupLabel}` : courseLabel;
  const info = bugunQueueInfo(item);
  const leaveId = pick(item, ['leaveRequestId'], '');
  const eventId = pick(item, ['scheduleEventId', 'eventId'], '');
  const actions = [];
  if (info.unresolved && leaveId && canRequest('GET', `/daily-operations/leaves/${encodeURIComponent(leaveId)}/impact`)) {
    actions.push(`<button type="button" data-action="impact" data-leave-id="${escapeHtml(leaveId)}" data-event-id="${escapeHtml(eventId)}" data-course-label="${escapeHtml(label)}">Adayları gör</button>`);
  }
  if (info.unresolved && eventId) {
    actions.push(`<button type="button" data-action="bugun-open-attendance" data-event-id="${escapeHtml(eventId)}">Yoklamayı aç</button>`);
  }
  if (info.assigned && leaveId && eventId && canRequest('DELETE', `/daily-operations/leaves/${encodeURIComponent(leaveId)}/events/${encodeURIComponent(eventId)}/substitution`)) {
    actions.push(`<button type="button" data-action="bugun-unassign" data-leave-id="${escapeHtml(leaveId)}" data-event-id="${escapeHtml(eventId)}">Görevlendirmeyi geri al</button>`);
  }
  const actionHtml = actions.length ? `<div class="quick-actions">${actions.join('')}</div>` : '';
  const hint = info.unresolved ? 'Karşılığı atanmamış dersler, gün başlamadan kapatılmalı.' : '';
  return `<article class="card queue-card">
    <h3>${escapeHtml(label)} <span class="tag" data-tone="${escapeHtml(info.tone)}">${escapeHtml(info.tag)}</span></h3>
    <p class="card-meta">
      <span>Saat: ${escapeHtml(pick(item, ['timeRange', 'time'], 'Saat bekleniyor'))}</span>
      <span>Karşılık: ${escapeHtml(displayStatus(pick(item, ['coverageStatus'], 'unresolved')))}</span>
      <span>Görevlendirme: ${info.assigned ? 'Atandı' : 'Henüz atanmadı'}</span>
    </p>
    ${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ''}
    ${actionHtml}
  </article>`;
}

function renderBugunSessionCard(session) {
  const sessionId = pick(session, ['id'], '');
  const status = String(pick(session, ['status'], 'draft')).toLowerCase();
  const locked = status === 'locked';
  const canCorrect = Boolean(sessionId) && canRequest('POST', `/attendance/sessions/${encodeURIComponent(sessionId)}/records/${encodeURIComponent(sessionId)}/correction`);
  const attendanceState = !locked ? 'open' : canCorrect ? 'completed' : 'locked';
  const tag = !locked ? 'Açık' : attendanceState === 'completed' ? 'Tamamlandı' : 'Kilitli';
  const tone = !locked ? 'warning' : attendanceState === 'completed' ? 'success' : 'neutral';
  const roster = asArray(session, ['rosterSnapshot', 'roster']);
  const hint = attendanceState === 'open'
    ? 'İşaretlenmemiş öğrenci devamsız sayılmaz; oturum tamamlanınca kilitlenir.'
    : attendanceState === 'completed'
      ? 'Tamamlanmış oturum kilitlidir; düzeltme ayrı yetkiyle ve gerekçesiyle yapılır.'
      : 'Kilitli oturumda işaretleme yoktur; yalnız düzeltme yolu vardır.';
  const actions = [];
  if (attendanceState === 'open') {
    actions.push(`<button type="button" data-action="bugun-open-attendance" data-session-id="${escapeHtml(sessionId)}">Yoklamayı sürdür</button>`);
  }
  const actionHtml = actions.length ? `<div class="quick-actions">${actions.join('')}</div>` : '';
  return `<article class="card" data-attendance-state="${attendanceState}">
    <h3>Yoklama oturumu <span class="tag" data-tone="${escapeHtml(tone)}">${escapeHtml(tag)}</span></h3>
    <p class="card-meta"><span>Saat: ${escapeHtml(formatStamp(pick(session, ['sessionDate'], '')))}</span>${roster.length ? `<span>Öğrenci: ${roster.length}</span>` : ''}</p>
    <p class="hint">${escapeHtml(hint)}</p>
    ${actionHtml}
  </article>`;
}

function setBugunOpenWorkValue(value, permitted) {
  $('#bugun-open-work-value').textContent = String(value ?? '');
  $('#bugun-open-work-hint').textContent = permitted
    ? 'Karşılığı atanmamış dersler, gün başlamadan kapatılmalı.'
    : 'Bu ölçüm yetkiniz kapsamında değil.';
}

function setBugunPendingLeaveValue(value, permitted) {
  $('#bugun-pending-leave-value').textContent = String(value ?? '');
  $('#bugun-pending-leave-hint').textContent = permitted
    ? 'Karar vermek karşılık atamak değildir; ikisi ayrı durumdur.'
    : 'Bu ölçüm yetkiniz kapsamında değil.';
}

function setBugunSessionsValue(value, permitted) {
  $('#bugun-sessions-open-value').textContent = String(value ?? '');
}

async function loadTodaySessions() {
  const target = $('#bugun-sessions-output');
  if (!canRequest('GET', '/attendance/sessions')) {
    setBugunSessionsValue('', false);
    renderRegionState(target, 'forbidden_non_enumerating', 'Yoklama okuma yetkiniz kapsamında değil.');
    return;
  }
  target.innerHTML = loading('Yoklama oturumları getiriliyor');
  try {
    const { body } = await apiRequest('/attendance/sessions');
    const all = asArray(body, ['sessions', 'items']);
    const sessions = state.date ? all.filter((session) => bugunToDay(pick(session, ['sessionDate'], '')) === state.date.slice(0, 10)) : all;
    setBugunSessionsValue(sessions.length, true);
    if (sessions.length) {
      target.innerHTML = sessions.map(renderBugunSessionCard).join('');
    } else {
      empty(target, 'attendance');
    }
  } catch (error) {
    renderError(target, error);
  }
}

async function loadTodayDashboard() {
  if (!requireSession()) return;
  const queueTarget = $('#bugun-queue-output');
  const queuePermitted = canRequest('GET', '/daily-operations/today');
  if (queuePermitted) {
    const branchId = getBranchId();
    if (!branchId) {
      updateWorkflowProgress('context', 'Günlük işler için şube seçin');
      return announce('Günlük işler için şube seçin.', 'warning');
    }
    queueTarget.innerHTML = loading('Günlük işler getiriliyor');
    try {
      const { body } = await apiRequest(`/daily-operations/today?${bugunTodayQuery()}`);
      const items = asArray(body, ['items', 'lessons', 'queue']);
      let openWorkCount = 0;
      for (const item of items) {
        const coverageStatus = pick(item, ['coverageStatus'], 'unresolved');
        if (coverageStatus === 'unresolved' || coverageStatus === 'partially_covered') openWorkCount += 1;
      }
      setBugunOpenWorkValue(openWorkCount, true);
      if (items.length) {
        queueTarget.innerHTML = items.map(renderBugunQueueItem).join('');
      } else {
        empty(queueTarget, 'queue');
      }
    } catch (error) {
      renderError(queueTarget, error);
    }
  } else {
    renderRegionState(queueTarget, 'forbidden_non_enumerating', 'Bugün iş kuyruğu için yetkiniz bulunmuyor.');
    setBugunOpenWorkValue('', false);
  }

  if (canRequest('GET', '/leaves')) {
    try {
      const { body } = await apiRequest('/leaves');
      const leaves = asArray(body, ['leaves', 'items']);
      let pending = 0;
      for (const leave of leaves) {
        const status = String(pick(leave, ['status'], '') || '').toLowerCase();
        if (status === 'pending') pending += 1;
      }
      setBugunPendingLeaveValue(pending, true);
    } catch (error) {
      setBugunPendingLeaveValue('', true);
    }
  } else {
    setBugunPendingLeaveValue('', false);
  }

  await loadTodaySessions();

  renderBugunKesit();
  updateWorkflowProgress();
}

function renderBugunKesit() {
  const target = $('#bugun-roles-output');
  const rows = [
    { key: 'queue', title: 'Kuyruk', permitted: canRequest('GET', '/daily-operations/today'), hint: 'Bugün iş (izin kuyruğu) görünürlüğü aktör yetkisiyle belirlenir.' },
    { key: 'decision', title: 'Karar', permitted: canRequest('GET', '/leaves'), hint: 'İzin kararı görünürlüğü aktör yetkisiyle belirlenir.' },
    { key: 'attendance', title: 'Yoklama', permitted: canRequest('GET', '/attendance/sessions'), hint: 'Yoklama okuma görünürlüğü aktör yetkisiyle belirlenir.' },
  ];
  target.innerHTML = rows
    .map(
      (row) =>
        `<article class="card" data-kesit="${row.key}"><h3>${row.title}</h3><p class="card-meta"><span>${row.permitted ? 'Açık' : 'Kapalı'}</span></p><p class="hint">${row.permitted ? row.hint : 'Bu kesit için yetkiniz bulunmuyor.'}</p></article>`,
    )
    .join('');
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.action === 'bugun-open-attendance') {
    const sessionId = String(target.dataset.sessionId || '');
    const eventId = String(target.dataset.eventId || '');
    if (sessionId) {
      state.activeAttendanceSessionId = sessionId;
      activateTab('attendance');
      openAttendanceSession(sessionId);
      return;
    }
    if (eventId) {
      $('#attendance-event-id').value = eventId;
      announce('Yoklama için ders olayı bağlandı; öğrenci listesini okuyun.', 'neutral');
      activateTab('attendance');
    }
  }
  if (target.dataset.action === 'bugun-unassign') {
    state.activeLeaveId = String(target.dataset.leaveId || state.activeLeaveId);
    state.activeScheduleEventId = String(target.dataset.eventId || state.activeScheduleEventId);
    clearAssignment();
  }
});

$('#bugun-refresh').addEventListener('click', loadTodayDashboard);
