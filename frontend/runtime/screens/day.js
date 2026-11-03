'use strict';

// #454 screen module — Operasyon gün kurulu (split screen). Günün dersleri
// solda yayınlanmış program sırasıyla akar; yoklama dersin olduğu yerde
// alınır. Sağ sutun seçili dersin kararıdır: yoklama listesi (sunucudan
// türetilen roster) veya öğretmensiz dersin karşılık ataması (adaylar
// YALNIZ sunucudan listelenir; istemci aday üretmez). Devamsızlık
// istatistikleri salt-okunur canlı şerittir; her işaretleme sonrası sunucu
// yanıtıyla yeniden çizilir — istemci hiçbir stat üretmez. Gün kapanışı
// (close-the-day) kavramı bu sistemde YOKTUR; hiçbir eylemde yer almaz.
//
// Yükleme otomatik tetiklenmez (#444 spec kısıtı): tek giriş #load-day
// düğmesidir. Oturum kapanışı (lock) ve kontrollü düzeltme (gözetim)
// yoklama akışına aittir; bu modül listeyi her mutasyondan sonra yeniden
// okur (canlı şerit sunucudan gelir).

const dayAttendanceStateLabels = {
  not_started: 'Yoklama başlamadı',
  not_marked: 'İşaretlenmedi',
  present: 'Hazır',
  absent: 'Devamsız',
  late: 'Geç',
  excused: 'Mazeretli',
};

const dayMarkTones = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'neutral',
};

// Karar çubuğu bağlamı: çekirdek izin akışının state'ine (activeLeaveId,
// activeLeaveEtag) DOKUNMAZ; günlük karşılık ataması bölüm kapsamında kalır.
const dayCoverage = {
  leaveId: '',
  eventId: '',
  leaveEtag: '',
  assignmentId: '',
  lessonLabel: '',
};

function dayMarkTone(value) {
  return dayMarkTones[String(value ?? '').trim().toLowerCase()] || 'neutral';
}

/**
 * Canlı şerit (salt-okunur): tüm sayılar sunucu stats alanından gelir.
 * `readOnly: true` sözleşmesi çizimde dürüst bir maydon olarak görünür:
 * bu şerit dönem raporu değildir.
 */
function renderDaySummary(stats, date) {
  const countTag = (key, label, tone) =>
    `<span class="tag" data-tone="${escapeHtml(tone)}">${escapeHtml(label)}: ${escapeHtml(pick(stats, [key], 0))}</span>`;
  return `<p class="card-meta">${escapeHtml(date)} · Canlı yoklama şeridi (salt-okunur; dönem raporu değildir)</p>
    <div class="day-stats">
      ${countTag('lessonCount', 'Ders', 'neutral')}
      ${countTag('coveredLessonCount', 'Karşılanan', 'success')}
      ${countTag('uncoveredLessonCount', 'Karşılanmayan', 'warning')}
      ${countTag('completedSessionCount', 'Tamamlanan oturum', 'success')}
      ${countTag('lockedSessionCount', 'Kilitli oturum', 'neutral')}
      ${countTag('recordedCount', 'İşaretli', 'success')}
      ${countTag('unrecordedCount', 'İşaretsiz', 'warning')}
      ${countTag('presentCount', 'Hazır', 'success')}
      ${countTag('absentCount', 'Devamsız', 'danger')}
      ${countTag('lateCount', 'Geç', 'warning')}
      ${countTag('excusedCount', 'Mazeretli', 'neutral')}
    </div>`;
}

function renderDayLessonCard(lesson) {
  const attendance = pick(lesson, ['attendance'], {});
  const coverage = pick(lesson, ['coverage'], {});
  const eventId = pick(lesson, ['scheduleEventId'], '');
  const sessionId = pick(attendance, ['sessionId'], '');
  const sessionStatus = String(pick(attendance, ['status'], 'not_started')).toLowerCase();
  const recordedCount = Number(pick(attendance, ['recordedCount'], 0));
  const rosterCount = Number(pick(attendance, ['rosterCount'], 0));
  const locked = sessionStatus === 'locked';
  // Gün kuyruğundan çıkma kuralı sunucu sözleşmesiyle aynıdır:
  // tüm roster işaretli (recorded >= roster) ve oturum taslak değil.
  const completed = Boolean(sessionId) && rosterCount > 0 && recordedCount >= rosterCount && sessionStatus !== 'draft';
  const mutes = mutationDisabled();
  const sessionIdUrl = encodeURIComponent(sessionId);
  const canOpenRoster = Boolean(sessionId) && canRequest('GET', `/attendance/sessions/${sessionIdUrl}/roster`);
  const canWholeClass = Boolean(sessionId) && !locked &&
    canRequest('POST', `/attendance/sessions/${sessionIdUrl}/records/present`);
  const leaveId = pick(coverage, ['leaveRequestId'], '');
  const candidatesPath = `/daily-operations/leaves/${encodeURIComponent(leaveId)}/events/${encodeURIComponent(eventId)}/candidates`;
  const canCandidates = Boolean(leaveId) && canRequest('GET', candidatesPath);

  const attendanceLine = sessionId
    ? `<p class="card-meta"><span>${recordedCount}/${rosterCount} işaretli</span><span>${escapeHtml(displayTerm(dayAttendanceStateLabels, sessionStatus, displayStatus(sessionStatus)))}</span></p>`
    : `<p class="hint">${escapeHtml(displayTerm(dayAttendanceStateLabels, sessionStatus, 'Durum bekleniyor'))}${rosterCount ? ` · ${rosterCount} öğrenci` : ''}</p>`;
  const lockedNote = locked
    ? '<p class="hint">Oturum kilitli; kayıtlar yalnız kontrollü düzeltme (gözetim) akışıyla değişir.</p>'
    : '';
  const coverageBlock = !pick(lesson, ['needsCoverage'], false)
    ? ''
    : leaveId
      ? `<p class="hint">Ders öğretmensiz; karşılığı aynı kurulda atanır ve adaylar sunucudan listelenir.</p>
        <button type="button" data-action="day-coverage" data-leave-id="${escapeHtml(leaveId)}" data-event-id="${escapeHtml(eventId)}" data-leave-etag="${escapeHtml(pick(coverage, ['leaveEtag'], ''))}" data-course-label="${escapeHtml(pick(lesson, ['lessonLabel'], 'Ders'))}" ${!canCandidates || mutes ? 'disabled' : ''}>Karşılığı bu derste planla</button>`
      : '<p class="hint">Ders öğretmensiz; karşılık kaynağı bekleniyor.</p>';
  const actions = `<p class="quick-actions">
      ${sessionId
        ? `<button type="button" data-action="day-roster" data-session-id="${escapeHtml(sessionId)}" data-course-label="${escapeHtml(pick(lesson, ['lessonLabel'], 'Ders'))}" ${!canOpenRoster || mutes ? 'disabled' : ''}>Yoklama listesi</button>`
        : ''}
      ${sessionId && !locked
        ? `<button type="button" data-action="day-present-all" data-session-id="${escapeHtml(sessionId)}" ${!canWholeClass || mutes ? 'disabled' : ''}>Tüm sınıf Hazır</button>`
        : ''}
    </p>`;
  return `<article class="card day-lesson-card"${completed ? ' data-state="done"' : ''}>
    <h3>${escapeHtml(pick(lesson, ['timeLabel'], ''))} · ${escapeHtml(pick(lesson, ['lessonLabel'], 'Ders'))}</h3>
    <p class="card-meta">
      <span>${escapeHtml(pick(lesson, ['courseLabel'], 'Ders'))}</span>
      <span>${escapeHtml(pick(lesson, ['roomLabel'], 'Oda bilgisi bekleniyor'))}</span>
      <span>${escapeHtml(pick(lesson, ['teacherLabel'], 'Öğretmen bilgisi çözümlenemedi'))}</span>
      <span class="tag" data-tone="${escapeHtml(statusTone(pick(coverage, ['state'], 'unknown')))}">${escapeHtml(displayStatus(pick(coverage, ['state'], 'unknown')))}</span>
    </p>
    ${attendanceLine}
    ${coverageBlock}
    ${lockedNote}
    ${actions}
  </article>`;
}

function renderDayRailIdle() {
  $('#day-rail').innerHTML = '<p class="hint">Yoklama listesi veya karşılık ataması için soldaki dersten bir eylem seçin.</p>';
}

/**
 * Günün tamamını yayınlanmış programdan okur (sunucu `daily_operations:read`
 * zorlar). `keepRail` mutasyon sonrası yenilemede karar çubuğunu korur;
 * açılışta çubuk dürüst bekleme ipucuna döner.
 */
async function loadDayBoard(options = {}) {
  const keepRail = Boolean(options.keepRail);
  if (!requireSession()) return;
  const branchId = getBranchId();
  if (!branchId) return announce('Gün kurulu için şube seçin.', 'warning');
  state.date = state.date || $('#operation-date').value;
  const lessonsTarget = $('#day-lessons');
  const query = new URLSearchParams({ branchId });
  if (state.date) query.set('date', state.date);
  lessonsTarget.innerHTML = loading('Günün programı getiriliyor');
  if (!keepRail) renderDayRailIdle();
  try {
    const { body } = await apiRequest(`/daily-operations/day?${query.toString()}`);
    const lessons = asArray(body, ['lessons']);
    state.dayLessonCount = lessons.length;
    lessonsTarget.innerHTML = lessons.map(renderDayLessonCard).join('');
    if (!lessons.length) empty(lessonsTarget, 'day');
    $('#day-summary').innerHTML = renderDaySummary(pick(body, ['stats'], {}), pick(body, ['date'], state.date));
    if (lessons.length && options.announceOnLoad !== false) announce('Gün kurulu yüklendi.', 'success');
  } catch (error) {
    renderError(lessonsTarget, error);
  }
}

function renderDayRosterPanel(roster) {
  const target = $('#day-rail');
  const sessionId = pick(roster, ['sessionId'], '') || state.activeDaySessionId;
  const summary = pick(roster, ['summary'], {});
  const sessionStatus = String(pick(roster, ['status'], 'draft')).toLowerCase();
  const version = Number(pick(roster, ['sessionVersion'], 0));
  const rosterRows = asArray(roster, ['rows']);
  const locked = sessionStatus === 'locked';
  if (!rosterRows.length) {
    empty(target, 'dayRail');
    return;
  }
  const sessionIdUrl = encodeURIComponent(sessionId);
  const recordPath = `/attendance/sessions/${sessionIdUrl}/records`;
  const canMark = !locked && canRequest('POST', recordPath);
  const canWholeClass = !locked && canRequest('POST', `${recordPath}/present`);
  // Kontrollü düzeltme yolu yalnız kilitli oturumda; yetkinlik oturum
  // kliniklarda değil izin tablosunda karar verir (görevler ayrılığı).
  const canCorrect = locked &&
    canRequest('POST', `${recordPath}/${encodeURIComponent('x')}/correction`);
  const mutes = mutationDisabled();
  const rosterList = rosterRows.map((row) => {
    const studentCode = pick(row, ['studentCode'], '');
    const statusKey = String(pick(row, ['status'], 'not_marked')).toLowerCase();
    const actions = locked
      ? `<button type="button" data-action="day-correct" data-session-id="${escapeHtml(sessionId)}" data-student-id="${escapeHtml(pick(row, ['studentId'], ''))}" data-session-version="${escapeHtml(version)}" ${!canCorrect || mutes ? 'disabled' : ''}>Kontrollü düzeltme</button>`
      : `<span class="quick-actions">
          ${['present', 'absent', 'late', 'excused'].map((mark) =>
            `<button type="button" data-action="day-mark" data-session-id="${escapeHtml(sessionId)}" data-student-id="${escapeHtml(pick(row, ['studentId'], ''))}" data-mark="${mark}" ${!canMark || mutes ? 'disabled' : ''}>${escapeHtml(displayTerm(dayAttendanceStateLabels, mark, 'Durum bekleniyor'))}</button>`).join('')}
        </span>`;
    return `<li data-student-state="${escapeHtml(statusKey)}">
      <strong>${escapeHtml(pick(row, ['studentLabel'], 'Kayıt bekleyen öğrenci'))}${studentCode ? ` · ${escapeHtml(studentCode)}` : ''}</strong>
      <span class="tag" data-tone="${escapeHtml(dayMarkTone(statusKey))}">${escapeHtml(displayTerm(dayAttendanceStateLabels, statusKey, 'Durum bekleniyor'))}</span>
      ${actions}
    </li>`;
  }).join('');
  target.innerHTML = `<article class="card">
    <h3>Yoklama listesi · ${escapeHtml(displayStatus(sessionStatus))}</h3>
    <p class="card-meta">
      <span>${Number(pick(summary, ['recordedCount'], 0))}/${Number(pick(summary, ['rosterCount'], 0))} işaretli</span>
      <span>${Number(pick(summary, ['presentCount'], 0))} Hazır</span>
      <span>${Number(pick(summary, ['absentCount'], 0))} Devamsız</span>
      <span>${Number(pick(summary, ['lateCount'], 0))} Geç</span>
      <span>${Number(pick(summary, ['excusedCount'], 0))} Mazeretli</span>
    </p>
    ${locked
      ? '<p class="hint">Kilitli oturum: yalnız kontrollü düzeltme (gözetim) yapılır.</p>'
      : `<button type="button" data-action="day-present-all" data-session-id="${escapeHtml(sessionId)}" ${!canWholeClass || mutes ? 'disabled' : ''}>Tüm sınıf Hazır</button>`}
    <ul class="impact-list day-roster">${rosterList}</ul>
  </article>`;
}

/**
 * Sunucu-türetimli roster (`GET /attendance/sessions/:id/roster`): satır
 * sırası, işaret durumları ve özet sunucudan gelir; istemci sıralamaz,
 * sayı üretmez.
 */
async function openDayRoster(sessionId, options = {}) {
  if (!requireSession()) return;
  state.activeDaySessionId = sessionId || state.activeDaySessionId;
  if (!state.activeDaySessionId) return announce('Önce dersten bir yoklama oturumu seçin.', 'warning');
  const target = $('#day-rail');
  target.innerHTML = loading('Yoklama listesi getiriliyor');
  try {
    const { body } = await apiRequest(`/attendance/sessions/${encodeURIComponent(state.activeDaySessionId)}/roster`);
    renderDayRosterPanel(body);
    if (options.announceOnLoad !== false) announce('Yoklama listesi yüklendi.', 'success');
  } catch (error) {
    renderError(target, error);
  }
}

/** Mutasyon sonrası canlı yenileme: roster + gün şeridi ikisi sunucudan gelir. */
async function refreshDayAfterMutation(sessionId) {
  await openDayRoster(sessionId, { announceOnLoad: false });
  await loadDayBoard({ keepRail: true, announceOnLoad: false });
}

async function markDayAttendance(sessionId, studentId, mark) {
  if (!requireSession()) return;
  const target = $('#day-rail');
  target.innerHTML = loading('Kayıt işaretleniyor');
  try {
    await apiRequest(`/attendance/sessions/${encodeURIComponent(sessionId)}/records`, {
      method: 'POST',
      body: { studentId, status: mark },
    });
    announce('Yoklama kaydı işaretlendi.', 'success');
    await refreshDayAfterMutation(sessionId);
  } catch (error) {
    renderError(target, error);
  }
}

/** Tek eylemde tüm sınıf Hazır (roster sunucunun immutable snapshot'ıdır). */
async function markAllDayPresent(sessionId) {
  if (!requireSession()) return;
  const target = $('#day-rail');
  target.innerHTML = loading('Tüm sınıf Hazır yapılıyor');
  try {
    await apiRequest(`/attendance/sessions/${encodeURIComponent(sessionId)}/records/present`, {
      method: 'POST',
    });
    announce('Tüm sınıf Hazır işaretlendi.', 'success');
    await refreshDayAfterMutation(sessionId);
  } catch (error) {
    renderError(target, error);
  }
}

/** Kontrollü düzeltme: yalnız kilitli oturum + gözetim + kapalı gerekçe kodu. */
async function correctDayAttendance(sessionId, studentId, sessionVersion) {
  if (!requireSession()) return;
  const status = window.prompt('Düzeltme durumu (present/absent/late/excused):', 'present');
  if (!status) return;
  const correctionReason = window.prompt('Kapalı gerekçe kodu (data_entry_error / teacher_review / process_error):', 'data_entry_error');
  if (!correctionReason) return;
  const target = $('#day-rail');
  target.innerHTML = loading('Kontrollü düzeltme uygulanıyor');
  try {
    await apiRequest(`/attendance/sessions/${encodeURIComponent(sessionId)}/records/${encodeURIComponent(studentId)}/correction`, {
      method: 'POST',
      body: { status, reasonCode: correctionReason, expectedVersion: Number(sessionVersion) },
      versioned: true,
    });
    announce('Kontrollü düzeltme tamamlandı.', 'success');
    await refreshDayAfterMutation(sessionId);
  } catch (error) {
    renderError(target, error);
  }
}

/**
 * Öğretmensiz dersin karşılık ataması: aday listesi yalnız sunucudan
 * (`leave:impact:read`); görevlendirme `daily_operations:update` +
 * If-Match ile izin sürümü doğrulanır (#445/#446: 412 kalır 412, 428 kalır
 * 428 — istemci kod üretmez).
 */
async function loadDayCoverage(leaveId, eventId, leaveEtag, courseLabel = '') {
  if (!requireSession()) return;
  if (!leaveId || !eventId) return announce('Karşılık ataması için önce öğretmensiz dersi seçin.', 'warning');
  if (dayCoverage.eventId !== eventId) dayCoverage.assignmentId = '';
  const target = $('#day-rail');
  dayCoverage.leaveId = leaveId;
  dayCoverage.eventId = eventId;
  dayCoverage.leaveEtag = String(leaveEtag || dayCoverage.leaveEtag || '');
  dayCoverage.lessonLabel = courseLabel || dayCoverage.lessonLabel;
  target.innerHTML = loading('Karşılık adayları getiriliyor');
  try {
    const { body } = await apiRequest(`/daily-operations/leaves/${encodeURIComponent(dayCoverage.leaveId)}/events/${encodeURIComponent(dayCoverage.eventId)}/candidates`);
    if (body?.eligibilityFinalized === false) {
      return renderRegionState(target, 'eligibility_not_ready');
    }
    const candidates = asArray(body, ['candidates', 'items']);
    if (!candidates.length) {
      empty(target, 'candidates');
      return;
    }
    target.innerHTML = `<article class="card">
      <h3>Karşılık adayları · ${escapeHtml(dayCoverage.lessonLabel || 'Ders')}</h3>
      <div class="day-candidates">${candidates.map(renderDayCandidate).join('')}</div>
    </article>`;
    announce('Karşılık adayları yüklendi.', 'success');
  } catch (error) {
    renderError(target, error);
  }
}

function renderDayCandidate(candidate) {
  const teacherId = pick(candidate, ['teacherId', 'candidateId']);
  const availability = String(pick(candidate, ['availabilityStatus'], '')).toLowerCase();
  // Sözleşme yalnız sunucuda elenen uygun adayları döndürür; açık
  // availability alanı yoksa yedekleme (atama) sunucu kararıdır.
  const available = !availability || availability === 'available' || availability === 'free' || availability === 'musait';
  const eligible = Boolean(pick(candidate, ['courseEligible', 'eligible'], false));
  const selectable = eligible && available;
  const substitutionPath = `/daily-operations/leaves/${encodeURIComponent(dayCoverage.leaveId)}/events/${encodeURIComponent(dayCoverage.eventId)}/substitution`;
  const canSubstitute = canRequest('POST', substitutionPath);
  const canClear = canRequest('DELETE', substitutionPath);
  const assignDisabled = !selectable || !dayCoverage.leaveEtag || mutationDisabled();
  const clearDisabled = !dayCoverage.assignmentId || !dayCoverage.leaveEtag || mutationDisabled();
  return `<article class="card candidate">
    <strong>${escapeHtml(pick(candidate, ['displayName', 'name'], 'Aday öğretmen'))}</strong>
    <p class="card-meta">
      <span>${eligible ? 'Bu dersi verebilir' : 'Bu dersi veremez'}</span>
      <span>${available ? 'Bu saat müsait' : 'Bu saat meşgul'}</span>
      <span class="tag" data-tone="${selectable ? 'success' : 'danger'}">${selectable ? 'Seçilebilir aday' : eligible ? 'Şu an seçilemez' : 'Seçilemez aday'}</span>
    </p>
    ${canSubstitute || canClear
      ? `<span class="quick-actions">
          ${canSubstitute
            ? `<button type="button" data-action="day-assign" data-teacher-id="${escapeHtml(teacherId)}" ${assignDisabled ? 'disabled' : ''}>Bu öğretmeni görevlendir</button>`
            : ''}
          ${canClear
            ? `<button type="button" data-action="day-assign-clear" ${clearDisabled ? 'disabled' : ''}>Görevlendirmeyi temizle</button>`
            : ''}
        </span>`
      : '<p class="hint">Aday bağlamı görüntüleniyor; görevlendirme yetkiniz kapsamında değil.</p>'}
  </article>`;
}

async function assignDayCandidate(teacherId) {
  if (!requireSession()) return;
  if (!dayCoverage.leaveId || !dayCoverage.eventId) return announce('Karşılık ataması için önce öğretmensiz dersi seçin.', 'warning');
  if (!dayCoverage.leaveEtag) {
    return announce('Güncel izin kaydı alınmadan görevlendirme yapılamaz.', 'warning');
  }
  const target = $('#day-rail');
  target.innerHTML = loading('Görevlendirme kaydediliyor');
  try {
    const { body, etag } = await apiRequest(`/daily-operations/leaves/${encodeURIComponent(dayCoverage.leaveId)}/events/${encodeURIComponent(dayCoverage.eventId)}/substitution`, {
      method: 'POST',
      headers: { 'If-Match': dayCoverage.leaveEtag },
      body: { substituteTeacherId: teacherId },
      versioned: true,
    });
    if (etag) dayCoverage.leaveEtag = String(etag);
    const lessonEvent = asArray(body, ['events', 'affectedLessons', 'lessons', 'items'])
      .find((entry) => eventIdentity(entry) === dayCoverage.eventId);
    dayCoverage.assignmentId = pick(lessonEvent, ['substituteAssignmentId'], dayCoverage.assignmentId) || 'server-confirmed';
    announce('Görevlendirme kaydedildi; gün kurulu sunucudan yenileniyor.', 'success');
    await loadDayBoard({ keepRail: false, announceOnLoad: false });
    await loadDayCoverage(dayCoverage.leaveId, dayCoverage.eventId, dayCoverage.leaveEtag, dayCoverage.lessonLabel);
  } catch (error) {
    renderError(target, error);
  }
}

async function clearDayAssignment() {
  if (!requireSession()) return;
  if (!dayCoverage.leaveEtag) {
    return announce('Güncel izin kaydı alınmadan görevlendirme temizlenemez.', 'warning');
  }
  const target = $('#day-rail');
  target.innerHTML = loading('Görevlendirme temizleniyor');
  try {
    await apiRequest(`/daily-operations/leaves/${encodeURIComponent(dayCoverage.leaveId)}/events/${encodeURIComponent(dayCoverage.eventId)}/substitution`, {
      method: 'DELETE',
      headers: { 'If-Match': dayCoverage.leaveEtag },
      versioned: true,
    });
    dayCoverage.assignmentId = '';
    announce('Görevlendirme temizlendi; gün kurulu sunucudan yenileniyor.', 'success');
    await loadDayBoard({ keepRail: false, announceOnLoad: false });
    await loadDayCoverage(dayCoverage.leaveId, dayCoverage.eventId, dayCoverage.leaveEtag, dayCoverage.lessonLabel);
  } catch (error) {
    renderError(target, error);
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.action === 'day-roster') openDayRoster(target.dataset.sessionId);
  if (target.dataset.action === 'day-mark') markDayAttendance(target.dataset.sessionId, target.dataset.studentId, target.dataset.mark);
  if (target.dataset.action === 'day-present-all') markAllDayPresent(target.dataset.sessionId);
  if (target.dataset.action === 'day-correct') correctDayAttendance(target.dataset.sessionId, target.dataset.studentId, target.dataset.sessionVersion);
  if (target.dataset.action === 'day-coverage') loadDayCoverage(target.dataset.leaveId, target.dataset.eventId, target.dataset.leaveEtag, target.dataset.courseLabel);
  if (target.dataset.action === 'day-assign') assignDayCandidate(target.dataset.teacherId);
  if (target.dataset.action === 'day-assign-clear') clearDayAssignment();
});

$('#load-day').addEventListener('click', () => loadDayBoard());
