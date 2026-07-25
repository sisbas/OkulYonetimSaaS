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
          { id: 'D-T-014', label: 'Demo Öğretmen A', branch: 'Matematik', available: false, dailyLoad: 6, weeklyLoad: 28, availabilityNote: 'İzin talep sahibi' },
          { id: 'D-T-021', label: 'Demo Öğretmen B', branch: 'Matematik', available: true, dailyLoad: 2, weeklyLoad: 18, availabilityNote: 'Aynı branş ve boş slot' },
          { id: 'D-T-026', label: 'Demo Öğretmen C', branch: 'Matematik', available: true, dailyLoad: 3, weeklyLoad: 21, availabilityNote: 'Derslik çakışması yok' },
          { id: 'D-T-031', label: 'Demo Öğretmen D', branch: 'Fizik', available: true, dailyLoad: 4, weeklyLoad: 22, availabilityNote: 'Branş uygun değil' },
          { id: 'D-T-044', label: 'Demo Öğretmen E', branch: 'Matematik', available: false, dailyLoad: 6, weeklyLoad: 30, availabilityNote: 'Aynı saatte dersi var' },
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
          id: 'D-LV-204', requesterId: 'D-T-014', requesterRole: 'teacher', decisionRole: 'operations_manager',
          durationKind: 'hourly', durationLabel: 'Saatlik izin', reasonCode: 'administrative', reasonLabel: 'İdari durum',
          interval: '09:00–16:45', status: 'pending', coveragePolicy: 'manager_may_approve_with_open_lessons',
          affectedLessonIds: ['D-SE-301', 'D-SE-302', 'D-SE-303'],
          candidatesByLesson: {
            'D-SE-301': ['D-T-021', 'D-T-044'],
            'D-SE-302': ['D-T-026', 'D-T-044'],
            'D-SE-303': ['D-T-021', 'D-T-026'],
          },
          candidateEvidenceByLesson: {
            'D-SE-301': [
              { teacherId: 'D-T-021', status: 'available', evidence: 'Aynı branş, slot boş, günlük yük 2/6' },
              { teacherId: 'D-T-044', status: 'blocked', evidence: 'Aynı slotta başka ders var' },
            ],
            'D-SE-302': [
              { teacherId: 'D-T-026', status: 'available', evidence: 'Aynı branş, derslik çakışması yok' },
              { teacherId: 'D-T-044', status: 'blocked', evidence: 'Günlük yük sınırında' },
            ],
            'D-SE-303': [
              { teacherId: 'D-T-021', status: 'available', evidence: 'Slot boş, haftalık yük dengeli' },
              { teacherId: 'D-T-026', status: 'available', evidence: 'Slot boş, aynı grup çakışması yok' },
            ],
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
        schedule: {
          lessonIds: ['D-SE-301', 'D-SE-302', 'D-SE-303', 'D-SE-304'],
          conflictCount: 0,
          generated: false,
          studio: {
            modeLabel: 'Denge öncelikli hazır çizelgeleme simülasyonu',
            seed: 'OKUL-SCHEDULER-2026-07-21-v2',
            requestedLessons: 48,
            placedLessons: 47,
            fitRateLabel: '47/48',
            progressPercent: 98,
            maxDepth: 180,
            stages: [
              { id: 'D-RLX-01', label: 'Sıkı kurallar', rule: 'Aynı ders günde en fazla 2 saat', placedLessons: 44, status: 'partial' },
              { id: 'D-RLX-02', label: 'Yumuşak gevşetme', rule: 'Blok bütünlüğü korunur, sınıf aralığı esnetilir', placedLessons: 47, status: 'selected' },
              { id: 'D-RLX-03', label: 'Acil geri dönüş', rule: 'Yalnız açık tanı için gösterilir', placedLessons: 47, status: 'not_used' },
            ],
            diagnostics: {
              classConstraints: [
                { id: 'D-DIAG-GRP-12S1', scopeId: 'D-GRP-12S1', label: '12-SAY-1 Salı kapasitesi', impact: '1 saat yerleşemedi', evidence: 'Son iki slot dolu' },
                { id: 'D-DIAG-GRP-MZS1', scopeId: 'D-GRP-MZS1', label: 'MEZ-SAY-1 blok bütünlüğü', impact: 'Çiftli blok korunuyor', evidence: 'Öğleden sonra tek boşluk var' },
              ],
              teacherConstraints: [
                { id: 'D-DIAG-T-014', teacherId: 'D-T-014', label: 'Demo Öğretmen A', impact: 'İzin penceresi nedeniyle kapalı', evidence: '09:00-16:45 arası karar bekliyor' },
                { id: 'D-DIAG-T-044', teacherId: 'D-T-044', label: 'Demo Öğretmen E', impact: 'Haftalık yük sınırı', evidence: '30/30 saat' },
              ],
              balance: [
                { id: 'D-BAL-12S1', groupId: 'D-GRP-12S1', label: '12-SAY-1', score: 86, evidence: 'Matematik iki güne yayılmış' },
                { id: 'D-BAL-MZS1', groupId: 'D-GRP-MZS1', label: 'MEZ-SAY-1', score: 78, evidence: 'Geometri öğleden sonraya yığılmış' },
              ],
            },
          },
        },
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
