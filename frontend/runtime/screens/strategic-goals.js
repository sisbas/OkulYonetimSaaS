'use strict';

// #483 screen module — Stratejik hedefler (mock-up frontend/design/strategic-goals.html
// portu). Yönetici yazar (strategic_goal:manage), öğretmen salt-okunur görür
// (strategic_goal:read). Deploy yeteneği `strategic_goals` kapalıyken bölge
// hiç render edilmez; sunucu rota vermez (404, varlık sızmaz).
//
// Sözleşmeler (test/frontend-runtime/strategic-goals.spec.ts'te pinlenir):
// - Akademik yıl istemcide tarihten türetilir: Eylül başlangıç, bu dönem ± 1.
// - Liste metrik etiketi, hedef, gerçekleşme, oran (gerçekleşme/hedef) ve
//   güncellenme zamanını taşır; oran %100'ü aşarsa ham değerle yazılır.
// - Tekillik sunucudadır (kirum + yıl + metrik): 409 duplicate_metric_year
//   okunabilir bir nedenle karşılanır, ham kod arayüze sızmaz.
// - Yazma yetkisi olmayan aktörün DOM'unda yazma kontrolü bulunmaz.
// - Durumlar tek yoldan gelir: renderRegionState / EMPTY_COPY.

const STRATEGIC_GOALS_DEPLOY_CAPABILITY = 'strategic_goals';

// Yazma kontrolleri bu modülün sahipliğindedir: yalnız yazan aktör için
// DOM'a basılır, salt-okunur aktörde kapsayıcı boş kalır.
const STRATEGIC_GOALS_CONTROLS_HTML = `
  <div>
    <button type="button" id="strategic-goals-add">Hedef ekle</button>
  </div>
  <form id="strategic-goal-create" class="filter-grid hidden" aria-label="Yeni hedef" novalidate>
    <label>
      Metrik anahtarı
      <input id="strategic-goal-key" name="metricKey" type="text" maxlength="120" autocomplete="off" />
    </label>
    <label>
      Metrik etiketi
      <input id="strategic-goal-label" name="metricLabel" type="text" maxlength="200" autocomplete="off" />
    </label>
    <label>
      Hedef değer
      <input id="strategic-goal-target" name="targetValue" type="number" step="any" />
    </label>
    <div class="stack">
      <button type="submit" id="strategic-goal-create-submit">Hedefi kaydet</button>
      <button type="button" id="strategic-goal-create-cancel">Vazgeç</button>
    </div>
  </form>
  <form id="strategic-goal-progress" class="filter-grid hidden" aria-label="Gerçekleşme girişi" novalidate>
    <label>
      Gerçekleşme
      <input id="strategic-goal-progress-value" name="progressValue" type="number" step="any" />
    </label>
    <div class="stack">
      <button type="submit" id="strategic-goal-progress-submit">Gerçekleşmeyi kaydet</button>
      <button type="button" id="strategic-goal-progress-cancel">Vazgeç</button>
    </div>
  </form>
  <div id="strategic-goal-delete" class="matrix hidden" role="alert"></div>
`;

let strategicGoalId = '';

/** Akademik yıl Eylül'de başlar: Eylül-Aralık → bu yıl, Ocak-Ağustos → önceki yıl. */
function strategicGoalsPeriod(now = new Date()) {
  const year = now.getFullYear();
  const start = now.getMonth() >= 8 ? year : year - 1;
  return `${start}-${start + 1}`;
}

function strategicGoalsPeriodOptions(period) {
  const start = Number(String(period || '').slice(0, 4));
  if (!Number.isFinite(start)) return [];
  return [start - 1, start, start + 1].map((value) => `${value}-${value + 1}`);
}

function strategicGoalsNumber(value) {
  if (value === null || value === undefined || value === '') return 'Girilmedi';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Girilmedi';
  return new Intl.NumberFormat('tr-TR').format(number);
}

function strategicGoalsRatio(progressValue, targetValue) {
  if (progressValue === null || progressValue === undefined || progressValue === '') return 'Hesaplanmadı';
  const target = Number(targetValue);
  if (!Number.isFinite(target) || target === 0) return 'Hesaplanmadı';
  const ratio = (Number(progressValue) / target) * 100;
  if (!Number.isFinite(ratio)) return 'Hesaplanmadı';
  // %100 üstü ham değerle yazılır; üst sınır uydurulmaz.
  return `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(ratio)}`;
}

/** Yüzey hem deploy'da var olmalı (yetenek) hem de okunabilir olmalı (izin). */
function strategicGoalsSurfaceAvailable() {
  const capabilities = Array.isArray(state.capabilities) ? state.capabilities : [];
  return capabilities.includes(STRATEGIC_GOALS_DEPLOY_CAPABILITY) && canRequest('GET', '/strategic-goals');
}

function strategicGoalsCanManage() {
  return canRequest('POST', '/strategic-goals');
}

function strategicGoalsSelectedYear() {
  const select = document.querySelector('#strategic-goals-year');
  const value = String(select?.value || '').trim();
  return value || strategicGoalsPeriod();
}

function renderStrategicGoalsYearOptions() {
  const select = document.querySelector('#strategic-goals-year');
  if (!select) return;
  const period = strategicGoalsPeriod();
  const options = strategicGoalsPeriodOptions(period);
  const current = String(select.value || '').trim();
  select.innerHTML = options
    .map((option) => {
      const label = option === period ? `${option} (bu dönem)` : option;
      return `<option value="${escapeHtml(option)}">${escapeHtml(label)}</option>`;
    })
    .join('');
  select.value = options.includes(current) ? current : period;
}

function strategicGoalsRowHtml(goal, canManage) {
  const id = String(pick(goal, ['id'], ''));
  const label = String(pick(goal, ['metricLabel'], '') || '').trim() || 'Adsız metrik';
  const metricKey = String(pick(goal, ['metricKey'], ''));
  const target = pick(goal, ['targetValue'], '');
  const progress = pick(goal, ['progressValue'], null);
  const updatedAt = String(pick(goal, ['updatedAt'], ''));
  const actions = canManage
    ? `<td class="quick-actions">
        <button type="button" data-action="strategic-goal-progress" data-goal-id="${escapeHtml(id)}">Gerçekleşme gir</button>
        <button type="button" data-action="strategic-goal-delete" data-goal-id="${escapeHtml(id)}">Sil</button>
      </td>`
    : '';
  return `<tr data-metric-key="${escapeHtml(metricKey)}">
    <td>${escapeHtml(label)}</td>
    <td>${escapeHtml(strategicGoalsNumber(target))}</td>
    <td>${escapeHtml(strategicGoalsNumber(progress))}</td>
    <td>${escapeHtml(strategicGoalsRatio(progress, target))}</td>
    <td>${escapeHtml(formatStamp(updatedAt))}</td>
    ${actions}
  </tr>`;
}

function renderStrategicGoalsTable(rows) {
  const target = document.querySelector('#strategic-goals-table');
  if (!target) return;
  const canManage = strategicGoalsCanManage();
  if (!rows.length) {
    empty(target, 'strategicGoals');
    return;
  }
  const actionHeader = canManage ? '<th scope="col">İşlem</th>' : '';
  target.innerHTML = `<table class="goals-table" role="grid" aria-labelledby="strategic-goals-heading">
    <caption>Akademik yıl ${escapeHtml(strategicGoalsSelectedYear())} için tanımlı hedefler</caption>
    <thead>
      <tr>
        <th scope="col">Metrik</th>
        <th scope="col">Hedef</th>
        <th scope="col">Gerçekleşme</th>
        <th scope="col">Oran</th>
        <th scope="col">Güncellendi</th>
        ${actionHeader}
      </tr>
    </thead>
    <tbody>${rows.map((goal) => strategicGoalsRowHtml(goal, canManage)).join('')}</tbody>
  </table>`;
}

/** Yazma kontrolleri yalnız yazan aktöre basılır; salt-okunurda kapsayıcı boş kalır. */
function renderStrategicGoalsControls() {
  const controls = document.querySelector('#strategic-goals-controls');
  if (!controls) return;
  controls.innerHTML = strategicGoalsCanManage() ? STRATEGIC_GOALS_CONTROLS_HTML : '';
}

function strategicGoalsFormStatus(message, tone = 'neutral') {
  const status = document.querySelector('#strategic-goal-form-status');
  if (!status) return;
  status.textContent = message || '';
  status.dataset.tone = tone;
}

function strategicGoalsToggleForm(selector, visible) {
  const form = document.querySelector(selector);
  if (!form) return;
  form.classList.toggle('hidden', !visible);
}

function strategicGoalsHideSurface() {
  const section = document.querySelector('#strategic-goals-section');
  if (section) section.classList.add('hidden');
  const controls = document.querySelector('#strategic-goals-controls');
  if (controls) controls.innerHTML = '';
  const table = document.querySelector('#strategic-goals-table');
  if (table) table.innerHTML = '';
}

async function loadStrategicGoals() {
  const target = document.querySelector('#strategic-goals-table');
  if (!target) return;
  if (!strategicGoalsSurfaceAvailable()) {
    strategicGoalsHideSurface();
    return;
  }
  target.innerHTML = loading('Stratejik hedefler getiriliyor');
  try {
    const year = strategicGoalsSelectedYear();
    const { body } = await apiRequest(`/strategic-goals?academicYear=${encodeURIComponent(year)}`);
    const rows = asArray(body, ['strategicGoals', 'items', 'data']);
    renderStrategicGoalsTable(rows);
  } catch (error) {
    // #483: yüzey bu kurulumda yoksa sunucu 404 döner; varlık sızmaz ve
    // "bulunamadı" yorumu yapılmaz — yüzeyin olmadığı söylenir.
    if (error && error.status === 404) {
      renderRegionState(target, 'unknown_server_state', 'Stratejik hedefler bu kurulumda kullanılamıyor.');
      return;
    }
    renderError(target, error);
  }
}

async function renderStrategicGoals() {
  const section = document.querySelector('#strategic-goals-section');
  if (!section) return;
  if (!strategicGoalsSurfaceAvailable()) {
    strategicGoalsHideSurface();
    return;
  }
  section.classList.remove('hidden');
  renderStrategicGoalsYearOptions();
  renderStrategicGoalsControls();
  await loadStrategicGoals();
}

function openStrategicGoalCreate() {
  strategicGoalsToggleForm('#strategic-goal-create', true);
  strategicGoalsFormStatus('');
}

function closeStrategicGoalCreate() {
  strategicGoalsToggleForm('#strategic-goal-create', false);
}

function openStrategicGoalProgress(goalId) {
  strategicGoalId = String(goalId || '');
  if (!strategicGoalId) return;
  const input = document.querySelector('#strategic-goal-progress-value');
  if (input) input.value = '';
  strategicGoalsToggleForm('#strategic-goal-progress', true);
  strategicGoalsFormStatus('');
}

function closeStrategicGoalProgress() {
  strategicGoalsToggleForm('#strategic-goal-progress', false);
  strategicGoalId = '';
}

function openStrategicGoalDelete(goalId) {
  strategicGoalId = String(goalId || '');
  if (!strategicGoalId) return;
  const region = document.querySelector('#strategic-goal-delete');
  if (!region) return;
  region.innerHTML = `<p><strong>Hedefi silmek istediğinizden emin misiniz?</strong></p>
    <p class="hint">Silinen hedef listeden kaybolur; işlem geri alınamaz.</p>
    <div class="quick-actions">
      <button type="button" data-action="strategic-goal-delete-confirm">Evet, sil</button>
      <button type="button" data-action="strategic-goal-delete-cancel">Vazgeç</button>
    </div>`;
  region.classList.remove('hidden');
}

function closeStrategicGoalDelete() {
  const region = document.querySelector('#strategic-goal-delete');
  if (region) {
    region.classList.add('hidden');
    region.innerHTML = '';
  }
  strategicGoalId = '';
}

async function submitStrategicGoal() {
  if (!requireSession()) return;
  if (!strategicGoalsCanManage()) {
    strategicGoalsFormStatus('Bu işlem için yetkiniz yok.', 'warning');
    return;
  }
  const keyInput = document.querySelector('#strategic-goal-key');
  const labelInput = document.querySelector('#strategic-goal-label');
  const targetInput = document.querySelector('#strategic-goal-target');
  const metricKey = String(keyInput?.value || '').trim();
  const metricLabel = String(labelInput?.value || '').trim();
  const targetValue = Number(targetInput?.value);
  if (!metricKey) {
    strategicGoalsFormStatus('Metrik anahtarı zorunludur.', 'warning');
    return;
  }
  if (!Number.isFinite(targetValue)) {
    strategicGoalsFormStatus('Hedef değer bir sayı olmalı.', 'warning');
    return;
  }
  try {
    await apiRequest('/strategic-goals', {
      method: 'POST',
      body: {
        academicYear: strategicGoalsSelectedYear(),
        metricKey,
        metricLabel: metricLabel || null,
        targetValue,
      },
    });
    strategicGoalsFormStatus('Hedef kaydedildi.', 'success');
    if (keyInput) keyInput.value = '';
    if (labelInput) labelInput.value = '';
    if (targetInput) targetInput.value = '';
    closeStrategicGoalCreate();
    await loadStrategicGoals();
  } catch (error) {
    strategicGoalsFormStatus(error?.message || 'Hedef kaydedilemedi.', 'danger');
  }
}

async function submitStrategicGoalProgress() {
  if (!requireSession()) return;
  if (!strategicGoalsCanManage() || !strategicGoalId) {
    strategicGoalsFormStatus('Bu işlem için yetkiniz yok.', 'warning');
    return;
  }
  const input = document.querySelector('#strategic-goal-progress-value');
  const progressValue = Number(input?.value);
  if (!Number.isFinite(progressValue)) {
    strategicGoalsFormStatus('Gerçekleşme bir sayı olmalı.', 'warning');
    return;
  }
  try {
    await apiRequest(`/strategic-goals/${encodeURIComponent(strategicGoalId)}`, {
      method: 'PATCH',
      body: { progressValue },
    });
    strategicGoalsFormStatus('Gerçekleşme kaydedildi.', 'success');
    closeStrategicGoalProgress();
    await loadStrategicGoals();
  } catch (error) {
    strategicGoalsFormStatus(error?.message || 'Gerçekleşme kaydedilemedi.', 'danger');
  }
}

async function deleteStrategicGoal() {
  if (!requireSession()) return;
  if (!strategicGoalsCanManage() || !strategicGoalId) {
    strategicGoalsFormStatus('Bu işlem için yetkiniz yok.', 'warning');
    return;
  }
  try {
    await apiRequest(`/strategic-goals/${encodeURIComponent(strategicGoalId)}`, { method: 'DELETE' });
    strategicGoalsFormStatus('Hedef silindi.', 'success');
    closeStrategicGoalDelete();
    await loadStrategicGoals();
  } catch (error) {
    strategicGoalsFormStatus(error?.message || 'Hedef silinemedi.', 'danger');
  }
}

if (typeof registerTabActivationHook === 'function') registerTabActivationHook('yonetim', renderStrategicGoals);

document.addEventListener('click', (event) => {
  const target = event.target?.closest ? event.target.closest('button') : null;
  if (!target) return;
  if (target.id === 'strategic-goals-add') {
    openStrategicGoalCreate();
    return;
  }
  if (target.id === 'strategic-goal-create-cancel') {
    closeStrategicGoalCreate();
    return;
  }
  if (target.id === 'strategic-goal-progress-cancel') {
    closeStrategicGoalProgress();
    return;
  }
  const action = target.dataset.action;
  if (action === 'strategic-goal-progress') openStrategicGoalProgress(target.dataset.goalId);
  if (action === 'strategic-goal-delete') openStrategicGoalDelete(target.dataset.goalId);
  if (action === 'strategic-goal-delete-confirm') deleteStrategicGoal();
  if (action === 'strategic-goal-delete-cancel') closeStrategicGoalDelete();
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.id === 'strategic-goals-year') loadStrategicGoals();
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!form) return;
  if (form.id === 'strategic-goal-create') {
    event.preventDefault();
    submitStrategicGoal();
  }
  if (form.id === 'strategic-goal-progress') {
    event.preventDefault();
    submitStrategicGoalProgress();
  }
});
