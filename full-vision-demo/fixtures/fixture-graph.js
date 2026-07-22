(function attachFixtureGraph(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FullVisionFixtures = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFixtureModule() {
  'use strict';

  const SEED = 'OKUL-FULL-VISION-2026-07-21-v1';
  const FIXED_CLOCK = '2026-07-21T09:00:00+03:00';

  function createFixtureGraph() {
    return {
      meta: { seed: SEED, fixtureVersion: '1.0.0', fixedClock: FIXED_CLOCK, synthetic: true, persistent: false },
      catalogue: {
        phases: [
          { id: 'f1', label: 'Faz 1', title: 'Operasyon Çekirdeği', accent: '#3568D4', modules: 8, maturity: 'Mevcut ve planlanan simülasyonlar' },
          { id: 'f2', label: 'Faz 2', title: 'Akademik Yönetim', accent: '#0F766E', modules: 8, maturity: 'Planlanan etkileşimli simülasyon' },
          { id: 'f3', label: 'Faz 3', title: 'Yönetim Vizyonu', accent: '#6D4CC3', modules: 5, maturity: 'Kavramsal simülasyon' },
        ],
        personas: [
          { id: 'manager', label: 'Kurum Yöneticisi', value: 'Performans, kapasite ve yönetişim' },
          { id: 'operations', label: 'Operasyon Sorumlusu', value: 'Program, izin, yoklama ve iletişim' },
          { id: 'teacher', label: 'Öğretmen', value: 'Günlük ders, izin ve yoklama' },
          { id: 'guidance', label: 'Rehber Öğretmen', value: 'Öğrenci trendi ve takip' },
          { id: 'guardian', label: 'Veli', value: 'Salt-okunur öğrenci özeti' },
          { id: 'student', label: 'Öğrenci', value: 'Kendi akademik görünümü' },
        ],
        access: [],
      },
      organization: { id: 'D-ORG-001', name: 'Demo Eğitim Kurumu', campuses: [{ id: 'D-CAM-A', name: 'Kampüs A' }] },
      coreDefinitions: {
        teachers: [
          { id: 'D-T-014', label: 'Demo Öğretmen A', branch: 'Matematik', available: false },
          { id: 'D-T-021', label: 'Demo Öğretmen B', branch: 'Matematik', available: true },
          { id: 'D-T-026', label: 'Demo Öğretmen C', branch: 'Matematik', available: true },
          { id: 'D-T-031', label: 'Demo Öğretmen D', branch: 'Fizik', available: true },
          { id: 'D-T-044', label: 'Demo Öğretmen E', branch: 'Matematik', available: false },
        ],
        groups: [
          { id: 'D-GRP-12S1', label: '12-SAY-1' },
          { id: 'D-GRP-MZS1', label: 'MEZ-SAY-1' },
          { id: 'D-GRP-12S2', label: '12-SAY-2' },
        ],
        rooms: [{ id: 'D-R-02', label: 'Derslik 2' }, { id: 'D-R-03', label: 'Derslik 3' }, { id: 'D-R-05', label: 'Derslik 5' }],
      },
      operations: {
        daily: {
          dateLabel: '21 Temmuz 2026 · Salı',
          lessons: [
            { id: 'D-SE-301', time: '09:30–10:50', course: 'TYT Matematik', groupId: 'D-GRP-12S1', roomId: 'D-R-02', teacherId: 'D-T-014', leaveAffected: true },
            { id: 'D-SE-302', time: '13:30–14:50', course: 'TYT Geometri', groupId: 'D-GRP-MZS1', roomId: 'D-R-03', teacherId: 'D-T-014', leaveAffected: true },
            { id: 'D-SE-303', time: '15:10–16:30', course: 'AYT Matematik', groupId: 'D-GRP-12S2', roomId: 'D-R-05', teacherId: 'D-T-014', leaveAffected: true },
            { id: 'D-SE-304', time: '11:10–12:30', course: 'AYT Fizik', groupId: 'D-GRP-12S2', roomId: 'D-R-02', teacherId: 'D-T-031', leaveAffected: false },
          ],
        },
        leaves: [{
          id: 'D-LV-204', requesterId: 'D-T-014', type: 'Saatlik izin', reasonCode: 'İdari durum', interval: '09:00–16:45', status: 'pending',
          affectedLessonIds: ['D-SE-301', 'D-SE-302', 'D-SE-303'],
          candidatesByLesson: {
            'D-SE-301': ['D-T-021', 'D-T-044'],
            'D-SE-302': ['D-T-026', 'D-T-044'],
            'D-SE-303': ['D-T-021', 'D-T-026'],
          },
        }],
        attendance: [{
          id: 'D-AT-1204', lessonId: 'D-SE-301', state: 'open',
          students: [
            { id: 'D-S-001', code: 'Öğrenci D-001', status: 'present' },
            { id: 'D-S-002', code: 'Öğrenci D-002', status: 'present' },
            { id: 'D-S-003', code: 'Öğrenci D-003', status: 'absent' },
            { id: 'D-S-004', code: 'Öğrenci D-004', status: null },
          ],
        }],
        notifications: [
          { id: 'D-NT-034', studentId: 'D-S-003', channelLabel: 'Maskeli mobil kanal', template: 'Derse katılım bilgilendirmesi', eligibility: 'eligible', status: 'pending' },
          { id: 'D-NT-035', studentId: 'D-S-004', channelLabel: 'Kanal uygun değil', template: 'Geç katılım bilgilendirmesi', eligibility: 'blocked_kvkk', status: 'blocked' },
        ],
        schedule: { lessonIds: ['D-SE-301', 'D-SE-302', 'D-SE-303', 'D-SE-304'], conflictCount: 0, generated: false },
        reports: [],
      },
      academics: { strategy: [], assessments: [], results: [], students: [], workload: [], import: [], portal: [] },
      guidance: { cases: [], controlledCategories: [] },
      vision: { precomputed: true, isPrediction: false, command: [], signals: [], scenarios: [], reports: [], network: [] },
      integrations: { networkCall: false, connectors: [] },
    };
  }

  function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
  function labelById(graph, id) {
    const collections = [graph.coreDefinitions.teachers, graph.coreDefinitions.groups, graph.coreDefinitions.rooms];
    const item = collections.flat().find((entry) => entry.id === id);
    return item ? item.label : id;
  }

  return { SEED, FIXED_CLOCK, createFixtureGraph, deepClone, labelById };
});
