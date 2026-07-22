(function attachClaimManifest(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FullVisionClaims = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createClaimManifest() {
  'use strict';

  const sets = {
    global: { shows: 'Faz, persona ve olgunluk etiketlerini tek ürün haritasında gösterir.', boundary: 'Bu prototip yalnız satış ve ürün vizyonu anlatımıdır.' },
    operations: { shows: 'Günlük operasyon istisnalarının tek görünümde nasıl ele alınabileceğini gösterir.', boundary: 'Kartlar sabit sentetik veriden üretilir.' },
    simulation: { shows: 'Planlanan iş akışının tıklanabilir bir örneğini gösterir.', boundary: 'Etkileşim yalnız tarayıcı belleğindeki demo durumunu değiştirir.' },
    schedule: { shows: 'Program etkilerinin önceden hazırlanmış bir görünümünü gösterir.', boundary: 'Program üretimi veya yayınlama işlemi yapılmaz.' },
    leave: { shows: 'İzin kararının ders etkisi ve yedek öğretmen seçimiyle birlikte ele alınmasını gösterir.', boundary: 'İzin ve görevlendirme yalnız demo durumunda güncellenir.' },
    attendance: { shows: 'Kodlu sentetik öğrenciler üzerinde yoklama iş akışını gösterir.', boundary: 'Öğrenci kaydı veya kurum verisi işlenmez.' },
    notification: { shows: 'İnsan onayı ve kanal uygunluğu bulunan bilgilendirme akışını gösterir.', boundary: 'Gerçek mesaj gönderilmez; yalnız gönderim simülasyonu tamamlanır.' },
    access: { shows: 'Rol ve işlem izi tasarımını örnekler.', boundary: 'Persona seçimi gerçek yetkilendirme uygulamaz.' },
    guidance: { shows: 'Kodlu öğrenci sinyalleri ve kontrollü takip aksiyonlarını örnekler.', boundary: 'Serbest hassas not, tanı veya kişi bilgisi bulunmaz.' },
    portal: { shows: 'Öğrenci ve veli için salt-okunur ürün görünümünü örnekler.', boundary: 'Hesap, oturum veya gerçek hane verisi yoktur.' },
    vision: { shows: 'Önceden hazırlanmış yönetim senaryolarını kavramsal olarak karşılaştırır.', boundary: 'Tahmin, canlı model veya sonuç garantisi sunmaz.' },
    integration: { shows: 'Bağlantı ve alan eşleme fikrini görsel olarak örnekler.', boundary: 'Dış sisteme bağlantı kurulmaz.' },
  };

  const forbiddenPatterns = [
    'CP-SAT', 'global optimum', 'optimum program', 'canlı solver', 'canlı AI', 'AI risk tahmini',
    'öğrenci başarısızlık tahmini', 'gerçek risk tahmini', 'gerçek publish', 'kaydedildi',
    'SMS gönderildi', 'e-posta gönderildi', 'entegrasyon aktif', 'yetki uygulandı', 'KVKK sertifikalı', 'production hazır',
  ];

  const approvedPhrases = ['Canlı AI sonucu değildir.'];

  const replacements = {
    'SMS/e-posta gönderildi': 'Gönderim simülasyonu tamamlandı',
    'İzin kaydedildi/onaylandı': 'Demo durumu güncellendi',
    'Canlı program çözümü': 'Hazır program senaryosu gösterildi',
    'Risk tahmini': 'Önceden tanımlı destek sinyali',
    'AI raporu': 'Önceden hazırlanmış rapor örneği',
    'Rol uygulandı': 'Persona görünümü seçildi',
    'Entegrasyon aktif': 'Kavramsal bağlantı önizlemesi',
  };

  function getClaimSet(id) { return sets[id] || sets.simulation; }
  function findForbiddenClaims(value) {
    let normalized = String(value || '').toLocaleLowerCase('tr-TR');
    approvedPhrases.forEach((phrase) => { normalized = normalized.replaceAll(phrase.toLocaleLowerCase('tr-TR'), ''); });
    return forbiddenPatterns.filter((claim) => normalized.includes(claim.toLocaleLowerCase('tr-TR')));
  }

  return { sets, forbiddenPatterns, approvedPhrases, replacements, getClaimSet, findForbiddenClaims };
});
