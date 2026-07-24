(function attachPhaseOne(root, factory) {
  const deps = {
    fixtures: root.FullVisionFixtures || (typeof require === 'function' ? require('../../fixtures/fixture-graph.js') : null),
    state: root.FullVisionState || (typeof require === 'function' ? require('../../app-shell/state.js') : null),
    ui: root.FullVisionUI || (typeof require === 'function' ? require('../../shared/ui.js') : null),
  };
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FullVisionPhaseOne = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPhaseOne(dependencies) {
  'use strict';

  const { fixtures, state: stateModule, ui } = dependencies;

  const graph = fixtures.createFixtureGraph();
  const { escapeHtml: esc, pageHeading, metric, statusChip, emptyState, labelledValue } = ui;

  const lessonById = (id) => graph.operations.daily.lessons.find((lesson) => lesson.id === id);
  const leaveById = (id) => graph.operations.leaves.find((leave) => leave.id === id);
  const attendanceById = (id) => graph.operations.attendance.find((session) => session.id === id);
  const teacherById = (id) => graph.coreDefinitions.teachers.find((teacher) => teacher.id === id);
  const groupById = (id) => graph.coreDefinitions.groups.find((group) => group.id === id);
  const roomById = (id) => graph.coreDefinitions.rooms.find((room) => room.id === id);

  function routeLink(path, label, className) { return `<a class="${className || 'button'}" href="${esc(path)}" data-route>${esc(label)}</a>`; }
  function coverageLabel(status) {
    return {
      not_required: 'Kapsama gerekmiyor',
      unresolved: 'Açık ders var',
      partially_covered: 'Kısmi kapsama',
      covered: 'Tam kapsama',
    }[status] || status;
  }
  function coverageTone(status) { return status === 'covered' || status === 'not_required' ? 'success' : 'warning'; }
  function evidenceByLesson(leave, lessonId) { return leave.candidateEvidenceByLesson?.[lessonId] || []; }

  function overview(route) {
    return `${pageHeading(route, 'Faz 1–3 kapsamını, persona bakışlarını ve olgunluk sınırlarını tek bir sentetik ürün haritasında inceleyin.', '<button class="button primary" data-start-scenario="operations">Operasyon senaryosunu başlat</button>')}
    <section class="hero-panel"><div><span class="section-kicker">21 ekran ailesi · 25 canonical route</span><h3>Bir okul gününü yönetirken bugünü ve ürünün geleceğini birlikte anlatın.</h3><p>GATE 2’de yalnız Operasyon P0 akışı yüksek sadakatlidir. Diğer modüller kapsamı dondurulmuş, kontrollü sonraki dilimler olarak görünür.</p><div class="hero-actions"><button class="button primary" data-start-scenario="operations">Sunum modunu aç</button>${routeLink('/full-vision/f1/operations', 'Serbest keşfet', 'button')}</div></div><div class="hero-proof" aria-label="Demo güvenlik sınırları"><strong>Statik güvenlik sınırı</strong><ul><li>Sentetik ve deterministik fixture</li><li>Bellek içi, sıfırlanabilir durum</li><li>Dış bağlantı ve gerçek mesaj yok</li><li>Olgunluk etiketi her ekranda görünür</li></ul></div></section>
    <section class="section-block"><div class="section-title"><div><span class="section-kicker">Ürün fazları</span><h3>Vizyon kapsamı</h3></div></div><div class="phase-card-grid">${graph.catalogue.phases.map((phase) => `<article class="phase-card ${phase.id}"><span class="phase-number">${esc(phase.label)}</span><h4>${esc(phase.title)}</h4><p>${esc(phase.maturity)}</p><div><strong>${phase.modules}</strong><span>ekran ailesi</span></div><a href="/full-vision/${phase.id}/${phase.id === 'f1' ? 'operations' : phase.id === 'f2' ? 'strategy' : 'command'}" data-route>Fazı incele <span aria-hidden="true">→</span></a></article>`).join('')}</div></section>
    <section class="split-grid"><article class="panel"><div class="panel-header"><div><span class="section-kicker">P0 satış akışı</span><h3>Operasyon günü</h3></div>${statusChip('Uygulanmış dikey dilim', 'success')}</div><div class="timeline-list">${['Günlük uyarıyı gör', 'İzin etkisini çöz', 'Program değişikliğini doğrula', 'Yoklamayı tamamla', 'Bilgilendirmeyi simüle et'].map((label, index) => `<div class="timeline-item"><span>${index + 1}</span><strong>${esc(label)}</strong></div>`).join('')}</div><div class="panel-footer"><button class="button primary" data-start-scenario="operations">Senaryoyu başlat</button></div></article>
    <article class="panel"><div class="panel-header"><div><span class="section-kicker">Persona görünümü</span><h3>Tek ekran, farklı odak</h3></div></div><div class="persona-list">${graph.catalogue.personas.map((persona) => `<button type="button" data-persona-select="${esc(persona.id)}"><span class="persona-avatar" aria-hidden="true">${esc(persona.label.slice(0, 1))}</span><span><strong>${esc(persona.label)}</strong><small>${esc(persona.value)}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div></article></section>`;
  }

  function operations(route, appState) {
    const metrics = stateModule.getMetrics(appState);
    const completed = appState.leave.status === 'approved_demo' && metrics.unassignedLessons === 0 && appState.schedule.previewStatus === 'accepted_demo' && appState.attendance.locked && metrics.simulatedNotifications > 0;
    const openCoverage = appState.leave.status === 'approved_demo' && metrics.unassignedLessons > 0;
    return `${pageHeading(route, 'Ders, izin, yoklama ve bilgilendirme istisnalarını tek günlük görünümde yönetin.', routeLink('/full-vision/f1/leaves/D-LV-204', 'İzin etkisini incele', 'button primary'))}
    <section class="metric-grid">${metric('Planlanan ders', '18', 'Sentetik günlük plan')}${metric('Açık ders etkisi', metrics.unassignedLessons, openCoverage ? 'Onaylandı; operasyon kuyruğunda açık' : metrics.unassignedLessons ? 'Yedek öğretmen bekliyor' : 'Demo görevlendirmesi hazır', metrics.unassignedLessons ? 'warning' : 'success')}${metric('Eksik yoklama', metrics.incompleteAttendance, metrics.incompleteAttendance ? 'Bir oturum açık' : 'Demo oturumu tamamlandı', metrics.incompleteAttendance ? 'warning' : 'success')}${metric('Bilgilendirme', metrics.simulatedNotifications, metrics.simulatedNotifications ? 'Simülasyon tamamlandı' : `${metrics.pendingNotifications} taslak insan onayı bekliyor`)}</section>
    ${completed ? `<section class="success-banner"><span aria-hidden="true">✓</span><div><strong>Operasyon senaryosu tamamlandı</strong><p>Tüm değişiklikler yalnız bellek içindeki demo durumunda gerçekleşti.</p></div><button class="button" data-reset-scenario>Senaryoyu başa al</button></section>` : ''}
    ${openCoverage ? `<section class="success-banner pending"><span aria-hidden="true">!</span><div><strong>İzin onaylandı; kapsanmayan ders açık kaldı</strong><p>Bu demo, onay kararını ders kapatma işinden ayırır. Yedek bulunmayan ders Daily Operations kuyruğunda görünmeye devam eder.</p></div>${routeLink('/full-vision/f1/leaves/D-LV-204', 'Açık etkiyi kapat', 'button') }</section>` : ''}
    <section class="content-grid"><article class="panel"><div class="panel-header"><div><span class="section-kicker">Bugünkü ders akışı</span><h3>${esc(graph.operations.daily.dateLabel)}</h3></div>${statusChip('Demo günü', 'neutral')}</div><div class="lesson-list">${graph.operations.daily.lessons.map((lesson) => { const assigned = appState.leave.assignments[lesson.id]; const teacher = teacherById(assigned || lesson.teacherId); return `<article class="lesson-row ${lesson.leaveAffected && !assigned ? 'attention' : ''}"><time>${esc(lesson.time.split('–')[0])}</time><div><strong>${esc(lesson.course)} · ${esc(groupById(lesson.groupId).label)}</strong><span>${esc(teacher.label)} · ${esc(roomById(lesson.roomId).label)}</span></div>${lesson.leaveAffected ? assigned ? statusChip('Yedek hazır', 'success') : statusChip('İzin etkisi', 'warning') : statusChip('Planlı', 'neutral')}</article>`; }).join('')}</div></article>
    <aside class="stack"><article class="panel"><div class="panel-header"><div><span class="section-kicker">Öncelik sırası</span><h3>Operasyon kuyruğu</h3></div></div><div class="attention-list">
      <a href="/full-vision/f1/leaves/D-LV-204" data-route class="attention-item ${metrics.unassignedLessons ? 'active' : 'done'}"><span aria-hidden="true">${metrics.unassignedLessons ? '1' : '✓'}</span><div><strong>İzin etkisi</strong><small>${openCoverage ? `Onaylı; ${metrics.unassignedLessons} ders açık` : metrics.unassignedLessons ? `${metrics.unassignedLessons} ders için yedek seçimi` : 'Demo kararı tamamlandı'}</small></div><b aria-hidden="true">→</b></a>
      <a href="/full-vision/f1/schedule?view=lifecycle" data-route class="attention-item ${appState.schedule.previewStatus === 'ready' ? 'active' : appState.schedule.previewStatus === 'accepted_demo' ? 'done' : ''}"><span aria-hidden="true">${appState.schedule.previewStatus === 'accepted_demo' ? '✓' : '2'}</span><div><strong>Program etkisi</strong><small>${appState.schedule.previewStatus === 'blocked' ? 'İzin kararı bekleniyor' : appState.schedule.previewStatus === 'ready' ? 'Önizleme doğrulanabilir' : 'Önizleme kabul edildi'}</small></div><b aria-hidden="true">→</b></a>
      <a href="/full-vision/f1/attendance/D-AT-1204" data-route class="attention-item ${appState.attendance.locked ? 'done' : ''}"><span aria-hidden="true">${appState.attendance.locked ? '✓' : '3'}</span><div><strong>Yoklama</strong><small>${appState.attendance.locked ? 'Demo oturumu tamamlandı' : 'Bir öğrenci durumu eksik'}</small></div><b aria-hidden="true">→</b></a>
      <a href="/full-vision/f1/notifications" data-route class="attention-item ${metrics.simulatedNotifications ? 'done' : ''}"><span aria-hidden="true">${metrics.simulatedNotifications ? '✓' : '4'}</span><div><strong>Veli bilgilendirme</strong><small>${metrics.simulatedNotifications ? 'Gönderim simülasyonu tamamlandı' : 'İnsan onayı gerekli'}</small></div><b aria-hidden="true">→</b></a>
    </div></article><article class="boundary-card"><span aria-hidden="true">◇</span><div><strong>Persona görünümü</strong><p>Filtre yalnız ilgili modülleri vurgular; gerçek yetki uygulamaz.</p></div></article></aside></section>`;
  }

  function leavesList(route, appState) {
    const leave = graph.operations.leaves[0];
    const requester = teacherById(leave.requesterId);
    const coverageStatus = appState.leave.coverageStatus;
    return `${pageHeading(route, 'Saatlik ve günlük izin taleplerini ders etkileriyle birlikte görün.', routeLink(`/full-vision/f1/leaves/${leave.id}`, 'Talebi aç', 'button primary'))}
    <article class="panel"><div class="table-header-row"><span>Talep</span><span>Öğretmen</span><span>Süre</span><span>Etkilenen ders</span><span>Durum</span><span></span></div><a class="table-data-row" href="/full-vision/f1/leaves/${leave.id}" data-route><strong>${esc(leave.id)}</strong><span>${esc(requester.label)}</span><span>${esc(leave.durationLabel)} · ${esc(leave.interval)}</span><span>${leave.affectedLessonIds.length}</span><span>${appState.leave.status === 'approved_demo' ? statusChip('Demo kararı tamamlandı', 'success') : statusChip('Karar bekliyor', 'warning')} ${statusChip(coverageLabel(coverageStatus), coverageTone(coverageStatus))}</span><b aria-hidden="true">→</b></a></article>`;
  }

  function leaveDetail(route, appState, pathname) {
    const id = pathname.split('/').pop();
    const leave = leaveById(id);
    if (!leave) return `${pageHeading(route, 'İzin kararlarını yalnız tanımlı sentetik kayıtlar üzerinden inceleyin.', '')}${emptyState('!', 'Demo izin kaydı bulunamadı', `${id} kodu sentetik fixture içinde bulunmuyor.`, routeLink('/full-vision/f1/leaves', 'İzin Merkezine dön', 'button primary'))}`;
    const requester = teacherById(leave.requesterId);
    const assignedCount = Object.keys(appState.leave.assignments).length;
    const coverageStatus = appState.leave.coverageStatus;
    const approved = appState.leave.status === 'approved_demo';
    return `${pageHeading(route, 'İzin kararından önce ders etkisini ve uygun yedek adaylarını birlikte inceleyin.', '<button class="button" data-screen-reset="leave">Ekranı sıfırla</button>')}
    <section class="detail-hero"><div><span class="section-kicker">Talep ${esc(leave.id)}</span><h3>${esc(requester.label)} · ${esc(leave.durationLabel)}</h3><p>${esc(leave.reasonLabel)} · ${esc(leave.interval)} · Yönetici onayı gerekir</p></div><div class="hero-status-stack">${approved ? statusChip('Demo kararı tamamlandı', 'success') : statusChip('Karar bekliyor', 'warning')}${statusChip(coverageLabel(coverageStatus), coverageTone(coverageStatus))}</div></section>
    <section class="evidence-grid" aria-label="İzin karar kanıtları">
      ${labelledValue('Talep eden rol', 'Öğretmen')}
      ${labelledValue('Karar rolü', 'Yönetici')}
      ${labelledValue('Süre türü', leave.durationLabel)}
      ${labelledValue('Kapsama kuralı', 'Onay açık dersle mümkün')}
    </section>
    <section class="content-grid wide"><article class="panel"><div class="panel-header"><div><span class="section-kicker">Ders etkisi</span><h3>${leave.affectedLessonIds.length} ders için yedek karar kanıtı</h3></div><span class="progress-label">${assignedCount}/${leave.affectedLessonIds.length}</span></div><div class="assignment-list">${leave.affectedLessonIds.map((lessonId) => { const lesson = lessonById(lessonId); const candidates = leave.candidatesByLesson[lessonId].map(teacherById); const selected = appState.leave.assignments[lessonId] || ''; return `<article class="assignment-row"><div class="assignment-time"><strong>${esc(lesson.time)}</strong><span>${esc(roomById(lesson.roomId).label)}</span></div><div><strong>${esc(lesson.course)} · ${esc(groupById(lesson.groupId).label)}</strong><span>Asıl: ${esc(requester.label)} · ${esc(groupById(lesson.groupId).label)}</span><div class="candidate-evidence">${evidenceByLesson(leave, lessonId).map((item) => { const candidate = teacherById(item.teacherId); return `<span class="${item.status === 'available' ? 'ok' : 'blocked'}">${esc(candidate.label)}: ${esc(item.evidence)}</span>`; }).join('')}</div></div><label><span>Yedek öğretmen</span><select data-substitute data-lesson-id="${esc(lessonId)}" ${approved ? 'disabled' : ''}><option value="">Açık kalsın</option>${candidates.map((candidate) => `<option value="${esc(candidate.id)}" ${selected === candidate.id ? 'selected' : ''} ${candidate.available ? '' : 'disabled'}>${esc(candidate.label)} · ${candidate.available ? 'Uygun' : 'Bu saatte uygun değil'}</option>`).join('')}</select></label></article>`; }).join('')}</div></article>
    <aside class="stack"><article class="decision-card"><span class="decision-icon" aria-hidden="true">✓</span><h3>Yönetici kararı</h3><p>Uygunluk bilgisi kararı destekler; otomatik izin onayı veya otomatik yedek ataması oluşturmaz.</p>${approved ? `<div class="inline-success"><strong>Demo durumu güncellendi</strong><span>${coverageStatus === 'covered' ? 'Tüm dersler demo kapsamasında.' : 'Kapsanmayan dersler Daily Operations kuyruğunda açık kalır.'}</span></div>${routeLink('/full-vision/f1/schedule?view=lifecycle', 'Program etkisini doğrula', 'button primary full')}` : `<button class="button primary full" data-approve-leave>Onayı simüle et</button><small class="validation-copy">${assignedCount === leave.affectedLessonIds.length ? 'Tüm dersler için uygun yedek seçildi.' : 'Yedek seçilmeyen dersler onaydan sonra açık operasyon işi olarak kalır.'}</small>`}</article>
    <article class="boundary-card"><span aria-hidden="true">◇</span><div><strong>Bu ekrandaki sınır</strong><p>Seçimler yalnız tarayıcı belleğindeki demo durumunu değiştirir; gerçek izin, görevlendirme veya program yayını oluşmaz.</p></div></article></aside></section>`;
  }

  function scheduleGenerate(route, tabs) {
    const studio = graph.operations.schedule.studio;
    return `${pageHeading(route, 'Sabit seed ile hazırlanmış çizelgeleme sonucunu ve karar destek aşamalarını inceleyin.', '<button class="button" data-screen-reset="schedule">Ekranı sıfırla</button>')}${tabs}
    <section class="metric-grid compact">${metric('Yerleşim', studio.fitRateLabel, 'Hazır demo sonucu')}${metric('İlerleme', `${studio.progressPercent}%`, 'Canlı işlem değildir')}${metric('Derinlik', studio.maxDepth, 'Kontrollü demo parametresi')}${metric('Yayın işlemi', 'Yok', 'Önizleme dışına çıkmaz', 'success')}</section>
    <section class="content-grid"><article class="panel"><div class="panel-header"><div><span class="section-kicker">Çizelgeleme aşamaları</span><h3>${esc(studio.modeLabel)}</h3></div>${statusChip('Hazır sonuç', 'neutral')}</div><div class="solver-stage-list">${studio.stages.map((stage, index) => `<article class="stage-row ${esc(stage.status)}"><span>${index + 1}</span><div><strong>${esc(stage.label)}</strong><small>${esc(stage.rule)}</small></div><b>${stage.placedLessons}/${studio.requestedLessons}</b></article>`).join('')}</div></article>
    <aside class="stack"><article class="decision-card"><span class="decision-icon" aria-hidden="true">${studio.placedLessons}</span><h3>${esc(studio.fitRateLabel)} ders yerleşimi</h3><p>Bu sonuç önceden hazırlanmış sentetik fixture’dan gelir; kilitlenme, garanti veya otomatik kayıt iddiası taşımaz.</p>${routeLink('/full-vision/f1/schedule?view=diagnostics', 'Teşhisi incele', 'button primary full')}${routeLink('/full-vision/f1/schedule?view=lifecycle', 'İzin etkisine dön', 'button full')}</article><article class="boundary-card"><span aria-hidden="true">◇</span><div><strong>Demo parametresi</strong><p>Seed ve derinlik değerleri yalnız sunumda aynı sonucu tekrar göstermek için sabittir.</p></div></article></aside></section>`;
  }

  function scheduleDiagnostics(route, tabs) {
    const studio = graph.operations.schedule.studio;
    const diagnosticCard = (title, items) => `<article class="panel"><div class="panel-header"><div><span class="section-kicker">Teşhis</span><h3>${esc(title)}</h3></div></div><div class="diagnostic-list">${items.map((item) => `<article class="diagnostic-row"><div><strong>${esc(item.label)}</strong><span>${esc(item.evidence)}</span></div>${statusChip(item.impact, 'warning')}</article>`).join('')}</div></article>`;
    return `${pageHeading(route, 'Yerleşemeyen veya zorlanan dersleri sınıf, öğretmen ve denge açısından açıklayın.', '<button class="button" data-screen-reset="schedule">Ekranı sıfırla</button>')}${tabs}
    <section class="metric-grid compact">${metric('Sınıf kısıtı', studio.diagnostics.classConstraints.length, 'Kapasite ve blok sinyali')}${metric('Öğretmen kısıtı', studio.diagnostics.teacherConstraints.length, 'Uygunluk ve yük sinyali')}${metric('Denge skoru', '82', 'Ortalama sentetik gösterge')}${metric('Canlı işlem', 0, 'Yalnız hazır analiz', 'success')}</section>
    <section class="split-grid">${diagnosticCard('Sınıf kısıtları', studio.diagnostics.classConstraints)}${diagnosticCard('Öğretmen kısıtları', studio.diagnostics.teacherConstraints)}</section>
    <section class="panel section-block"><div class="panel-header"><div><span class="section-kicker">Pedagojik denge</span><h3>Ders dağılım analizi</h3></div>${statusChip('Karar desteği', 'neutral')}</div><div class="balance-list">${studio.diagnostics.balance.map((item) => `<article class="balance-row"><div><strong>${esc(item.label)}</strong><span>${esc(item.evidence)}</span></div><div class="score-meter" aria-label="${esc(`${item.label} denge skoru ${item.score}`)}"><span class="score-${esc(item.score)}"></span></div><b>${item.score}</b></article>`).join('')}</div></section>`;
  }

  function schedule(route, appState, search) {
    const view = new URLSearchParams(search || '').get('view') || 'week';
    const tabs = `<nav class="view-tabs" aria-label="Program Stüdyosu görünümleri">${[
      ['week', 'Haftalık program'], ['lifecycle', 'Program yaşam döngüsü'], ['generate', 'Üretim simülasyonu'], ['diagnostics', 'Teşhis'],
    ].map(([id, label]) => routeLink(`/full-vision/f1/schedule?view=${id}`, label, `view-tab ${view === id ? 'active' : ''}`)).join('')}</nav>`;
    if (view === 'generate') return scheduleGenerate(route, tabs);
    if (view === 'diagnostics') return scheduleDiagnostics(route, tabs);
    const ready = appState.schedule.previewStatus === 'ready';
    const accepted = appState.schedule.previewStatus === 'accepted_demo';
    const changes = graph.operations.leaves[0].affectedLessonIds.map((id) => lessonById(id));
    const openLessonCount = appState.schedule.openLessonIds.length;
    return `${pageHeading(route, view === 'lifecycle' ? 'İzin sonrası program değişikliğini doğrulama ve kabul adımını inceleyin.' : 'Hazır haftalık program görünümünde ders sürekliliğini ve çakışma özetini inceleyin.', '<button class="button" data-screen-reset="schedule">Ekranı sıfırla</button>')}${tabs}
    <section class="metric-grid compact">${metric('Hazır değişiklik', ready || accepted ? 3 - openLessonCount : 0, ready || accepted ? 'Yedek öğretmen önizlemesi' : 'İzin kararı bekleniyor')}${metric('Açık ders', ready || accepted ? openLessonCount : 3, openLessonCount ? 'Operasyon kuyruğunda kalır' : 'Kapsama hazır', openLessonCount ? 'warning' : 'success')}${metric('Yayın işlemi', 'Yok', 'Bu ekran programı yayımlamaz')}${metric('Durum', accepted ? 'Kabul edildi' : ready ? 'Doğrulanabilir' : 'Bloke', 'Yalnız demo önizlemesi', accepted ? 'success' : ready ? '' : 'warning')}</section>
    <section class="content-grid"><article class="panel"><div class="panel-header"><div><span class="section-kicker">Haftalık önizleme</span><h3>Salı program etkisi</h3></div>${statusChip('Hazır senaryo', 'neutral')}</div><div class="schedule-preview"><div class="schedule-header"><span>Saat</span><span>Salı</span><span>Etki</span></div>${changes.map((lesson) => { const substituteId = appState.leave.assignments[lesson.id]; return `<div class="schedule-line"><time>${esc(lesson.time)}</time><div><strong>${esc(lesson.course)}</strong><span>${esc(groupById(lesson.groupId).label)} · ${esc(roomById(lesson.roomId).label)}</span></div>${substituteId ? `<div class="change-card"><span>Yedek</span><strong>${esc(teacherById(substituteId).label)}</strong></div>` : `<div class="blocked-card"><span>Bekliyor</span><strong>Yedek seçimi yok</strong></div>`}</div>`; }).join('')}</div></article>
    <aside class="stack"><article class="decision-card"><span class="decision-icon" aria-hidden="true">${accepted ? '✓' : ready ? openLessonCount : '!'}</span><h3>${accepted ? 'Önizleme kabul edildi' : ready ? `${openLessonCount} açık ders` : 'Önizleme hazır değil'}</h3><p>${accepted ? 'Demo durumu güncellendi; program yayımlanmadı.' : ready ? (openLessonCount ? 'Atanmayan dersler açık operasyon işi olarak korunur.' : 'Üç ders için görevlendirme görünümü hazır.') : 'Önce izin etkisi ekranında yönetici kararını simüle edin.'}</p>${accepted ? routeLink('/full-vision/f1/attendance/D-AT-1204', 'Yoklamaya geç', 'button primary full') : ready ? '<button class="button primary full" data-accept-schedule>Değişiklik önizlemesini kabul et</button>' : routeLink('/full-vision/f1/leaves/D-LV-204', 'İzin etkisine dön', 'button full')}${routeLink('/full-vision/f1/schedule?view=generate', 'Çizelgeleme simülasyonu', 'button full')}</article><article class="boundary-card"><span aria-hidden="true">◇</span><div><strong>Hazır program senaryosu</strong><p>Canlı hesaplama, sonuç garantisi veya kalıcı yayınlama yapılmaz.</p></div></article></aside></section>`;
  }

  function attendanceList(route, appState) {
    const session = graph.operations.attendance[0];
    return `${pageHeading(route, 'Programdaki oturumların yoklama durumunu takip edin.', routeLink(`/full-vision/f1/attendance/${session.id}`, 'Oturumu aç', 'button primary'))}<article class="panel"><a class="session-row" href="/full-vision/f1/attendance/${session.id}" data-route><div><span class="section-kicker">${esc(session.id)}</span><strong>${esc(lessonById(session.lessonId).course)} · ${esc(groupById(lessonById(session.lessonId).groupId).label)}</strong></div>${appState.attendance.locked ? statusChip('Demo oturumu tamamlandı', 'success') : statusChip('Bir durum eksik', 'warning')}<b aria-hidden="true">→</b></a></article>`;
  }

  function attendanceDetail(route, appState, pathname) {
    const id = pathname.split('/').pop();
    const session = attendanceById(id);
    if (!session) return `${pageHeading(route, 'Yoklamayı yalnız tanımlı sentetik oturumlarda deneyimleyin.', '')}${emptyState('!', 'Demo yoklama oturumu bulunamadı', `${id} kodu sentetik fixture içinde bulunmuyor.`, routeLink('/full-vision/f1/attendance', 'Yoklama Merkezine dön', 'button primary'))}`;
    const lesson = lessonById(session.lessonId);
    const missing = Object.values(appState.attendance.statuses).filter((value) => !value).length;
    const locked = appState.attendance.locked;
    const labels = { present: 'Var', absent: 'Yok', late: 'Geç', excused: 'Mazeretli' };
    return `${pageHeading(route, 'Kodlu sentetik öğrenciler üzerinde hızlı yoklama girişi ve tamamlama engelini deneyimleyin.', '<button class="button" data-screen-reset="attendance">Ekranı sıfırla</button>')}
    <section class="detail-hero"><div><span class="section-kicker">Oturum ${esc(session.id)}</span><h3>${esc(lesson.course)} · ${esc(groupById(lesson.groupId).label)}</h3><p>${esc(lesson.time)} · ${esc(roomById(lesson.roomId).label)}</p></div>${locked ? statusChip('Demo oturumu tamamlandı', 'success') : statusChip(`${missing} eksik durum`, missing ? 'warning' : 'success')}</section>
    <section class="content-grid wide"><article class="panel"><div class="attendance-head"><span>Öğrenci kodu</span><span>Yoklama durumu</span></div><div class="attendance-list">${session.students.map((student) => { const selected = appState.attendance.statuses[student.id]; return `<fieldset class="attendance-row" ${locked ? 'disabled' : ''}><legend><span class="student-code" aria-hidden="true">${esc(student.id.split('-').pop())}</span><strong>${esc(student.code)}</strong></legend><div class="status-options">${Object.entries(labels).map(([value, label]) => `<label class="status-option ${selected === value ? 'selected' : ''}"><input type="radio" name="attendance-${esc(student.id)}" value="${esc(value)}" data-attendance data-student-id="${esc(student.id)}" ${selected === value ? 'checked' : ''} ${locked ? 'disabled' : ''}><span>${esc(label)}</span></label>`).join('')}</div></fieldset>`; }).join('')}</div></article>
    <aside class="stack"><article class="decision-card"><span class="decision-icon" aria-hidden="true">${locked ? '✓' : session.students.length - missing}</span><h3>${locked ? 'Demo oturumu tamamlandı' : `${session.students.length - missing}/${session.students.length} durum hazır`}</h3><p>${locked ? 'Yoklama durumu yalnız demo içinde kilitlendi.' : missing ? 'Kilitleme simülasyonu için tüm öğrenci durumlarını seçin.' : 'Tüm durumlar hazır; insan onayıyla tamamlayın.'}</p>${locked ? routeLink('/full-vision/f1/notifications', 'Bilgilendirme kuyruğuna geç', 'button primary full') : `<button class="button primary full" data-lock-attendance ${missing ? 'disabled' : ''}>Kilitlemeyi simüle et</button>`}</article><article class="boundary-card"><span aria-hidden="true">◇</span><div><strong>Sentetik öğrenci kodları</strong><p>Bu ekranda gerçek öğrenci, iletişim veya kurum kaydı bulunmaz.</p></div></article></aside></section>`;
  }

  function notifications(route, appState) {
    const pending = Object.values(appState.notifications).filter((value) => value === 'pending').length;
    const simulated = Object.values(appState.notifications).filter((value) => value === 'simulated').length;
    return `${pageHeading(route, 'İnsan onayı ve kanal uygunluğu bulunan veli bilgilendirme simülasyonunu inceleyin.', '<button class="button" data-screen-reset="notifications">Ekranı sıfırla</button>')}
    <section class="metric-grid compact">${metric('Onay bekleyen', pending, 'Uygun demo taslağı')}${metric('Uygunluk engeli', 1, 'Kanal kullanılamaz', 'warning')}${metric('Tamamlanan', simulated, 'Gönderim simülasyonu')}${metric('Gerçek mesaj', 0, 'Dış bağlantı yok', 'success')}</section>
    <section class="stack">${graph.operations.notifications.map((notification) => { const current = appState.notifications[notification.id]; const eligible = notification.eligibility === 'eligible'; const student = graph.operations.attendance[0].students.find((item) => item.id === notification.studentId); return `<article class="notification-card ${eligible ? '' : 'blocked'}"><div class="notification-main"><div class="notification-title"><span class="student-code" aria-hidden="true">${esc(student.id.split('-').pop())}</span><div><span class="section-kicker">${esc(notification.id)}</span><h3>${esc(student.code)} · ${esc(notification.template)}</h3></div></div><p>“Demo dersine katılım durumu için bilgilendirme örneği hazırlanmıştır.”</p><div class="meta-row">${statusChip(notification.channelLabel, 'neutral')}${eligible ? statusChip('Kanal uygun', 'success') : statusChip('Uygunluk engeli', 'warning')}</div></div><div class="notification-action">${current === 'simulated' ? `<div class="inline-success compact"><strong>Simülasyon tamamlandı</strong><span>Gerçek mesaj gönderilmedi.</span></div>` : eligible ? `<button class="button primary" data-simulate-notification="${esc(notification.id)}">Gönderimi simüle et</button>` : '<button class="button" disabled>İşlem kullanılamaz</button>'}</div></article>`; }).join('')}</section>
    ${simulated ? `<section class="success-banner final"><span aria-hidden="true">✓</span><div><strong>P0 operasyon akışı tamamlandı</strong><p>İzin, program, yoklama ve bilgilendirme adımları gerçek işlem oluşturmadan gösterildi.</p></div>${routeLink('/full-vision/f1/operations?status=complete', 'Tamamlanmış günü gör', 'button') }<button class="button primary" data-reset-scenario>Senaryoyu başa al</button></section>` : ''}`;
  }

  function placeholder(route) {
    const visionBoundary = route.phase === 'f3' ? '<section class="vision-boundary" role="note"><strong>Canlı AI sonucu değildir.</strong><span>Bu ekran yalnız önceden hazırlanmış kavramsal bir simülasyon sınırını gösterir.</span></section>' : '';
    return `${pageHeading(route, 'Bu ekranın kapsamı ve olgunluk sınırı donduruldu; etkileşimli derinlik sonraki GATE diliminde uygulanacaktır.', '')}${visionBoundary}${emptyState('◇', 'Kapsamı dondurulmuş sonraki dilim', `${route.title} route’u ve ürün olgunluğu tanımlıdır. GATE 2 yalnız Operasyon P0 akışını uygular.`, routeLink('/full-vision/overview', 'Ürün haritasına dön', 'button primary'))}`;
  }

  function render(route, appState, pathname, search) {
    const renderers = {
      overview: () => overview(route),
      'f1-operations': () => operations(route, appState),
      'f1-leaves': () => route.id === 'f1-leave-detail' ? leaveDetail(route, appState, pathname) : leavesList(route, appState),
      'f1-schedule': () => schedule(route, appState, search),
      'f1-attendance': () => route.id === 'f1-attendance-detail' ? attendanceDetail(route, appState, pathname) : attendanceList(route, appState),
      'f1-notifications': () => notifications(route, appState),
    };
    return (renderers[route.screenFamily] || (() => placeholder(route)))();
  }

  return { render, graph };
});
