'use strict';

// #494 screen module — Tanımlar. Mock-up frontend/design/definitions.html portu:
// altı kaynak türü (Öğretmen/Grup/Öğrenci/Ders/Derslik/Saat dilimi), liste/arama/detay
// iskeleti. Canlı liste Faz 2'de bağlanır; bu yüzden her durum dürüst bir boş duruma
// düşer; sahte veri üretilmez.

const DEFINITION_SOURCES = {
  teachers: 'Öğretmen',
  groups: 'Grup',
  students: 'Öğrenci',
  courses: 'Ders',
  rooms: 'Derslik',
  'time-slots': 'Saat dilimi',
};

function renderDefinitions() {
  const list = document.querySelector('#definition-list');
  const typeEl = document.querySelector('#definition-type');
  if (!list) return;
  const selected = String(typeEl?.value || '');
  const label = DEFINITION_SOURCES[selected] || 'Tanımlar';
  // Dürüst boş durum: canlı kaynak listesi Faz 2 kararıdır; sahte satır yok.
  list.innerHTML = `<section class="empty-state" aria-labelledby="empty-definitions-heading">
    <h3 id="empty-definitions-heading">Kayıt yok</h3>
    <p class="hint">${escapeHtml(label)} kaynağı için canlı liste Faz 2 kapsamında değerlendirilecek; bu yüzey şu an dürüst boş durum gösterir.</p>
  </section>`;
}

if (typeof registerTabActivationHook === 'function') registerTabActivationHook('tanimlar', renderDefinitions);
renderDefinitions();

document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.id === 'definition-type' || target.id === 'definition-search') renderDefinitions();
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.id === 'definition-search') renderDefinitions();
});
