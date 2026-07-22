(function bootstrapFullVisionDemo() {
  'use strict';

  const { routes, matchRoute, sanitizeQuery } = window.FullVisionRoutes;
  const { getClaimSet } = window.FullVisionClaims;
  const { getScenario, getStep } = window.FullVisionScenarios;
  const stateModule = window.FullVisionState;
  const phaseOne = window.FullVisionPhaseOne;
  const ui = window.FullVisionUI;

  const dom = {
    sidebar: document.getElementById('sidebar'),
    nav: document.getElementById('phaseNav'),
    screen: document.getElementById('screen'),
    pageTitle: document.getElementById('pageTitle'),
    phaseFilter: document.getElementById('phaseFilter'),
    personaFilter: document.getElementById('personaFilter'),
    scenarioRail: document.getElementById('scenarioRail'),
    breadcrumb: document.getElementById('breadcrumb'),
    claimDrawer: document.getElementById('claimDrawer'),
    claimContent: document.getElementById('claimContent'),
    claimToggle: document.getElementById('claimToggle'),
    claimClose: document.getElementById('claimClose'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    globalReset: document.getElementById('globalReset'),
    menuToggle: document.getElementById('menuToggle'),
    toast: document.getElementById('toast'),
  };

  let appState = stateModule.createInitialState();
  let currentMatch = matchRoute(window.location.pathname);
  let toastTimer;
  let drawerTrigger;

  function query() { return new URLSearchParams(window.location.search); }
  function currentScenario() { return getScenario(query().get('scenario')); }
  function currentScenarioStep() { return getStep(currentScenario(), query().get('step')); }

  function normalizeLocation() {
    currentMatch = matchRoute(window.location.pathname);
    const sanitized = sanitizeQuery(currentMatch.route, window.location.search);
    const normalizedSearch = sanitized.toString() ? `?${sanitized.toString()}` : '';
    if (currentMatch.pathname !== window.location.pathname || normalizedSearch !== window.location.search) {
      window.history.replaceState({}, '', `${currentMatch.pathname}${normalizedSearch}`);
    }
    return currentMatch;
  }

  function restoreScenarioSnapshot(resetWithoutScenario) {
    normalizeLocation();
    const scenario = currentScenario();
    const step = currentScenarioStep();
    if (scenario && step) appState = stateModule.createStateForScenarioStep(step.number);
    else if (resetWithoutScenario) appState = stateModule.createInitialState();
  }

  function canonicalUrl(path) {
    const target = new URL(path, window.location.origin);
    const scenario = currentScenario();
    if (scenario && !target.searchParams.has('scenario')) {
      const matched = matchRoute(target.pathname);
      const candidates = scenario.steps
        .map((step, index) => ({ step, index, url: new URL(step.path, window.location.origin) }))
        .filter((entry) => entry.step.routeId === matched.route.id)
        .sort((a, b) => [...b.url.searchParams].length - [...a.url.searchParams].length);
      const exact = candidates.find((entry) => [...entry.url.searchParams].every(([key, value]) => target.searchParams.get(key) === value));
      const index = exact ? exact.index : -1;
      if (index >= 0) {
        target.searchParams.set('scenario', scenario.id);
        target.searchParams.set('step', String(index + 1));
      }
    }
    return `${target.pathname}${target.search}`;
  }

  function navigate(path, options) {
    const target = canonicalUrl(path);
    if (options && options.replace) window.history.replaceState({}, '', target);
    else window.history.pushState({}, '', target);
    restoreScenarioSnapshot(false);
    render({ focus: !(options && options.noFocus) });
  }

  function routePath(route) {
    const samples = { ':leaveId': 'D-LV-204', ':sessionId': 'D-AT-1204', ':examId': 'D-EX-001', ':caseId': 'D-CS-001', ':studentId': 'D-S-001' };
    return Object.entries(samples).reduce((path, [key, value]) => path.replace(key, value), route.path);
  }

  function buildNavigation() {
    const selectedPhase = dom.phaseFilter.value;
    const selectedPersona = dom.personaFilter.value;
    const unique = routes.filter((route, index, list) => list.findIndex((candidate) => candidate.screenFamily === route.screenFamily) === index);
    const groups = ['f1', 'f2', 'f3'].map((phase) => {
      const phaseRoutes = unique.filter((route) => route.phase === phase);
      const label = { f1: 'Faz 1 · Operasyon', f2: 'Faz 2 · Akademik', f3: 'Faz 3 · Vizyon' }[phase];
      const hidden = selectedPhase !== 'all' && selectedPhase !== phase;
      return `<section class="nav-group" data-phase="${phase}" ${hidden ? 'hidden' : ''}><button class="nav-group-title" type="button" data-toggle-phase="${phase}" aria-expanded="true"><span>${label}</span><b>${phaseRoutes.length}</b></button><div class="nav-items">${phaseRoutes.map((route) => { const personaMatch = selectedPersona === 'all' || route.personas.includes(selectedPersona); return `<a href="${ui.escapeHtml(routePath(route))}" data-route data-nav-id="${route.id}" data-persona-match="${personaMatch}" class="${personaMatch ? 'persona-match' : 'persona-muted'}"><span class="nav-dot ${phase}" aria-hidden="true"></span><span><strong>${ui.escapeHtml(route.title)}</strong><small>${ui.escapeHtml(route.priority)} · ${route.maturity.startsWith('Vizyon') ? 'Kavramsal' : route.maturity.startsWith('Mevcut') ? 'Kanıtlı' : 'Simülasyon'}</small></span></a>`; }).join('')}</div></section>`;
    }).join('');
    dom.nav.innerHTML = `<a class="overview-link" href="/demo/overview" data-route data-nav-id="overview"><span aria-hidden="true">⌂</span><strong>Genel Bakış</strong></a>${groups}`;
  }

  function renderScenarioRail() {
    const scenario = currentScenario();
    if (!scenario || !scenario.steps.length) {
      dom.scenarioRail.hidden = true;
      dom.scenarioRail.innerHTML = '';
      return;
    }
    const step = currentScenarioStep();
    const items = scenario.steps.map((item, index) => {
      const path = `${item.path}${item.path.includes('?') ? '&' : '?'}scenario=${scenario.id}&step=${index + 1}`;
      return `<a href="${ui.escapeHtml(path)}" data-route aria-label="${ui.escapeHtml(`${index + 1}. adım: ${item.label}`)}" class="${index === step.index ? 'active' : index < step.index ? 'done' : ''}" ${index === step.index ? 'aria-current="step"' : ''}><span>${index < step.index ? '✓' : index + 1}</span><strong>${ui.escapeHtml(item.label)}</strong></a>`;
    }).join('');
    const previous = step.index > 0 ? scenario.steps[step.index - 1] : null;
    const next = step.index < scenario.steps.length - 1 ? scenario.steps[step.index + 1] : null;
    const stepPath = (item, index) => `${item.path}${item.path.includes('?') ? '&' : '?'}scenario=${scenario.id}&step=${index + 1}`;
    dom.scenarioRail.hidden = false;
    dom.scenarioRail.innerHTML = `<div class="scenario-title"><span class="presentation-dot" aria-hidden="true"></span><div><strong>Sunum Modu · Operasyon</strong><small>${ui.escapeHtml(step.note)}</small></div></div><nav aria-label="Senaryo adımları">${items}</nav><div class="scenario-controls">${previous ? `<a class="button subtle" href="${ui.escapeHtml(stepPath(previous, step.index - 1))}" data-route aria-label="Önceki sunum adımı">← <span>Önceki</span></a>` : '<span></span>'}${next ? `<a class="button subtle" href="${ui.escapeHtml(stepPath(next, step.index + 1))}" data-route aria-label="Sonraki sunum adımı"><span>Sonraki</span> →</a>` : '<button class="button subtle" data-reset-scenario>Başa al</button>'}</div>`;
  }

  function renderBreadcrumb(route) {
    const phase = route.phase === 'global' ? '' : `<span aria-hidden="true">/</span><span>${ui.escapeHtml(ui.phaseLabel(route.phase))}</span>`;
    const current = currentMatch.notFound ? 'Sayfa bulunamadı' : route.title;
    dom.breadcrumb.innerHTML = `<a href="/demo/overview" data-route>Genel Bakış</a>${phase}<span aria-hidden="true">/</span><span aria-current="page">${ui.escapeHtml(current)}</span>`;
  }

  function renderClaimDrawer(route) {
    const claim = getClaimSet(route.claimSet);
    dom.claimContent.innerHTML = `<section><span class="drawer-label">Gösterdiği değer</span><p>${ui.escapeHtml(claim.shows)}</p></section><section><span class="drawer-label">İddia sınırı</span><p>${ui.escapeHtml(claim.boundary)}</p></section><section><span class="drawer-label">Ürün olgunluğu</span>${ui.maturityBadge(route.maturity)}</section><section class="drawer-policy"><strong>Statik demo politikası</strong><ul><li>Sentetik fixture</li><li>Bellek içi state</li><li>Gerçek işlem ve dış bağlantı yok</li><li>Her reset aynı seed’e döner</li></ul></section>`;
  }

  function render(options) {
    normalizeLocation();
    const route = currentMatch.route;
    document.documentElement.dataset.phase = route.phase;
    const pageTitle = currentMatch.notFound ? 'Sayfa bulunamadı' : route.title;
    document.title = `${pageTitle} · Okul Yönetim Demo`;
    dom.pageTitle.textContent = pageTitle;
    buildNavigation();
    renderScenarioRail();
    renderClaimDrawer(route);
    renderBreadcrumb(route);
    dom.screen.innerHTML = currentMatch.notFound
      ? ui.emptyState('!', 'Demo sayfası bulunamadı', `${currentMatch.pathname} tanımlı bir demo route’u değildir.`, '<a class="button primary" href="/demo/overview" data-route>Genel Bakışa dön</a>')
      : phaseOne.render(route, appState, currentMatch.pathname, window.location.search);
    document.querySelectorAll('[data-nav-id]').forEach((item) => {
      const navRoute = routes.find((candidate) => candidate.id === item.dataset.navId);
      item.classList.toggle('active', item.dataset.navId === route.id || (navRoute && navRoute.screenFamily === route.screenFamily));
    });
    if (options && options.focus) dom.screen.focus({ preventScroll: true });
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    toastTimer = window.setTimeout(() => { dom.toast.hidden = true; }, 4200);
  }

  function dispatch(event, message) {
    const previous = appState;
    appState = stateModule.reduce(appState, event);
    render({ focus: false });
    if (message) showToast(previous === appState ? `Demo engeli: ${message}` : message);
  }

  function openDrawer() {
    drawerTrigger = document.activeElement;
    dom.claimDrawer.hidden = false;
    dom.drawerBackdrop.hidden = false;
    dom.claimToggle.setAttribute('aria-expanded', 'true');
    dom.claimClose.focus();
  }

  function closeDrawer() {
    if (dom.claimDrawer.hidden) return;
    dom.claimDrawer.hidden = true;
    dom.drawerBackdrop.hidden = true;
    dom.claimToggle.setAttribute('aria-expanded', 'false');
    if (drawerTrigger) drawerTrigger.focus();
  }

  document.addEventListener('click', (event) => {
    const routeAnchor = event.target.closest('[data-route]');
    if (routeAnchor) {
      event.preventDefault();
      navigate(routeAnchor.getAttribute('href'));
      dom.sidebar.classList.remove('open');
      dom.menuToggle.setAttribute('aria-expanded', 'false');
      return;
    }
    const startScenario = event.target.closest('[data-start-scenario]');
    if (startScenario) {
      appState = stateModule.createInitialState();
      dom.phaseFilter.value = 'f1';
      dom.personaFilter.value = 'operations';
      navigate('/demo/f1/operations?scenario=operations&step=1');
      showToast('Operasyon sunum modu başladı. Tüm veriler sentetiktir.');
      return;
    }
    const persona = event.target.closest('[data-persona-select]');
    if (persona) {
      dom.personaFilter.value = persona.dataset.personaSelect;
      buildNavigation();
      showToast(`${ui.personaLabel(persona.dataset.personaSelect)} görünümü seçildi; gerçek yetkilendirme uygulanmadı.`);
      return;
    }
    const phaseToggle = event.target.closest('[data-toggle-phase]');
    if (phaseToggle) {
      const expanded = phaseToggle.getAttribute('aria-expanded') === 'true';
      phaseToggle.setAttribute('aria-expanded', String(!expanded));
      phaseToggle.nextElementSibling.hidden = expanded;
      return;
    }
    if (event.target.closest('[data-approve-leave]')) {
      dispatch({ type: stateModule.ACTIONS.APPROVE_LEAVE_DEMO }, 'Demo durumu güncellendi; gerçek izin kaydı veya görevlendirme oluşturulmadı.');
      return;
    }
    if (event.target.closest('[data-accept-schedule]')) {
      dispatch({ type: stateModule.ACTIONS.ACCEPT_SCHEDULE_PREVIEW }, 'Değişiklik önizlemesi kabul edildi; program yayımlanmadı.');
      return;
    }
    if (event.target.closest('[data-lock-attendance]')) {
      dispatch({ type: stateModule.ACTIONS.LOCK_ATTENDANCE_DEMO }, 'Yoklama kilidi simüle edildi; gerçek öğrenci kaydı değişmedi.');
      return;
    }
    const notification = event.target.closest('[data-simulate-notification]');
    if (notification) {
      dispatch({ type: stateModule.ACTIONS.SIMULATE_NOTIFICATION, notificationId: notification.dataset.simulateNotification }, 'Gönderim simülasyonu tamamlandı; gerçek mesaj gönderilmedi.');
      return;
    }
    const screenReset = event.target.closest('[data-screen-reset]');
    if (screenReset) {
      dispatch({ type: stateModule.ACTIONS.RESET_SCREEN, screen: screenReset.dataset.screenReset }, 'Aktif ekran aynı sentetik başlangıç durumuna döndü.');
      return;
    }
    if (event.target.closest('[data-reset-scenario]')) {
      appState = stateModule.createInitialState();
      navigate('/demo/f1/operations?scenario=operations&step=1');
      showToast('Senaryo aynı seed ile başa alındı.');
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-substitute]')) {
      dispatch({ type: stateModule.ACTIONS.SELECT_SUBSTITUTE, lessonId: event.target.dataset.lessonId, teacherId: event.target.value }, 'Uygun yedek seçimi demo durumuna eklendi.');
      return;
    }
    if (event.target.matches('[data-attendance]')) {
      dispatch({ type: stateModule.ACTIONS.SET_ATTENDANCE, studentId: event.target.dataset.studentId, status: event.target.value }, 'Yoklama durumu demo içinde güncellendi.');
      return;
    }
    if (event.target === dom.phaseFilter || event.target === dom.personaFilter) {
      buildNavigation();
      if (event.target === dom.personaFilter) showToast('Persona görünümü seçildi; bu filtre gerçek yetkilendirme değildir.');
    }
  });

  dom.globalReset.addEventListener('click', () => { appState = stateModule.createInitialState(); navigate('/demo/overview'); showToast('Tüm demo aynı seed ile başlangıç durumuna döndü.'); });
  dom.claimToggle.addEventListener('click', openDrawer);
  dom.claimClose.addEventListener('click', closeDrawer);
  dom.drawerBackdrop.addEventListener('click', closeDrawer);
  dom.menuToggle.addEventListener('click', () => { const open = dom.sidebar.classList.toggle('open'); dom.menuToggle.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !dom.claimDrawer.hidden) {
      const focusable = [...dom.claimDrawer.querySelectorAll('button:not([disabled]), a[href], select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.key === 'Escape') {
      const sidebarWasOpen = dom.sidebar.classList.contains('open');
      closeDrawer();
      dom.sidebar.classList.remove('open');
      dom.menuToggle.setAttribute('aria-expanded', 'false');
      if (sidebarWasOpen) dom.menuToggle.focus();
    }
  });
  window.addEventListener('popstate', () => {
    restoreScenarioSnapshot(true);
    render({ focus: true });
  });

  restoreScenarioSnapshot(false);
  render({ focus: false });
})();
