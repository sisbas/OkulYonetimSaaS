'use strict';

// #442 screen module — bildirimler (notifications). Paylaşılan state,
// apiRequest ve hata normalizasyonu core'da (app.js); taslak onayı, gönderim
// eylemleri ve oturum toplu onayı bu modüle aittir.

function groupDraftsBySession(rows) {
  const groups = new Map();
  for (const row of rows) {
    const sessionId = pick(row, ['sessionId'], '');
    const key = sessionId || 'no-session';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function renderSessionBulkAction(rows) {
  const approvable = rows.filter((row) => {
    const status = String(pick(row, ['status'], '')).toLowerCase();
    return status === 'pending' || status === 'blocked_consent';
  });
  if (!approvable.length) return '<p class="hint">Bu oturum için bekleyen onay yok.</p>';
  const expectedVersions = approvable.map((row) => ({
    id: pick(row, ['id']),
    version: Number(pick(row, ['version'], 0)),
  }));
  return `<button type="button" data-action="bulk-approve-session" data-session-id="${escapeHtml(pick(approvable[0], ['sessionId'], ''))}" data-versions="${escapeHtml(encodeURIComponent(JSON.stringify(expectedVersions)))}" ${mutationDisabled() ? 'disabled' : ''}>Bu oturumun ${approvable.length} taslağını toplu onayla</button>`;
}

async function bulkApproveSession(sessionId, versionsCsv) {
  if (!requireSession()) return;
  let expectedVersions;
  try {
    expectedVersions = JSON.parse(decodeURIComponent(versionsCsv));
  } catch (_error) {
    return announce('Toplu onay için sürüm bilgisi çözülemedi.', 'warning');
  }
  const target = $('#bulk-approve-output');
  target.innerHTML = loading('Toplu onay sunucuda uygulanıyor');
  try {
    await apiRequest(`/notifications/drafts/session/${encodeURIComponent(sessionId)}/approve`, {
      method: 'POST',
      body: { expectedVersions },
      versioned: true,
    });
    announce('Oturum taslakları toplu onaylandı.', 'success');
    await loadNotifications();
  } catch (error) {
    renderError(target, error);
  }
}

async function loadNotifications() {
  if (!requireSession()) return;
  const branchId = getBranchId();
  if (!branchId) return announce('Bildirim listesi için şube seçin.', 'warning');
  const target = $('#notifications-list');
  const query = new URLSearchParams({ limit: '20', offset: '0' });
  const filter = $('#notification-status-filter').value;
  if (filter) query.set('status', filter);
  target.innerHTML = loading('Bildirimler getiriliyor');
  try {
    const { body } = await apiRequest(`/notifications?${query.toString()}`);
    const rows = asArray(body, ['notifications', 'items']);
    target.innerHTML = rows.length ? rows.map(renderNotificationCard).join('') : empty('Bu kapsamda bildirim yok.');
    const bulkTarget = $('#bulk-approve-output');
    const bulkActions = rows.some((row) => pick(row, ['sessionId'], ''))
      ? [...groupDraftsBySession(rows).entries()]
          .filter(([sessionId]) => sessionId !== 'no-session')
          .map(([sessionId, sessionRows]) => `<article class="card">
            <h3>Oturum ${escapeHtml(String(sessionId).slice(0, 8))}…</h3>
            ${renderSessionBulkAction(sessionRows)}
          </article>`).join('')
      : '';
    bulkTarget.innerHTML = bulkActions;
    announce(`${rows.length} bildirim listelendi.`, 'success');
  } catch (error) {
    renderError(target, error);
  }
}

function notificationHeadings(row) {
  return {
    eventLabel: displayTerm(notificationEventLabels, pick(row, ['eventType'], ''), 'Bildirim'),
    channelLabel: displayTerm(notificationChannelLabels, pick(row, ['channel'], ''), 'Kanal belirtilmemiş'),
  };
}

function renderNotificationCard(row) {
  const status = pick(row, ['status'], 'unknown');
  const { eventLabel, channelLabel } = notificationHeadings(row);
  return `<article class="card">
    <h3>${escapeHtml(eventLabel)}</h3>
    <p class="card-meta">
      <span>Kanal: ${escapeHtml(channelLabel)}</span>
      <span>Deneme: ${escapeHtml(pick(row, ['attempts'], 0))}</span>
      <span>${escapeHtml(formatStamp(pick(row, ['createdAt'], '')))}</span>
    </p>
    <span class="tag" data-tone="${escapeHtml(statusTone(status))}">${escapeHtml(displayStatus(status))}</span>
    <button type="button" data-action="notification-detail" data-notification-id="${escapeHtml(pick(row, ['id']))}">Detayı ve eylemleri aç</button>
  </article>`;
}

async function fetchNotificationDetail(id) {
  const { body } = await apiRequest(`/notifications/${encodeURIComponent(id)}`);
  return body;
}

async function openNotificationDetail(id) {
  if (!requireSession()) return;
  state.activeNotificationId = id || state.activeNotificationId;
  if (!state.activeNotificationId) return announce('Önce listeden bir bildirim açın.', 'warning');
  const target = $('#notification-detail');
  target.innerHTML = loading('Bildirim detayı getiriliyor');
  try {
    renderNotificationDetail(await fetchNotificationDetail(state.activeNotificationId));
  } catch (error) {
    renderError(target, error);
  }
}

function notificationActionLabel(action) {
  const labels = {
    approve: 'Taslağı onayla',
    close: 'Taslağı kapat',
    execute: 'Gönderimi yürüt',
    retry: 'Yeniden uygunluğa al',
    cancel: 'İptal et',
  };
  return labels[action] || action;
}

function renderReceiptRow(receipt) {
  const outcome = pick(receipt, ['outcome'], '');
  const outcomeLabel = displayTerm(receiptOutcomeLabels, outcome, 'Sonuç okunamadı');
  const errorCode = pick(receipt, ['errorCode'], '');
  const simulated = pick(receipt, ['simulated'], false);
  return `<li data-provider-outcome="${escapeHtml(outcome)}" data-provider-ref="${escapeHtml(pick(receipt, ['providerRef'], ''))}" data-receipt-error="${escapeHtml(errorCode)}">
    <strong>Deneme ${escapeHtml(pick(receipt, ['attempt'], '?'))} · ${escapeHtml(outcomeLabel)}</strong>
    <span>${escapeHtml(formatStamp(pick(receipt, ['createdAt'], '')))}</span>
    <span class="tag" data-tone="${simulated ? 'neutral' : 'warning'}">${escapeHtml(simulated ? 'simüle' : 'canlı')}</span>
    ${errorCode ? '<span class="tag" data-tone="danger">Bir sorun oluştu</span>' : ''}
  </li>`;
}

function renderNotificationDetail(body, uiState = '') {
  const row = body && body.row ? body.row : {};
  const actions = asArray(body, ['availableActions']);
  const receipts = asArray(body, ['receipts']);
  state.activeNotificationId = pick(row, ['id'], state.activeNotificationId);
  state.activeNotificationVersion = Number(pick(row, ['version'], 0));
  const status = pick(row, ['status'], 'unknown');
  const reason = pick(row, ['reason'], '');
  const { eventLabel, channelLabel } = notificationHeadings(row);
  const reasonLabel = reason ? displayTerm(notificationReasonLabels, reason, 'Belirtilmemiş') : '';
  const actionButtons = actions.length
    ? actions.map((action) => `<button type="button" data-action="notification-run" data-notification-action="${escapeHtml(action)}" ${mutationDisabled() ? 'disabled' : ''}>${escapeHtml(notificationActionLabel(action))}</button>`).join('')
    : '<p class="hint">Sunucu bu durumda izin verilen bir eylem döndürmedi.</p>';
  $('#notification-detail').dataset.state = uiState || 'record_ready';
  $('#notification-detail').innerHTML = `<article class="card">
    <h3>${escapeHtml(eventLabel)} · ${escapeHtml(displayStatus(status))}</h3>
    <p class="card-meta">
      <span>Kanal: ${escapeHtml(channelLabel)}</span>
      <span>Deneme: ${escapeHtml(pick(row, ['attempts'], 0))}</span>
      <span>Sürüm: ${escapeHtml(pick(row, ['version'], 0))}</span>
      <span>Onay sürümü: ${escapeHtml(pick(row, ['consentVersion'], '-'))}</span>
      <span>${escapeHtml(formatStamp(pick(row, ['createdAt'], '')))}</span>
    </p>
    ${reasonLabel ? `<p>Gerekçe: ${escapeHtml(reasonLabel)}</p>` : ''}
    ${canonicalStateBlock(uiState)}
    <div class="quick-actions">${actionButtons}</div>
    <strong>Gönderim kanıtları</strong>
    ${receipts.length ? `<ul class="impact-list">${receipts.map(renderReceiptRow).join('')}</ul>` : '<p class="hint">Gönderim kanıtı (receipt) yok veya görüntüleme yetkiniz sınırlı.</p>'}
  </article>`;
}

async function runNotificationAction(action) {
  if (!requireSession()) return;
  const id = state.activeNotificationId;
  if (!id) return announce('Önce listeden bir bildirim açın.', 'warning');
  const target = $('#notification-detail');
  let path = `/notifications/${encodeURIComponent(id)}/${encodeURIComponent(action)}`;
  let body;
  if (action === 'approve' || action === 'close') {
    path = `/notifications/drafts/${encodeURIComponent(id)}/${encodeURIComponent(action)}`;
    body = { expectedVersion: state.activeNotificationVersion };
  }
  target.dataset.state = '';
    target.innerHTML = loading('İşlem sunucuda uygulanıyor');
  try {
    const { body: result } = await apiRequest(path, {
      method: 'POST',
      ...(body ? { body } : {}),
      versioned: Boolean(body),
    });
    const nextStatus = pick(result, ['status'], '');
    announce(`İşlem tamamlandı${nextStatus ? ` · ${displayStatus(nextStatus)}` : ''}.`, 'success');
    await openNotificationDetail(id);
    await loadNotifications();
  } catch (error) {
    renderError(target, error);
    if (error.uiState === 'stale_version' || error.uiState === 'version_required') {
      try {
        renderNotificationDetail(await fetchNotificationDetail(id), error.uiState);
      } catch (_refetchError) {
        return renderError(target, error);
      }
      await loadNotifications();
    }
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.action === 'notification-detail') openNotificationDetail(target.dataset.notificationId);
  if (target.dataset.action === 'notification-run') runNotificationAction(target.dataset.notificationAction);
  if (target.dataset.action === 'bulk-approve-session') bulkApproveSession(target.dataset.sessionId, target.dataset.versions);
});

$('#refresh-notifications').addEventListener('click', loadNotifications);
$('#apply-notification-filter').addEventListener('click', loadNotifications);

registerTabActivationHook('notifications', loadNotifications);
