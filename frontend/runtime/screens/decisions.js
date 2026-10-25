'use strict';

// #442 screen module — izin kararları (decisions). Shared core (app.js):
// state, apiRequest, hata normalizasyonu, navigation ve öğretmen-ops akışı.
// Bu dosya core'dan sonra yüklenir; kendi alanının işlevlerini, kendi
// eylemlerinin click delegation'ını ve kablolamasını taşır.

function renderLeaveDecisionCard(leave) {
  const leaveId = pick(leave, ['id']);
  const decision = String(pick(leave, ['decisionStatus'], 'unknown')).toLowerCase();
  const coverage = String(pick(leave, ['coverageStatus'], 'unknown')).toLowerCase();
  const pending = decision === 'pending' || decision === 'unknown';
  const etag = String(pick(leave, ['etag'], '') || '');
  const reasonLabel = displayTerm(leaveReasonLabels, pick(leave, ['reasonCode'], ''), 'Belirtilmemiş');
  const durationLabel = displayTerm(leaveDurationLabels, pick(leave, ['durationType'], ''), 'Belirtilmemiş');
  const locked = mutationDisabled();
  return `<article class="card">
    <h3>İzin talebi · ${escapeHtml(displayStatus(decision))}</h3>
    <p class="card-meta">
      <span>Gerekçe: ${escapeHtml(reasonLabel)}</span>
      <span>Süre: ${escapeHtml(durationLabel)}</span>
      <span>Karşılık: ${escapeHtml(displayStatus(coverage))}</span>
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

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.action === 'leave-decision') decideLeave(target.dataset.leaveId, target.dataset.leaveDecision, target.dataset.leaveEtag);
});

$('#refresh-leaves').addEventListener('click', loadLeaves);
