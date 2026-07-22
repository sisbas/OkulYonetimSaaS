(function attachScenarioManifest(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FullVisionScenarios = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createScenarioManifest() {
  'use strict';

  const scenarios = {
    operations: {
      id: 'operations',
      title: 'Operasyon günü: izinden veli bilgilendirmeye',
      persona: 'operations',
      status: 'P0 dikey dilim',
      steps: [
        { id: 'daily', routeId: 'f1-operations', path: '/demo/f1/operations', label: 'Günü gör', note: 'Operasyon uyarılarından izin etkisini açın.' },
        { id: 'leave', routeId: 'f1-leave-detail', path: '/demo/f1/leaves/D-LV-204', label: 'İzni çöz', note: 'Üç etkilenen derse uygun yedekleri atayıp demo kararını tamamlayın.' },
        { id: 'schedule', routeId: 'f1-schedule', path: '/demo/f1/schedule?view=lifecycle', label: 'Programı doğrula', note: 'Yedek atamalarının program yansımasını doğrulayın.' },
        { id: 'attendance', routeId: 'f1-attendance-detail', path: '/demo/f1/attendance/D-AT-1204', label: 'Yoklamayı tamamla', note: 'Eksik durumları tamamlayıp oturumu demo durumunda kapatın.' },
        { id: 'notification', routeId: 'f1-notifications', path: '/demo/f1/notifications', label: 'Bilgilendirmeyi onayla', note: 'Uygun kayıtta gönderim simülasyonunu tamamlayın.' },
        { id: 'complete', routeId: 'f1-operations', path: '/demo/f1/operations?status=complete', label: 'Günü kapat', note: 'Tamamlanan operasyon gününü ve sıfırlama seçeneğini gösterin.' },
      ],
    },
    guidance: { id: 'guidance', title: 'Rehberlik: sinyalden takip aksiyonuna', persona: 'guidance', status: 'GATE 3', steps: [] },
    executive: { id: 'executive', title: 'Üst yönetim: görünümden senaryoya', persona: 'manager', status: 'GATE 4', steps: [] },
    teacher: { id: 'teacher', title: 'Öğretmen: günlük görünüm ve yoklama', persona: 'teacher', status: 'GATE 3', steps: [] },
  };

  function getScenario(id) { return scenarios[id] || null; }
  function getStep(scenario, requested) {
    if (!scenario || !scenario.steps.length) return null;
    const index = Math.max(0, Math.min(Number(requested || 1) - 1, scenario.steps.length - 1));
    return { ...scenario.steps[index], index, number: index + 1 };
  }

  return { scenarios, getScenario, getStep };
});
