'use strict';

// #442 screen module — izin kararları (decisions). Shared core (app.js):
// state, apiRequest, hata normalizasyonu, navigation ve öğretmen-ops akışı.
// Bu dosya core'dan sonra yüklenir; kendi alanının işlevlerini, kendi
// eylemlerinin click delegation'ını ve kablolamasını taşır.

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
