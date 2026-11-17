'use strict';

// #494 screen module — Raporlar. Mock-up frontend/design/reports.html portu:
// yalnız "açık iş ve yük özeti" başlığını destekler; Faz 2 kapsamı net değildir ve
// fiziksel kapanış/teslimat iddiası taşımaz. Rapor yükü karantinadır; canlı verinin
// teslimi onaylı değil. Satır üretilmez.

function renderReports() {
  const cards = document.querySelector('#report-cards');
  if (!cards) return;
  // Dürüst boş durum: Faz 2 sonrası karar; sahte veri üretilmez.
  cards.innerHTML = `<section class="empty-state" aria-labelledby="empty-reports-heading">
    <h3 id="empty-reports-heading">Gösterilecek rapor yok</h3>
    <p class="hint">Rapor yükü Faz 2 kapsamında onaylı değil; bu yük fiziksel kapanış/teslimat iddiası taşımaz; özet yalnız dürüst içerikle yayınlanır.</p>
  </section>`;
}

if (typeof registerTabActivationHook === 'function') registerTabActivationHook('raporlar', renderReports);
renderReports();
