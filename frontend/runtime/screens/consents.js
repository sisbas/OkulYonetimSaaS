'use strict';

// #442 screen module — onay kayıtları (consents). Aynı core sözleşmesi:
// paylaşılan state ve yardımcılar core'da, bu dosya yalnız kendi alanını
// taşır ve kendi eylemlerinin delegation'ını/KVKK onay geri çekme akışını
// kablolama ve delegation ile üstlenir.

function renderConsentCard(row) {
  const subjectType = pick(row, ['subjectType'], 'student');
  const subjectRefId = pick(row, ['subjectRefId']);
  const consentType = pick(row, ['consentType'], '');
  const status = String(pick(row, ['status'], 'unknown')).toLowerCase();
  const revocable = status === 'approved';
  const legalBasis = pick(row, ['legalBasis'], '');
  const retentionDays = pick(row, ['retentionDays'], null);
  const consentTypeLabel = displayTerm(consentTypeLabels, consentType, 'Onay kaydı');
  const subjectLabel = displayTerm(consentSubjectLabels, subjectType, 'Kapsam dışı');
  return `<article class="card">
    <h3>${escapeHtml(consentTypeLabel)} · ${escapeHtml(displayStatus(status))}</h3>
    <p class="card-meta">
      <span>Özne: ${escapeHtml(subjectLabel)}</span>
      <span>Sürüm: ${escapeHtml(pick(row, ['version'], 0))}</span>
      ${legalBasis ? `<span>Hukuki sebep: ${escapeHtml(legalBasis)}</span>` : ''}
      ${retentionDays !== null && retentionDays !== undefined && retentionDays !== ''
        ? `<span>Saklama: ${escapeHtml(retentionDays)} gün</span>`
        : ''}
      <span>${escapeHtml(formatStamp(pick(row, ['createdAt'], '')))}</span>
    </p>
    ${revocable
      ? `<button type="button" data-action="consent-revoke" data-subject-ref-id="${escapeHtml(subjectRefId)}" data-subject-type="${escapeHtml(subjectType)}" data-consent-type="${escapeHtml(consentType)}" ${mutationDisabled() ? 'disabled' : ''}>Onayı geri çek</button>`
      : '<p class="hint">Onay zaten kapalı; geri çekilecek bir kayıt yok.</p>'}
  </article>`;
}

async function loadConsents() {
  if (!requireSession()) return;
  const target = $('#consents-output');
  target.innerHTML = loading('Onaylar getiriliyor');
  try {
    const { body } = await apiRequest('/consents');
    const rows = asArray(body, ['consents', 'items']);
    if (rows.length) {
      target.innerHTML = rows.map(renderConsentCard).join('');
      announce(`${rows.length} onay kaydı listelendi.`, 'success');
    } else {
      empty(target, 'consents');
    }
  } catch (error) {
    renderError(target, error);
  }
}

async function revokeConsent(subjectRefId, subjectType, consentType) {
  if (!requireSession()) return;
  const target = $('#consents-output');
  target.innerHTML = loading('Onay geri çekiliyor');
  try {
    const { body } = await apiRequest('/consents/revoke', {
      method: 'POST',
      body: { subjectRefId, subjectType, consentType },
    });
    announce(`Onay geri çekildi · ${displayTerm(consentTypeLabels, pick(body, ['consentType'], consentType), 'Onay kaydı')} (${escapeHtml(displayStatus(pick(body, ['status'], 'revoked')))}).`, 'success');
    await loadConsents();
  } catch (error) {
    renderError(target, error);
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.action === 'consent-revoke') revokeConsent(target.dataset.subjectRefId, target.dataset.subjectType, target.dataset.consentType);
});

$('#refresh-consents').addEventListener('click', loadConsents);
