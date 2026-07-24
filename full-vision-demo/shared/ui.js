(function attachUI(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FullVisionUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createUI() {
  'use strict';

  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const phaseLabel = (phase) => ({ global: 'Ürün Haritası', f1: 'Faz 1', f2: 'Faz 2', f3: 'Faz 3' }[phase] || phase);
  const personaLabel = (persona) => ({ manager: 'Yönetici', operations: 'Operasyon', teacher: 'Öğretmen', guidance: 'Rehber', guardian: 'Veli', student: 'Öğrenci', all: 'Tüm personelar' }[persona] || persona);

  function maturityBadge(maturity) {
    const tone = maturity.startsWith('Mevcut') ? 'proven' : maturity.startsWith('Vizyon') ? 'vision' : 'planned';
    const icon = tone === 'proven' ? '✓' : tone === 'vision' ? '◇' : '○';
    return `<span class="maturity-badge ${tone}"><span aria-hidden="true">${icon}</span>${escapeHtml(maturity)}</span>`;
  }

  function pageHeading(route, description, actions) {
    return `<header class="page-heading"><div><div class="context-row"><span class="phase-chip ${escapeHtml(route.phase)}">${escapeHtml(phaseLabel(route.phase))}</span>${maturityBadge(route.maturity)}<span class="priority-chip">${escapeHtml(route.priority)}</span></div><h2>${escapeHtml(route.title)}</h2><p>${escapeHtml(description)}</p></div><div class="heading-actions">${actions || ''}</div></header>`;
  }

  function metric(label, value, note, tone) {
    return `<article class="metric-card ${escapeHtml(tone || '')}"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value">${escapeHtml(value)}</strong><span class="metric-note">${escapeHtml(note)}</span></article>`;
  }

  function statusChip(label, tone) { return `<span class="status-chip ${escapeHtml(tone || 'neutral')}">${escapeHtml(label)}</span>`; }
  function emptyState(icon, title, body, action) { return `<section class="empty-state"><span class="empty-icon" aria-hidden="true">${escapeHtml(icon)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>${action || ''}</section>`; }

  function labelledValue(label, value) { return `<div class="labelled-value"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }

  return { escapeHtml, phaseLabel, personaLabel, maturityBadge, pageHeading, metric, statusChip, emptyState, labelledValue };
});
