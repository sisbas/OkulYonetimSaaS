'use strict';

// #494 screen module — Kullanıcılar ve roller. Mock-up frontend/design/users-roles.html
// portu: makine-okur izin anahtarı ile insan etiketi ayrımı; henüz canlı matris
// yayınlanmadığını dürüstçe söyleyen boş durum. İstemci yalnız görünürlüğü daraltır;
// yetki kararının kendisi sunucu @Permissions guard'ına aittir (#445, K-44/K-45).

function renderUsersRoles() {
  const matrix = document.querySelector('#users-roles-matrix');
  if (!matrix) return;
  // Canlı matris Faz 2 kararıdır; sahte satır/kullanıcı yok.
  matrix.innerHTML = `<div class="matrix-empty" role="row">
    <p class="hint" id="users-roles-empty-heading">Kullanıcı ve rol matrisi henüz canlı yayınlanmadı.</p>
    <ul class="matrix-legend" aria-label="Satır ve sütun biçimi">
      <li>Satır: kullanıcı</li>
      <li>Sütun: izin anahtarı (makine-okur)</li>
      <li>Hücre: izin verildi / reddedildi / boş</li>
    </ul>
  </div>`;
}

if (typeof registerTabActivationHook === 'function') registerTabActivationHook('yonetim', renderUsersRoles);
renderUsersRoles();
