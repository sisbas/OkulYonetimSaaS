'use strict';

// #442 screen module — izin kararları (decisions). Shared core (app.js):
// state, apiRequest, hata normalizasyonu, navigation ve öğretmen-ops akışı.
// Bu dosya core'dan sonra yüklenir; kendi alanının işlevlerini, kendi
// eylemlerinin click delegation'ını ve kablolamasını taşır.

// #455 — gün akışının yanındaki karar rayı. Açık kart ve etki projeksiyonu
// yalnız sunucudan gelir; istemci uygunluk veya "bugün" hesabı yapmaz.
let dayLeaveExpandedId = '';
let dayLeaveImpact = null;
let dayLeaveCandidateCache = {};

function dayLeaveRailReset() {
  dayLeaveExpandedId = '';
  dayLeaveImpact = null;
  dayLeaveCandidateCache = {};
}

function dayLeaveRailClearSession() {
  state.pendingSubstitutions = {};
  if (state.activeLeaveDecision === LEAVE_DECISIONS.pending) state.activeLeaveDecision = '';
}

function dayLeaveImpactPath(leaveId) {
  const params = new URLSearchParams();
  if (state.date) params.set('date', state.date);
  const suffix = params.toString();
  return `/daily-operations/leaves/${encodeURIComponent(leaveId)}/impact${suffix ? `?${suffix}` : ''}`;
}

function dayLeaveCandidatesPath(leaveId, eventId) {
  return `/daily-operations/leaves/${encodeURIComponent(leaveId)}/events/${encodeURIComponent(eventId)}/candidates`;
}

function renderLeaveDecisionCard(leave) {
  const leaveId = pick(leave, ['id']);
  const decision = String(pick(leave, ['decisionStatus'], 'unknown')).toLowerCase();
  const coverage = String(pick(leave, ['coverageStatus'], 'unknown')).toLowerCase();
  const assignment = String(pick(leave, ['assignmentStatus'], '')).toLowerCase();
  const pending = decision === 'pending' || decision === 'unknown';
  const etag = String(pick(leave, ['etag'], '') || '');
  const reasonLabel = displayTerm(leaveReasonLabels, pick(leave, ['reasonCode'], ''), 'Belirtilmemiş');
  const durationLabel = displayTerm(leaveDurationLabels, pick(leave, ['durationType'], ''), 'Belirtilmemiş');
  const locked = mutationDisabled();
  return `<article class="card">
    <h3>İzin talebi ${statusBadge(decision)}</h3>
    <p class="card-meta">
      <span>Gerekçe: ${escapeHtml(reasonLabel)}</span>
      <span>Süre: ${escapeHtml(durationLabel)}</span>
      <span>Karşılık: ${escapeHtml(displayStatus(coverage))}</span>
      <span>Görevlendirme: ${escapeHtml(assignment ? displayStatus(assignment) : 'Henüz atanmadı')}</span>
      <span>${escapeHtml(formatStamp(pick(leave, ['createdAt'], '')))}</span>
    </p>
    ${pending
      ? `<div class="quick-actions" data-reason-code="${escapeHtml(pick(leave, ['reasonCode'], ''))}">
          ${canRequest('PATCH', `/leaves/${encodeURIComponent(leaveId)}/approve`)
            ? `<button type="button" data-action="leave-decision" data-leave-id="${escapeHtml(leaveId)}" data-leave-decision="approve" data-leave-etag="${escapeHtml(etag)}" ${locked ? 'disabled' : ''}>Onayla</button>`
            : ''}
          ${canRequest('PATCH', `/leaves/${encodeURIComponent(leaveId)}/reject`)
            ? `<button type="button" data-action="leave-decision" data-leave-id="${escapeHtml(leaveId)}" data-leave-decision="reject" data-leave-etag="${escapeHtml(etag)}" ${locked ? 'disabled' : ''}>Reddet</button>`
            : ''}
          ${canRequest('GET', `/daily-operations/leaves/${encodeURIComponent(leaveId)}/impact`)
            ? `<button type="button" data-action="leave-impact" data-leave-id="${escapeHtml(leaveId)}" data-leave-etag="${escapeHtml(etag)}">Etki ve adaylar</button>`
            : ''}
          ${!canRequest('PATCH', `/leaves/${encodeURIComponent(leaveId)}/approve`) && !canRequest('PATCH', `/leaves/${encodeURIComponent(leaveId)}/reject`)
            ? '<span class="hint">Bu talebin kararı yetkiniz kapsamında değil; karar yetkili ekranda verilir.</span>'
            : ''}
        </div>`
      : '<p class="hint">Bu talebin kararı verilmiş; kayıt güncelliği listeyle birlikte tazelenir.</p>'}
  </article>`;
}

async function loadLeaves() {
  if (!requireSession()) return;
  const branchId = getBranchId();
  if (!branchId) return announce('İzin kararları için şube seçin.', 'warning');
  const target = $('#leaves-output');
  const query = new URLSearchParams({ branchId });
  // #491: durum filtresi sunucuya gider; istemci tarafında liste kırpılmaz
  // (sayfalama/eksik veri "filtre çalışıyor" gibi görünmesin).
  if (state.leaveStatusFilter) query.set('decisionStatus', state.leaveStatusFilter);
  target.innerHTML = loading('İzin talepleri getiriliyor');
  try {
    const { body } = await apiRequest(`/leaves?${query.toString()}`);
    const rows = asArray(body, ['leaves', 'items', 'requests', 'data']);
    if (rows.length) {
      target.innerHTML = rows.map(renderLeaveDecisionCard).join('');
      announce(`${rows.length} izin talebi listelendi.`, 'success');
    } else {
      empty(target, 'leaves');
    }
  } catch (error) {
    renderError(target, error);
  }
}

/**
 * #455 — bekleyen izinler gün akışının yanındaki rayda listelenir.
 * Her kartın etki projeksiyonu (etkilenen + bugüne düşen + açık ders) sunucudan
 * alınır ve karar kontrollerinden önce çizilir.
 */
async function dayLeaveEntries(leaves) {
  return Promise.all(leaves.map(async (leave) => {
    const leaveId = String(pick(leave, ['id'], ''));
    if (!leaveId || !canRequest('GET', dayLeaveImpactPath(leaveId))) {
      return { leave, impact: null, error: true };
    }
    try {
      const { body } = await apiRequest(dayLeaveImpactPath(leaveId));
      return { leave, impact: body, error: false };
    } catch (error) {
      return { leave, impact: null, error };
    }
  }));
}

function renderDayLeaveCard(entry) {
  const { leave, impact, error } = entry;
  const leaveId = String(pick(leave, ['id'], ''));
  const etag = String(pick(impact, ['leaveEtag'], '') || pick(leave, ['etag'], ''));
  const impacted = Number(pick(impact, ['impactedLessonCount'], 0));
  const todayCount = Number(pick(impact, ['todayLessonCount'], 0));
  const open = Number(pick(impact, ['openLessonCount'], 0));
  const reasonLabel = displayTerm(leaveReasonLabels, pick(leave, ['reasonCode'], ''), 'Belirtilmemiş');
  const canOpen = Boolean(impact && !error) && canRequest('GET', dayLeaveImpactPath(leaveId));
  const canDecide = canRequest('PATCH', `/leaves/${encodeURIComponent(leaveId)}/approve`) ||
    canRequest('PATCH', `/leaves/${encodeURIComponent(leaveId)}/reject`);
  const expanded = dayLeaveExpandedId === leaveId;
  return `<article class="card day-leave-card" data-leave-id="${escapeHtml(leaveId)}" data-day-leave-state="${open > 0 ? 'coverage_required' : 'approvable'}">
    <h3>Karar bekleyen izin · ${escapeHtml(reasonLabel)}</h3>
    <p class="card-meta day-leave-impact">
      <span>Etkilenen: ${impacted} ders</span>
      <span>Bugün: ${todayCount} ders</span>
      <span>Açık: ${open} ders</span>
    </p>
    ${error ? '<p class="hint">Etki projeksiyonu alınamadı; karar kontrolleri kapalı.</p>' : ''}
    ${canOpen && canDecide
      ? `<button type="button" data-action="day-leave-open" data-leave-id="${escapeHtml(leaveId)}" data-leave-etag="${escapeHtml(etag)}" aria-expanded="${expanded}">${expanded ? 'Kararı kapat' : 'Etkiyi ve kararı aç'}</button>`
      : '<p class="hint">Bu izin için karar/etki yetkiniz kapsamında değil.</p>'}
    <div class="day-leave-detail" id="day-leave-detail-${escapeHtml(leaveId)}"${expanded ? '' : ' hidden'}></div>
  </article>`;
}

async function loadDayLeaveRail() {
  if (!requireSession()) return;
  const branchId = getBranchId();
  const target = $('#day-leave-rail');
  if (!branchId) {
    empty(target, 'dayLeaves');
    return announce('Karar rayı için şube seçin.', 'warning');
  }
  if (!canRequest('GET', '/leaves')) {
    renderRegionState(target, 'forbidden_non_enumerating', 'İzin kararları yetkiniz kapsamında değil.');
    return;
  }
  target.innerHTML = loading('Bekleyen izinler getiriliyor');
  const query = new URLSearchParams({ branchId, decisionStatus: 'pending' });
  try {
    const { body } = await apiRequest(`/leaves?${query.toString()}`);
    const rows = asArray(body, ['leaves', 'items', 'requests', 'data']);
    if (!rows.length) {
      dayLeaveRailReset();
      empty(target, 'dayLeaves');
      return;
    }
    const entries = await dayLeaveEntries(rows);
    target.innerHTML = entries.map(renderDayLeaveCard).join('');
    const expanded = entries.find((entry) => String(pick(entry.leave, ['id'], '')) === dayLeaveExpandedId);
    if (expanded && expanded.impact && !expanded.error) {
      dayLeaveImpact = expanded.impact;
      renderDayLeaveDetail(dayLeaveExpandedId);
    } else if (!expanded) {
      dayLeaveRailReset();
    }
    announce(`${rows.length} bekleyen izin karar rayında.`, 'success');
  } catch (error) {
    renderError(target, error);
  }
}

async function openDayLeaveDecision(leaveId) {
  if (!requireSession()) return;
  if (dayLeaveExpandedId === leaveId) {
    dayLeaveRailReset();
    await loadDayLeaveRail();
    return;
  }
  const target = $(`#day-leave-detail-${leaveId}`);
  if (target) target.innerHTML = loading('İzin etkisi getiriliyor');
  try {
    const { body } = await apiRequest(dayLeaveImpactPath(leaveId));
    captureLeaveVersion(body);
    dayLeaveExpandedId = leaveId;
    dayLeaveImpact = body;
    dayLeaveCandidateCache = {};
    state.pendingSubstitutions = {};
    state.activeLeaveDecision = LEAVE_DECISIONS.pending;
    await loadDayLeaveRail();
  } catch (error) {
    if (target) renderError(target, error);
  }
}

function renderDayLeaveDetail(leaveId) {
  const target = $(`#day-leave-detail-${leaveId}`);
  const impact = dayLeaveImpact;
  if (!target || !impact) return;
  const events = asArray(impact, ['events', 'affectedLessons', 'lessons', 'items']);
  state.impactOpenRows = events.filter((event) => String(pick(event, ['state'], 'open')) === 'open');
  const open = Number(pick(impact, ['openLessonCount'], state.impactOpenRows.length));
  const impacted = Number(pick(impact, ['impactedLessonCount'], events.length));
  const todayCount = Number(pick(impact, ['todayLessonCount'], 0));
  const etag = String(pick(impact, ['leaveEtag'], ''));
  const canApprove = canRequest('PATCH', `/leaves/${encodeURIComponent(leaveId)}/approve`);
  const canReject = canRequest('PATCH', `/leaves/${encodeURIComponent(leaveId)}/reject`);
  const locked = mutationDisabled() || !etag;
  const rows = events.map((event) => {
    const eventId = String(pick(event, ['scheduleEventId', 'eventId', 'id'], ''));
    const stateKey = String(pick(event, ['state'], 'open'));
    const candidatesPath = dayLeaveCandidatesPath(leaveId, eventId);
    return `<li data-event-state="${escapeHtml(stateKey)}">
      <strong>${escapeHtml(pick(event, ['lessonLabel', 'courseLabel'], 'Ders'))}</strong>
      <span>${escapeHtml(pick(event, ['occurrenceLabel', 'occurrenceDate'], ''))} ${escapeHtml(pick(event, ['timeLabel'], ''))}</span>
      <span class="tag" data-tone="${escapeHtml(statusTone(stateKey))}">${escapeHtml(displayStatus(stateKey))}</span>
      ${stateKey === 'open' && canRequest('GET', candidatesPath)
        ? `<button type="button" data-action="day-leave-candidates" data-event-id="${escapeHtml(eventId)}" data-course-label="${escapeHtml(pick(event, ['lessonLabel', 'courseLabel'], 'Ders'))}">Adayları getir</button>` : ''}
      <div id="day-leave-candidates-${escapeHtml(eventId)}"></div>
    </li>`;
  }).join('');
  target.innerHTML = `<div class="day-leave-impact" id="day-leave-impact-summary">
      <span class="tag" data-tone="neutral">Etkilenen: ${impacted} ders</span>
      <span class="tag" data-tone="neutral">Bugün: ${todayCount} ders</span>
      <span class="tag" data-tone="${open > 0 ? 'warning' : 'success'}">Açık: ${open} ders</span>
    </div>
    <p class="hint">Etki projeksiyonu sunucudan gelir; karar bu projeksiyon okunduktan sonra verilir.</p>
    <ul class="impact-list">${rows || '<li>Bu izin için etkilenen ders yok.</li>'}</ul>
    ${open > 0 ? `<p class="hint" id="day-leave-block">${open} ders için yedek seçilmedi; onay bu yedekler seçilmeden mümkün değil.</p>` : ''}
    <div id="day-leave-substitutions-summary"></div>
    <div class="quick-actions">
      ${canApprove ? `<button type="button" data-action="day-leave-approve"${locked || open > 0 ? ' disabled' : ''}${open > 0 ? ' aria-describedby="day-leave-block"' : ''}>${open > 0 ? 'Yedeklerle onayla' : 'Onayla'}</button>` : ''}
      ${canReject ? `<button type="button" data-action="day-leave-reject"${locked ? ' disabled' : ''}>Reddet</button>` : ''}
    </div>`;
  renderDayLeaveSubstitutionSummary();
}

function renderDayLeaveSubstitutionSummary() {
  const el = $('#day-leave-substitutions-summary');
  if (!el) return;
  const open = state.impactOpenRows.length;
  const picked = substitutionsEntries().length;
  const complete = picked === open;
  el.innerHTML = open > 0
    ? `<span class="card-meta">${picked}/${open} açık ders için yedek seçildi${complete ? '' : '; kalan dersler için sunucu adaylarından seçin'}</span>
       ${picked ? '<button type="button" data-action="day-leave-substitutions-clear">Seçimleri temizle</button>' : ''}`
    : '';
  const detail = typeof el.closest === 'function' ? el.closest('.day-leave-detail') : null;
  const approve = detail && typeof detail.querySelector === 'function'
    ? detail.querySelector('button[data-action="day-leave-approve"]')
    : null;
  if (approve && open > 0) approve.disabled = !complete || !state.activeLeaveEtag || mutationDisabled();
}

async function loadDayLeaveCandidates(eventId, courseLabel = '') {
  if (!requireSession() || !dayLeaveExpandedId) return;
  state.activeScheduleEventId = eventId;
  state.activeLessonLabel = courseLabel || state.activeLessonLabel;
  const target = $(`#day-leave-candidates-${eventId}`);
  target.innerHTML = loading('Adaylar getiriliyor');
  try {
    const { body } = await apiRequest(dayLeaveCandidatesPath(dayLeaveExpandedId, eventId));
    if (body?.eligibilityFinalized === false) {
      renderRegionState(target, 'eligibility_not_ready');
      return;
    }
    const candidates = asArray(body, ['candidates', 'items']);
    dayLeaveCandidateCache[eventId] = candidates;
    if (!candidates.length) {
      empty(target, 'candidates');
      return;
    }
    target.innerHTML = candidates.map(renderDayLeaveCandidate).join('');
  } catch (error) {
    renderError(target, error);
  }
}

function renderDayLeaveCandidate(candidate) {
  const teacherId = String(pick(candidate, ['teacherId'], ''));
  const eligible = pick(candidate, ['eligible'], false) === true;
  const selected = state.pendingSubstitutions[state.activeScheduleEventId] === teacherId;
  return `<article class="card candidate" data-day-leave-candidate="${escapeHtml(teacherId)}">
    <strong>${escapeHtml(pick(candidate, ['teacherLabel', 'displayName', 'name'], 'Aday öğretmen'))}</strong>
    <p class="card-meta">
      <span>${escapeHtml(eligible ? 'Sunucu bu ders için uygun listeledi' : 'Sunucu bu ders için uygun listelemedi')}</span>
      ${pick(candidate, ['branchLabel'], '') ? `<span>${escapeHtml(pick(candidate, ['branchLabel'], ''))}</span>` : ''}
      ${pick(candidate, ['availabilityLabel'], '') ? `<span>${escapeHtml(pick(candidate, ['availabilityLabel'], ''))}</span>` : ''}
    </p>
    ${eligible
      ? `<button type="button" data-action="day-leave-substitute" data-teacher-id="${escapeHtml(teacherId)}"${mutationDisabled() ? ' disabled' : ''}>${selected ? 'Bu yedeği kaldır' : 'Bu yedeği seç'}</button>`
      : '<p class="hint">Sunucu uygunluk kaydı bu aday için kapalı.</p>'}
  </article>`;
}

function dayLeavePickSubstitute(teacherId) {
  if (!state.activeScheduleEventId) return announce('Önce bir dersin adaylarını açın.', 'warning');
  const eventId = state.activeScheduleEventId;
  const next = { ...state.pendingSubstitutions };
  if (next[eventId] === teacherId) delete next[eventId];
  else next[eventId] = teacherId;
  state.pendingSubstitutions = next;
  const target = $(`#day-leave-candidates-${eventId}`);
  target.innerHTML = (dayLeaveCandidateCache[eventId] || []).map(renderDayLeaveCandidate).join('');
  renderDayLeaveSubstitutionSummary();
}

async function dayLeaveAfterDecision() {
  dayLeaveRailReset();
  state.pendingSubstitutions = {};
  if (typeof loadDayBoard === 'function') await loadDayBoard({ keepRail: false, announceOnLoad: false });
  await loadDayLeaveRail();
}

async function dayLeaveApprove() {
  if (!requireSession() || !dayLeaveExpandedId) return;
  const leaveId = dayLeaveExpandedId;
  const etag = String(pick(dayLeaveImpact, ['leaveEtag'], state.activeLeaveEtag || ''));
  if (!etag) return announce('Güncel izin kaydı alınmadan onaylanamaz.', 'warning');
  const open = state.impactOpenRows.length;
  const substitutions = substitutionsEntries();
  if (open > 0 && substitutions.length !== open) {
    return announce('Her açık ders için sunucu adaylarından bir yedek seçin.', 'warning');
  }
  const target = $(`#day-leave-detail-${leaveId}`);
  if (target) target.innerHTML = loading('Karar sunucuda uygulanıyor');
  try {
    const { body, etag: nextEtag } = await apiRequest(`/leaves/${encodeURIComponent(leaveId)}/approve`, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: { substitutions },
      versioned: true,
    });
    captureLeaveVersion(body, nextEtag);
    state.activeLeaveDecision = LEAVE_DECISIONS.approved;
    announce('İzin onaylandı; yedekler aynı işlemde atandı.', 'success');
    await dayLeaveAfterDecision();
  } catch (error) {
    if (target) renderError(target, error);
  }
}

async function dayLeaveReject() {
  if (!requireSession() || !dayLeaveExpandedId) return;
  const leaveId = dayLeaveExpandedId;
  const etag = String(pick(dayLeaveImpact, ['leaveEtag'], state.activeLeaveEtag || ''));
  if (!etag) return announce('Güncel izin kaydı alınmadan karar verilemez.', 'warning');
  const target = $(`#day-leave-detail-${leaveId}`);
  if (target) target.innerHTML = loading('Karar sunucuda uygulanıyor');
  try {
    const { body } = await apiRequest(`/leaves/${encodeURIComponent(leaveId)}/reject`, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      versioned: true,
    });
    announce(`İzin kararı tamamlandı · ${displayStatus(pick(body, ['decisionStatus'], ''))}.`, 'success');
    await dayLeaveAfterDecision();
  } catch (error) {
    if (target) renderError(target, error);
  }
}

async function decideLeave(leaveId, decision, etag) {
  if (!requireSession()) return;
  const target = $('#leaves-output');
  target.innerHTML = loading('Karar sunucuda uygulanıyor');
  try {
    const { body } = await apiRequest(`/leaves/${encodeURIComponent(leaveId)}/${encodeURIComponent(decision)}`, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      versioned: true,
    });
    const nextDecision = pick(body, ['decisionStatus'], '');
    announce(`İzin kararı tamamlandı${nextDecision ? ` · ${displayStatus(nextDecision)}` : ''}.`, 'success');
    await loadLeaves();
  } catch (error) {
    renderError(target, error);
  }
}

function renderOwnLeaveCard(leave) {
  const leaveId = String(pick(leave, ['id'], ''));
  const decision = String(pick(leave, ['decisionStatus'], 'unknown')).toLowerCase();
  const reasonLabel = displayTerm(leaveReasonLabels, pick(leave, ['reasonCode'], ''), 'Belirtilmemiş');
  const durationLabel = displayTerm(leaveDurationLabels, pick(leave, ['durationType'], ''), 'Belirtilmemiş');
  return `<article class="card">
    <h3>İzin talebim ${statusBadge(decision)}</h3>
    <p class="card-meta">
      <span>Gerekçe: ${escapeHtml(reasonLabel)}</span>
      <span>Süre: ${escapeHtml(durationLabel)}</span>
      <span>Dönem: ${escapeHtml(formatStamp(pick(leave, ['startsAt'], '')))}</span>
    </p>
    <div class="quick-actions">
      ${canRequest('GET', `/leaves/me/:id`)
        ? `<button type="button" data-action="own-leave-open" data-leave-id="${escapeHtml(leaveId)}">Talebi aç</button>`
        : ''}
    </div>
  </article>`;
}

/**
 * #491 — İzinlerim (sahiplik ayrımı).
 *
 * Kapsam SUNUCUDA çözülür: istemci `teacherId` göndermez, yalnız kendi
 * kayıtlarını döndüren uç çağrılır. Uç henüz dağıtılmadıysa (404/405) liste
 * "yok" gibi gösterilmez; dürüst bir hazır-değil durumu render edilir.
 */
async function loadMyLeaves() {
  if (!requireSession()) return;
  const target = $('#my-leaves-output');
  const query = new URLSearchParams();
  if (state.myLeaveStatusFilter) query.set('decisionStatus', state.myLeaveStatusFilter);
  target.innerHTML = loading('İzin geçmişiniz getiriliyor');
  try {
    const { body } = await apiRequest(`/leaves/me${query.toString() ? `?${query.toString()}` : ''}`);
    const rows = asArray(body, ['leaves', 'items', 'requests', 'data']);
    if (rows.length) {
      target.innerHTML = rows.map(renderOwnLeaveCard).join('');
      announce(`${rows.length} izin talebiniz listelendi.`, 'success');
    } else {
      empty(target, 'leaves');
    }
  } catch (error) {
    if (error && (error.status === 404 || error.status === 405)) {
      renderRegionState(
        target,
        'unknown_server_state',
        'İzin geçmişi bu sürümde kullanılamıyor. Talebinizi oluşturup tek tek açabilirsiniz.',
      );
      return;
    }
    renderError(target, error);
  }
}

function applyStatusFilter(groupSelector, attribute, nextValue, listSelector) {
  document.querySelectorAll(`${groupSelector} .chip`).forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset[attribute] === nextValue));
  });
  if (listSelector) listSelector();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  // #455 — karar rayı eylemleri.
  if (target.dataset.action === 'day-leave-open') openDayLeaveDecision(target.dataset.leaveId);
  if (target.dataset.action === 'day-leave-candidates') loadDayLeaveCandidates(target.dataset.eventId, target.dataset.courseLabel);
  if (target.dataset.action === 'day-leave-substitute') dayLeavePickSubstitute(target.dataset.teacherId);
  if (target.dataset.action === 'day-leave-substitutions-clear') {
    state.pendingSubstitutions = {};
    renderDayLeaveSubstitutionSummary();
  }
  if (target.dataset.action === 'day-leave-approve') dayLeaveApprove();
  if (target.dataset.action === 'day-leave-reject') dayLeaveReject();
  if (target.dataset.action === 'leave-decision') decideLeave(target.dataset.leaveId, target.dataset.leaveDecision, target.dataset.leaveEtag);
  if (target.dataset.action === 'own-leave-open') {
    state.activeLeaveId = target.dataset.leaveId;
    state.activeLeaveEtag = '';
    loadOwnLeave();
  }
  if (target.dataset.leaveStatus !== undefined && target.classList.contains('chip')) {
    state.leaveStatusFilter = target.dataset.leaveStatus;
    applyStatusFilter('#leave-status-filter', 'leaveStatus', state.leaveStatusFilter, loadLeaves);
  }
  if (target.dataset.ownStatus !== undefined && target.classList.contains('chip')) {
    state.myLeaveStatusFilter = target.dataset.ownStatus;
    applyStatusFilter('#my-leaves-status-filter', 'ownStatus', state.myLeaveStatusFilter, loadMyLeaves);
  }
});

$('#refresh-leaves').addEventListener('click', loadLeaves);
$('#refresh-my-leaves').addEventListener('click', loadMyLeaves);
// #455 — tek giriş noktaları manuel: Bugün yenile ve gün akışını getir.
$('#bugun-refresh').addEventListener('click', () => loadDayLeaveRail());
$('#load-day').addEventListener('click', () => loadDayLeaveRail());
