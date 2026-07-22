(() => {
  'use strict';

  const { validateSchedule } = window.DemoConflictEngine;
  const { SEED, canMutateSchedule, createInitialState } = window.DemoState;
  const start = () => createInitialState(validateSchedule);
  let state = start();
  let toastTimer;

  const lessons = [
    ['09:30', 'TYT Matematik', '12-SAY-1', 'Demo Öğretmen A', 'Derslik 2'],
    ['11:10', 'AYT Fizik', 'MEZ-SAY-2', 'Demo Öğretmen B', 'Derslik 4'],
    ['13:30', 'Türk Dili ve Edebiyatı', '12-EA-1', 'Demo Öğretmen C', 'Derslik 1'],
    ['15:10', 'TYT Geometri', 'MEZ-SAY-1', 'Demo Öğretmen A', 'Derslik 3'],
  ];
  const leaveRows = [
    ['E1', '09:30', 'TYT Matematik', '12-SAY-1', 'Derslik 2'],
    ['E2', '13:30', 'TYT Geometri', 'MEZ-SAY-1', 'Derslik 3'],
    ['E3', '15:10', 'AYT Matematik', '12-SAY-2', 'Derslik 5'],
  ];
  const students = [['D01', 'Demo Öğrenci 01'], ['D02', 'Demo Öğrenci 02'], ['D03', 'Demo Öğrenci 03'], ['D04', 'Demo Öğrenci 04'], ['D05', 'Demo Öğrenci 05'], ['D06', 'Demo Öğrenci 06']];
  const notifications = [
    ['N1', 'Demo Öğrenci 03', 'Veli •••• 1203', 'Bugünkü ilk derse katılmadı.'],
    ['N2', 'Demo Öğrenci 05', 'Veli •••• 4518', 'Derse 18 dakika geç katıldı.'],
    ['N3', 'Demo Öğrenci 11', 'Veli •••• 8034', 'Yoklama sonrası bilgilendirme gönderildi.'],
  ];
  const dayOptions = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
  const timeOptions = [
    ['09:30', '10:50'],
    ['11:10', '12:30'],
    ['13:30', '14:50'],
    ['15:10', '16:30'],
  ];
  const teacherOptions = ['Demo Öğretmen A', 'Demo Öğretmen B', 'Demo Öğretmen C', 'Demo Öğretmen D', 'Demo Öğretmen E', 'Demo Öğretmen F', 'Demo Öğretmen G', 'Demo Öğretmen H'];
  const groupOptions = ['12-SAY-1', '12-SAY-2', 'MEZ-SAY-1', 'MEZ-SAY-2', '11-EA-1', '12-EA-1', '12-EA-2', 'MEZ-EA-1'];
  const roomOptions = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'Lab 1', 'Lab 2'];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const badge = () => '<span class="demo-badge">Demo Verisi</span>';
  const metric = (label, value, note) => `<article class="metric-card"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}<span class="metric-trend">demo</span></div><div class="metric-note">${esc(note)}</div></article>`;
  const heading = (kicker, title, description, actions = '') => `<div class="screen-heading"><div><div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">${badge()}<span class="tag">${esc(kicker)}</span></div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="heading-actions">${actions}</div></div>`;
  const optionList = (items, selected) => items.map((item) => `<option value="${esc(item)}" ${item === selected ? 'selected' : ''}>${esc(item)}</option>`).join('');

  function runValidation() {
    state.validation = validateSchedule(state.events);
    state.validationRun += 1;
    return state.validation;
  }

  function validationToast(result) {
    return result.hardConflictCount === 0
      ? 'Full validation tamamlandı: hard conflict 0.'
      : `Validation tamamlandı: ${result.hardConflictCount} hard conflict devam ediyor.`;
  }

  function today() {
    const pending = Object.values(state.notifications).filter((value) => value === 'pending').length;
    const conflictCount = state.validation.hardConflictCount;
    return `${heading('21 Temmuz 2026 · Salı', 'Bugünün operasyon görünümü', 'Dersler, izin etkileri, yoklama ve bildirim akışının sentetik sunum özeti.', '<a class="button primary" href="/demo/schedule" data-route>Programı aç</a>')}
    <section class="metric-grid">${metric('Planlanan ders', '18', `Hard conflict: ${conflictCount}`)}${metric('Aktif öğretmen', '12', '1 izin kaydı')}${metric('Yoklama', '6/8', '2 oturum bekliyor')}${metric('Bildirim taslağı', pending, 'İnsan onayı gerekli')}</section>
    <section class="layout-grid"><article class="panel"><div class="panel-header"><h3>Bugünkü ders akışı</h3><span class="status-chip success">Canlı demo akışı</span></div><div class="panel-body">${lessons.map((lesson) => `<div class="lesson-row"><div class="time-box">${lesson[0]}</div><div class="lesson-main"><strong>${lesson[1]} · ${lesson[2]}</strong><small>${lesson[3]}</small></div><span class="room-chip">${lesson[4]}</span></div>`).join('')}</div></article>
    <aside class="stack"><article class="panel"><div class="panel-header"><h3>Operasyon uyarıları</h3><span class="tag">3 kayıt</span></div><div class="panel-body stack"><div class="alert-card ${conflictCount ? 'danger' : 'success'}"><strong>${conflictCount ? 'Program çakışması' : 'Program doğrulandı'}</strong><p>${conflictCount ? `${conflictCount} hard conflict çözüm bekliyor.` : 'Sentetik programda açık hard conflict bulunmuyor.'}</p></div><div class="alert-card"><strong>İzin etkisi</strong><p>Demo Öğretmen A için üç ders yeniden görevlendirme bekliyor.</p></div><div class="alert-card success"><strong>Veli bildirimleri</strong><p>Onay ve gönderim simülasyonu hazır.</p></div></div></article>
    <article class="panel"><div class="panel-header"><h3>Hızlı geçişler</h3></div><div class="panel-body quick-grid"><a class="quick-link" href="/demo/leave/LV-204" data-route>İzin etkisini çöz</a><a class="quick-link" href="/demo/attendance/session/AT-1204" data-route>Yoklama al</a><a class="quick-link" href="/demo/notifications" data-route>Bildirimleri incele</a><a class="quick-link" href="/demo/schedule" data-route>Haftalık grid</a></div></article></aside></section>`;
  }

  function conflictCard(conflict, draft) {
    const eventNames = conflict.eventIds.map((eventId) => state.events.find((event) => event.id === eventId)?.course || eventId).join(' ↔ ');
    const editTarget = conflict.eventIds[1];
    return `<article class="alert-card danger" style="display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap"><div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:7px"><span class="status-chip danger">${esc(conflict.reasonCode)}</span><span class="tag">${esc(conflict.day)} ${esc(conflict.start)}–${esc(conflict.end)}</span></div><strong>${esc(conflict.resourceLabel)}: ${esc(conflict.resourceValue)}</strong><p>${esc(eventNames)}</p></div>${draft ? `<button class="button small" data-action="edit-conflict" data-event-id="${esc(editTarget)}">Çakışmayı düzenle</button>` : '<span class="status-chip neutral">Salt okunur</span>'}</article>`;
  }

  function schedule() {
    const draft = canMutateSchedule(state.mode);
    const validation = state.validation;
    const conflictEventIds = new Set(validation.conflictedEventIds);
    const actions = `<button class="button" data-action="validate" ${draft ? '' : 'disabled'}>Çakışmaları doğrula</button><button class="button primary" data-action="new-event" ${draft ? '' : 'disabled'}>Yeni ders ekle</button>`;
    const grid = timeOptions.map(([start]) => `<div class="schedule-time">${start}</div>${dayOptions.map((day) => `<div class="schedule-cell">${state.events.filter((event) => event.day === day && event.start === start).map((event) => `<button class="schedule-event ${conflictEventIds.has(event.id) ? 'conflict' : ''}" data-action="event" data-event-id="${esc(event.id)}"><strong>${esc(event.course)}</strong><span>${esc(event.studentGroup)} · ${esc(event.teacher)}</span><span>${esc(event.room)} · ${esc(event.start)}–${esc(event.end)}</span></button>`).join('')}</div>`).join('')}`).join('');
    const validationCard = validation.hardConflictCount
      ? `<div class="alert-card danger" style="margin-bottom:14px"><strong>SCHEDULE_HARD_CONFLICTS_PRESENT</strong><p>${validation.hardConflictCount} hard conflict devam ediyor. Event verisi değişmeden başarılı validation gösterilmez.</p></div>`
      : '<div class="alert-card success" style="margin-bottom:14px"><strong>Full validation tamamlandı</strong><p>Hard conflict sayısı 0. Gerçek publish çağrısı yapılmaz.</p></div>';
    const conflictPanel = validation.hardConflictCount
      ? `<article class="panel" style="margin-bottom:14px"><div class="panel-header"><div><h3>Hard conflict sonuçları</h3><div class="metric-note">Öğretmen: ${validation.summaryByType.teacher} · Öğrenci grubu: ${validation.summaryByType.studentGroup} · Derslik: ${validation.summaryByType.room}</div></div><span class="status-chip danger">${validation.hardConflictCount} conflict</span></div><div class="panel-body stack">${validation.conflicts.map((conflict) => conflictCard(conflict, draft)).join('')}</div></article>`
      : '';

    return `${heading('2026–2027 · 1. Hafta', draft ? 'Taslak haftalık program' : 'Yayınlanmış program', draft ? 'Yönetim görünümü; her düzenleme sonrasında validation mevcut event state’i üzerinden yeniden hesaplanır.' : 'Salt okunur yayın görünümü; mutation ve validation aksiyonları kapalıdır.', actions)}
    <div class="schedule-toolbar"><div class="tabs"><button class="tab ${draft ? 'active' : ''}" data-action="mode" data-mode="draft">Taslak</button><button class="tab ${draft ? '' : 'active'}" data-action="mode" data-mode="published">Yayınlanmış</button></div><div class="legend"><span>Planlı ders</span><span class="conflict">Hard conflict</span></div></div>
    ${validationCard}${conflictPanel}
    <div class="schedule-wrap"><div class="schedule-grid"><div class="schedule-head">Saat</div>${dayOptions.map((day) => `<div class="schedule-head">${day}</div>`).join('')}${grid}</div></div>`;
  }

  function leave(id) {
    const unresolved = leaveRows.filter((row) => !state.substitutes[row[0]]).length;
    return `${heading(`İzin kaydı ${id}`, 'Demo Öğretmen A · Tam gün izin', 'Bugünkü programa etkisi ve sentetik yedek öğretmen seçenekleri.', '<button class="button primary" data-action="save-substitutes">Görevlendirmeleri kaydet</button>')}
    <section class="metric-grid">${metric('Etkilenen ders', '3', 'Aynı gün içinde')}${metric('Atanan yedek', 3 - unresolved, 'Yerel demo state’i')}${metric('Açık risk', unresolved, 'Görevlendirme bekliyor')}${metric('İzin durumu', 'Onaylı', '21 Temmuz 2026')}</section>
    <section class="layout-grid"><article class="panel"><div class="panel-header"><h3>Etkilenen dersler</h3><span class="status-chip ${unresolved ? 'warning' : 'success'}">${unresolved ? `${unresolved} açık aksiyon` : 'Tüm dersler atandı'}</span></div><div class="panel-body">${leaveRows.map((row) => `<div class="impact-row"><strong>${row[1]}</strong><div class="lesson-main"><strong>${row[2]} · ${row[3]}</strong><small>${row[4]}</small></div><select class="select" data-substitute="${row[0]}"><option value="">Yedek öğretmen seç</option>${['Demo Öğretmen B', 'Demo Öğretmen C', 'Demo Öğretmen D'].map((teacher) => `<option ${state.substitutes[row[0]] === teacher ? 'selected' : ''}>${teacher}</option>`).join('')}</select></div>`).join('')}</div></article>
    <aside class="stack"><article class="panel"><div class="panel-header"><h3>İzin özeti</h3>${badge()}</div><div class="panel-body"><dl class="detail-list"><dt>Tür</dt><dd>Tam gün</dd><dt>Neden</dt><dd>Kişisel izin · sentetik</dd><dt>Onaylayan</dt><dd>Demo Yönetici</dd><dt>Branch</dt><dd>Neşet Ertaş KE</dd></dl></div></article><div class="alert-card"><strong>Gerçek işlem yapılmaz</strong><p>Kaydet yalnız tarayıcı belleğindeki demo state’ini günceller.</p></div></aside></section>`;
  }

  function attendance(id) {
    const count = { present: 0, absent: 0, late: 0 };
    Object.values(state.attendance).forEach((value) => { count[value] += 1; });
    return `${heading(`Oturum ${id}`, 'TYT Matematik · 12-SAY-1', 'Sentetik kayıtlarla yoklama durumlarını değiştirin.', '<button class="button success" data-action="complete-attendance">Yoklamayı tamamla</button>')}
    <section class="metric-grid">${metric('Mevcut', count.present, 'Derse katılan')}${metric('Devamsız', count.absent, 'Bildirim adayı')}${metric('Geç', count.late, 'Gecikme kaydı')}${metric('Tamamlanma', '100%', '6 sentetik kayıt')}</section>
    <article class="panel"><div class="panel-header"><div><h3>Yoklama listesi</h3><div class="metric-note">Bireysel kayıtlar tamamen sentetiktir.</div></div>${badge()}</div><div class="panel-body"><div class="progress"><span style="width:100%"></span></div><div style="overflow-x:auto;margin-top:12px"><table class="attendance-table"><thead><tr><th>Kod</th><th>Öğrenci</th><th>Durum</th></tr></thead><tbody>${students.map((student) => `<tr><td><span class="student-code">${student[0].slice(1)}</span></td><td><strong>${student[1]}</strong><div class="metric-note">Kişisel veri değildir</div></td><td><div class="segmented">${[['present', 'Var'], ['absent', 'Yok'], ['late', 'Geç']].map((status) => `<button data-action="attendance" data-student="${student[0]}" data-status="${status[0]}" class="${state.attendance[student[0]] === status[0] ? 'active' : ''}">${status[1]}</button>`).join('')}</div></td></tr>`).join('')}</tbody></table></div></div></article>`;
  }

  function notificationCard(notification) {
    const status = state.notifications[notification[0]];
    const label = status === 'pending' ? 'Onay bekliyor' : status === 'approved' ? 'Onaylandı' : 'Gönderildi';
    const className = status === 'pending' ? 'warning' : status === 'approved' ? 'success' : 'neutral';
    return `<article class="notification-card"><div><h3>${notification[1]} · ${notification[3]}</h3><p>${notification[2]} · Sentetik SMS taslağı.</p><div class="notification-meta"><span class="status-chip ${className}">${label}</span><span class="tag">${notification[0]}</span>${badge()}</div></div><div class="notification-actions">${status === 'pending' ? `<button class="button small" data-action="approve" data-id="${notification[0]}">Onayla</button>` : ''}${status === 'approved' ? `<button class="button small primary" data-action="send" data-id="${notification[0]}">Gönderimi simüle et</button>` : ''}${status === 'sent' ? '<span class="status-chip success">Teslim edildi</span>' : ''}</div></article>`;
  }

  function notificationsView() {
    const values = Object.values(state.notifications);
    const pending = values.filter((value) => value === 'pending').length;
    return `${heading('İnsan onaylı akış', 'Veli bilgilendirme kuyruğu', 'Maskelenmiş sentetik hedeflerle onay ve gönderim akışını deneyin.', `<button class="button primary" data-action="approve-all" ${pending ? '' : 'disabled'}>Bekleyenleri onayla</button>`)}
    <section class="metric-grid">${metric('Bekleyen', pending, 'Onay gerekli')}${metric('Onaylı', values.filter((value) => value === 'approved').length, 'Gönderime hazır')}${metric('Gönderildi', values.filter((value) => value === 'sent').length, 'Demo teslim kaydı')}${metric('Hata', '0', 'Simülasyon stabil')}</section><section class="stack">${notifications.map(notificationCard).join('')}</section>`;
  }

  const routeMap = [
    [/^\/demo\/today\/?$/, 'today', 'Günlük Operasyon', () => today()],
    [/^\/demo\/schedule\/?$/, 'schedule', 'Ders Programı', () => schedule()],
    [/^\/demo\/leave\/([^/]+)\/?$/, 'leave', 'İzin Etki Analizi', (match) => leave(match[1])],
    [/^\/demo\/attendance\/session\/([^/]+)\/?$/, 'attendance', 'Yoklama Oturumu', (match) => attendance(match[1])],
    [/^\/demo\/notifications\/?$/, 'notifications', 'Veli Bildirimleri', () => notificationsView()],
  ];

  const screen = $('#screen');
  const title = $('#pageTitle');
  const modal = $('#modalBackdrop');
  const modalTitle = $('#modalTitle');
  const modalBody = $('#modalBody');
  const toast = $('#toast');

  function render() {
    try {
      const path = location.pathname.replace(/\/+$/, '') || '/demo/today';
      const found = routeMap.map((route) => [route, path.match(route[0])]).find((entry) => entry[1]);
      if (!found) {
        title.textContent = 'Demo bulunamadı';
        screen.innerHTML = `<div class="panel empty-state">${badge()}<h2>Ekran bulunamadı</h2><p>Bu adres demo route listesinde yok.</p><a class="button primary" href="/demo/today" data-route>Ana ekrana dön</a></div>`;
        setNav('');
        return;
      }
      const [route, match] = found;
      title.textContent = route[2];
      screen.innerHTML = route[3](match);
      setNav(route[1]);
      document.title = `${route[2]} · Okul Yönetim Demo`;
    } catch (error) {
      console.error(error);
      screen.innerHTML = `<div class="panel empty-state">${badge()}<h2>Güvenli demo modu</h2><p>Beklenmeyen hata yakalandı.</p><button class="button primary" data-action="reset">Sıfırla</button></div>`;
    }
  }

  function setNav(key) {
    $$('[data-nav]').forEach((anchor) => anchor.classList.toggle('active', anchor.dataset.nav === key));
  }

  function go(path) {
    history.pushState({}, '', path);
    render();
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  function openModal(modalHeading, body) {
    modalTitle.textContent = modalHeading;
    modalBody.innerHTML = body;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.hidden = true;
    modalBody.innerHTML = '';
    document.body.style.overflow = '';
  }

  function eventModal(event) {
    const readOnly = !canMutateSchedule(state.mode);
    const selectedTime = `${event.start}|${event.end}`;
    openModal(readOnly ? 'Yayınlanmış ders detayı' : 'Ders etkinliğini düzenle', `<div class="modal-content"><div class="form-grid"><div class="field full"><label>Ders</label><input data-event-field="course" value="${esc(event.course)}" ${readOnly ? 'disabled' : ''}></div><div class="field"><label>Gün</label><select data-event-field="day" ${readOnly ? 'disabled' : ''}>${optionList(dayOptions, event.day)}</select></div><div class="field"><label>Saat aralığı</label><select data-event-field="time" ${readOnly ? 'disabled' : ''}>${timeOptions.map(([start, end]) => `<option value="${start}|${end}" ${`${start}|${end}` === selectedTime ? 'selected' : ''}>${start}–${end}</option>`).join('')}</select></div><div class="field"><label>Grup</label><select data-event-field="studentGroup" ${readOnly ? 'disabled' : ''}>${optionList(groupOptions, event.studentGroup)}</select></div><div class="field"><label>Derslik</label><select data-event-field="room" ${readOnly ? 'disabled' : ''}>${optionList(roomOptions, event.room)}</select></div><div class="field full"><label>Öğretmen</label><select data-event-field="teacher" ${readOnly ? 'disabled' : ''}>${optionList(teacherOptions, event.teacher)}</select></div></div>${readOnly ? '<div class="alert-card" style="margin-top:14px"><strong>Immutable görünüm</strong><p>Yayınlanmış program düzenlenemez.</p></div>' : '<div class="alert-card" style="margin-top:14px"><strong>Validation davranışı</strong><p>Kaydetme sonrası tüm hard conflictler mevcut event state’i üzerinden yeniden hesaplanır.</p></div>'}</div><div class="modal-footer"><button class="button" data-action="close">Kapat</button>${readOnly ? '' : `<button class="button primary" data-action="save-event" data-event-id="${esc(event.id)}">Demo değişikliğini kaydet</button>`}</div>`);
  }

  function newEvent() {
    if (!canMutateSchedule(state.mode)) return;
    openModal('Yeni ders ekle', `<div class="modal-content"><div class="form-grid"><div class="field full"><label>Ders</label><input data-event-field="course" value="Yeni Demo Dersi"></div><div class="field"><label>Gün</label><select data-event-field="day">${optionList(dayOptions, 'Pazartesi')}</select></div><div class="field"><label>Saat aralığı</label><select data-event-field="time">${timeOptions.map(([start, end]) => `<option value="${start}|${end}">${start}–${end}</option>`).join('')}</select></div><div class="field"><label>Grup</label><select data-event-field="studentGroup">${optionList(groupOptions, '12-EA-2')}</select></div><div class="field"><label>Derslik</label><select data-event-field="room">${optionList(roomOptions, 'D7')}</select></div><div class="field full"><label>Öğretmen</label><select data-event-field="teacher">${optionList(teacherOptions, 'Demo Öğretmen H')}</select></div></div><div class="alert-card" style="margin-top:14px"><strong>Demo-only kayıt</strong><p>Backend çağrısı yapılmaz; kayıt sonrası validation yeniden çalışır.</p></div></div><div class="modal-footer"><button class="button" data-action="close">Vazgeç</button><button class="button primary" data-action="add-event">Ekle</button></div>`);
  }

  function readEventForm() {
    const [startTime, endTime] = $('[data-event-field="time"]', modalBody).value.split('|');
    return {
      course: $('[data-event-field="course"]', modalBody).value.trim() || 'Demo Dersi',
      day: $('[data-event-field="day"]', modalBody).value,
      start: startTime,
      end: endTime,
      studentGroup: $('[data-event-field="studentGroup"]', modalBody).value,
      room: $('[data-event-field="room"]', modalBody).value,
      teacher: $('[data-event-field="teacher"]', modalBody).value,
    };
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-route]');
    if (link) {
      event.preventDefault();
      go(link.getAttribute('href'));
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'mode') {
      state.mode = button.dataset.mode;
      render();
    } else if (action === 'validate') {
      if (!canMutateSchedule(state.mode)) return;
      const result = runValidation();
      render();
      showToast(validationToast(result));
    } else if (action === 'new-event') {
      newEvent();
    } else if (action === 'event' || action === 'edit-conflict') {
      const scheduleEvent = state.events.find((candidate) => candidate.id === button.dataset.eventId);
      if (scheduleEvent) eventModal(scheduleEvent);
    } else if (action === 'close') {
      closeModal();
    } else if (action === 'save-event') {
      if (!canMutateSchedule(state.mode)) {
        showToast('Yayınlanmış görünüm salt okunurdur.');
        return;
      }
      const scheduleEvent = state.events.find((candidate) => candidate.id === button.dataset.eventId);
      if (!scheduleEvent) return;
      Object.assign(scheduleEvent, readEventForm());
      const result = runValidation();
      closeModal();
      render();
      showToast(validationToast(result));
    } else if (action === 'add-event') {
      if (!canMutateSchedule(state.mode)) return;
      const nextId = `EV${Math.max(...state.events.map((item) => Number(item.id.replace(/\D/g, '')) || 0)) + 1}`;
      state.events.push({ id: nextId, ...readEventForm() });
      const result = runValidation();
      closeModal();
      render();
      showToast(`Demo dersi eklendi. ${validationToast(result)}`);
    } else if (action === 'save-substitutes') {
      $$('[data-substitute]').forEach((select) => { state.substitutes[select.dataset.substitute] = select.value; });
      render();
      showToast('Demo görevlendirmeleri kaydedildi.');
    } else if (action === 'attendance') {
      state.attendance[button.dataset.student] = button.dataset.status;
      render();
    } else if (action === 'complete-attendance') {
      showToast('Yoklama tamamlandı; gerçek kayıt oluşturulmadı.');
    } else if (action === 'approve') {
      state.notifications[button.dataset.id] = 'approved';
      render();
      showToast('Demo bildirimi onaylandı.');
    } else if (action === 'send') {
      state.notifications[button.dataset.id] = 'sent';
      render();
      showToast('Gönderim simüle edildi; gerçek SMS gönderilmedi.');
    } else if (action === 'approve-all') {
      Object.keys(state.notifications).forEach((key) => { if (state.notifications[key] === 'pending') state.notifications[key] = 'approved'; });
      render();
      showToast('Bekleyen demo bildirimleri onaylandı.');
    } else if (action === 'reset') {
      state = start();
      closeModal();
      go('/demo/today');
    }
  });

  $('#resetDemo').addEventListener('click', () => {
    state = start();
    closeModal();
    go('/demo/today');
    showToast(`Demo başlangıç durumuna getirildi: ${state.validation.hardConflictCount} hard conflict.`);
  });
  $('#closeModal').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  addEventListener('popstate', render);
  Object.defineProperty(window, '__OKUL_DEMO__', { value: Object.freeze({ seed: SEED, routes: ['today', 'schedule', 'leave', 'attendance', 'notifications'], validation: 'state-derived' }) });
  render();
})();
