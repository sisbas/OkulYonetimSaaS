(function attachRouteManifest(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FullVisionRoutes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRouteManifest() {
  'use strict';

  const M = {
    proven: 'Mevcut / Kanıtlı',
    planned: 'Planlanan / Etkileşimli Simülasyon',
    vision: 'Vizyon / Kavramsal Simülasyon',
  };

  const implementedFamilies = new Set(['overview', 'f1-operations', 'f1-leaves', 'f1-schedule', 'f1-attendance', 'f1-notifications']);
  const presentationStepsByRoute = {
    'f1-operations': { operations: { '1': {}, '6': { status: 'complete' } } },
    'f1-leave-detail': { operations: { '2': {} } },
    'f1-schedule': { operations: { '3': { view: 'lifecycle' } } },
    'f1-attendance-detail': { operations: { '4': {} } },
    'f1-notifications': { operations: { '5': {} } },
  };
  const route = (id, path, phase, screenFamily, title, navGroup, personas, priority, maturity, fixture, claimSet, extra) => {
    const overrides = extra || {};
    const samples = { ':leaveId': 'D-LV-204', ':sessionId': 'D-AT-1204', ':examId': 'D-EX-001', ':caseId': 'D-CS-001', ':studentId': 'D-S-001' };
    const samplePath = Object.entries(samples).reduce((value, [key, replacement]) => value.replace(key, replacement), path);
    const presentationSteps = presentationStepsByRoute[id] || {};
    const presentationQuery = Object.keys(presentationSteps).length
      ? {
          scenario: Object.keys(presentationSteps),
          step: [...new Set(Object.values(presentationSteps).flatMap((steps) => Object.keys(steps)))],
        }
      : {};
    return {
      id, path, samplePath, phase, screenFamily, componentId: screenFamily, title, navGroup, personas, priority, maturity, fixture, claimSet,
      implementationStatus: implementedFamilies.has(screenFamily) ? 'gate2-high-fidelity' : 'frozen-placeholder',
      presentationSteps,
      ...overrides,
      allowedQuery: { ...presentationQuery, ...(overrides.allowedQuery || {}) },
    };
  };

  const routes = [
    route('overview', '/demo/overview', 'global', 'overview', 'Ürün Vizyonu', 'Genel', ['manager', 'operations', 'teacher', 'guidance', 'guardian', 'student'], 'P0', M.planned, 'catalogue', 'global'),
    route('f1-operations', '/demo/f1/operations', 'f1', 'f1-operations', 'Günlük Operasyon', 'Operasyon', ['manager', 'operations', 'teacher'], 'P0', M.proven, 'operations.daily', 'operations', { allowedQuery: { status: ['complete'] } }),
    route('f1-setup', '/demo/f1/setup', 'f1', 'f1-setup', 'Temel Tanımlar', 'Operasyon', ['manager', 'operations'], 'P0', M.planned, 'coreDefinitions', 'simulation'),
    route('f1-schedule', '/demo/f1/schedule', 'f1', 'f1-schedule', 'Program Stüdyosu', 'Operasyon', ['manager', 'operations', 'teacher'], 'P0', M.proven, 'operations.schedule', 'schedule', { allowedQuery: { view: ['week', 'lifecycle', 'generate', 'diagnostics'] } }),
    route('f1-leaves', '/demo/f1/leaves', 'f1', 'f1-leaves', 'İzin Merkezi', 'Operasyon', ['manager', 'operations', 'teacher'], 'P0', M.planned, 'operations.leaves', 'leave'),
    route('f1-leave-detail', '/demo/f1/leaves/:leaveId', 'f1', 'f1-leaves', 'İzin Kararı ve Etkisi', 'Operasyon', ['manager', 'operations', 'teacher'], 'P0', M.planned, 'operations.leaves', 'leave', { dynamic: true }),
    route('f1-attendance', '/demo/f1/attendance', 'f1', 'f1-attendance', 'Yoklama Merkezi', 'Operasyon', ['operations', 'teacher'], 'P0', M.planned, 'operations.attendance', 'attendance'),
    route('f1-attendance-detail', '/demo/f1/attendance/:sessionId', 'f1', 'f1-attendance', 'Yoklama Oturumu', 'Operasyon', ['operations', 'teacher'], 'P0', M.proven, 'operations.attendance', 'attendance', { dynamic: true }),
    route('f1-notifications', '/demo/f1/notifications', 'f1', 'f1-notifications', 'Veli Bilgilendirme', 'Operasyon', ['manager', 'operations'], 'P0', M.proven, 'operations.notifications', 'notification'),
    route('f1-reports', '/demo/f1/reports', 'f1', 'f1-reports', 'Temel Raporlar', 'Yönetim', ['manager'], 'P1', M.planned, 'operations.reports', 'simulation'),
    route('f1-access', '/demo/f1/access', 'f1', 'f1-access', 'Kullanıcı, Rol ve İşlem İzi', 'Yönetim', ['manager'], 'P1', M.planned, 'catalogue.access', 'access'),
    route('f2-strategy', '/demo/f2/strategy', 'f2', 'f2-strategy', 'Stratejik Dashboard', 'Akademik Yönetim', ['manager', 'guidance'], 'P0', M.planned, 'academics.strategy', 'simulation'),
    route('f2-assessments', '/demo/f2/assessments', 'f2', 'f2-assessments', 'Sınav Yönetimi', 'Akademik Yönetim', ['operations', 'guidance'], 'P0', M.planned, 'academics.assessments', 'simulation', { allowedQuery: { view: ['calendar', 'operations'] } }),
    route('f2-assessment-results', '/demo/f2/assessments/:examId/results', 'f2', 'f2-performance', 'Performans Analitiği', 'Akademik Yönetim', ['manager', 'guidance', 'teacher'], 'P0', M.planned, 'academics.results', 'simulation', { dynamic: true }),
    route('f2-guidance', '/demo/f2/guidance', 'f2', 'f2-guidance', 'Rehberlik Kuyruğu', 'Öğrenci Desteği', ['guidance'], 'P0', M.planned, 'guidance.cases', 'guidance'),
    route('f2-guidance-detail', '/demo/f2/guidance/:caseId', 'f2', 'f2-guidance', 'Rehberlik Çalışma Alanı', 'Öğrenci Desteği', ['guidance'], 'P0', M.planned, 'guidance.cases', 'guidance', { dynamic: true }),
    route('f2-workload', '/demo/f2/insights/workload', 'f2', 'f2-workload', 'Kaynak ve Yük Analizi', 'Akademik Yönetim', ['manager', 'operations'], 'P1', M.planned, 'academics.workload', 'simulation'),
    route('f2-student', '/demo/f2/students/:studentId', 'f2', 'f2-student-360', 'Öğrenci 360', 'Öğrenci Desteği', ['manager', 'guidance', 'teacher'], 'P0', M.planned, 'academics.students', 'guidance', { dynamic: true }),
    route('f2-import', '/demo/f2/import', 'f2', 'f2-import', 'İçe Aktarma Simülasyonu', 'Kurulum', ['operations'], 'P2', M.planned, 'academics.import', 'simulation'),
    route('f2-portal', '/demo/f2/portal', 'f2', 'f2-portal', 'Öğrenci ve Veli Portalı', 'Portal', ['guardian', 'student'], 'P1', M.planned, 'academics.portal', 'portal', { allowedQuery: { role: ['student', 'guardian'] } }),
    route('f3-command', '/demo/f3/command', 'f3', 'f3-command', 'Yönetim Komuta Merkezi', 'Yönetim Vizyonu', ['manager'], 'P0', M.vision, 'vision.command', 'vision', { allowedQuery: { tab: ['overview', 'report'] } }),
    route('f3-risk', '/demo/f3/risk', 'f3', 'f3-risk', 'Destek Sinyalleri', 'Yönetim Vizyonu', ['manager', 'guidance'], 'P0', M.vision, 'vision.signals', 'vision'),
    route('f3-scenarios', '/demo/f3/scenarios', 'f3', 'f3-scenarios', 'Senaryo Laboratuvarı', 'Yönetim Vizyonu', ['manager', 'operations'], 'P0', M.vision, 'vision.scenarios', 'vision', { allowedQuery: { tab: ['what-if', 'optimizer'] } }),
    route('f3-network', '/demo/f3/network', 'f3', 'f3-network', 'Kurum Ağı ve Kapasite', 'Yönetim Vizyonu', ['manager'], 'P1', M.vision, 'vision.network', 'vision'),
    route('f3-integrations', '/demo/f3/integrations', 'f3', 'f3-integrations', 'Entegrasyon Merkezi', 'Yönetim Vizyonu', ['manager'], 'P2', M.vision, 'integrations', 'integration'),
  ];

  const aliases = {
    '/demo': '/demo/overview',
    '/demo/today': '/demo/f1/operations',
    '/demo/schedule': '/demo/f1/schedule',
    '/demo/notifications': '/demo/f1/notifications',
  };

  const legacyAliases = [
    { pattern: '/demo/today', canonical: '/demo/f1/operations' },
    { pattern: '/demo/schedule', canonical: '/demo/f1/schedule' },
    { pattern: '/demo/leave/:leaveId', canonical: '/demo/f1/leaves/:leaveId' },
    { pattern: '/demo/attendance/session/:sessionId', canonical: '/demo/f1/attendance/:sessionId' },
    { pattern: '/demo/notifications', canonical: '/demo/f1/notifications' },
  ];

  function patternToRegex(pattern) {
    const source = pattern.split('/').map((part) => (part.startsWith(':') ? '([^/]+)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/');
    return new RegExp(`^${source}/?$`);
  }

  function normalizeLegacyPath(pathname) {
    if (/^\/demo\/leave\/[^/]+\/?$/.test(pathname)) {
      const canonical = pathname.replace('/demo/leave/', '/demo/f1/leaves/');
      return canonical.replace(/\/LV-204\/?$/, '/D-LV-204');
    }
    if (/^\/demo\/attendance\/session\/[^/]+\/?$/.test(pathname)) {
      const canonical = pathname.replace('/demo/attendance/session/', '/demo/f1/attendance/');
      return canonical.replace(/\/AT-1204\/?$/, '/D-AT-1204');
    }
    return aliases[pathname] || pathname;
  }

  function matchRoute(pathname) {
    const normalizedPath = normalizeLegacyPath(pathname);
    const matched = routes.find((item) => patternToRegex(item.path).test(normalizedPath));
    return matched ? { route: matched, pathname: normalizedPath } : { route: routes[0], pathname: normalizedPath, notFound: true };
  }

  function sanitizeQuery(routeDefinition, search) {
    const input = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
    const output = new URLSearchParams();
    for (const [key, value] of input.entries()) {
      const allowedValues = routeDefinition.allowedQuery[key];
      if (allowedValues && allowedValues.includes(value)) output.set(key, value);
    }

    const scenario = output.get('scenario');
    const step = output.get('step');
    const requiredQuery = scenario && step ? routeDefinition.presentationSteps[scenario]?.[step] : null;
    if (!requiredQuery) {
      output.delete('scenario');
      output.delete('step');
      return output;
    }

    const controlledKeys = new Set(Object.values(routeDefinition.presentationSteps)
      .flatMap((steps) => Object.values(steps))
      .flatMap((values) => Object.keys(values)));
    controlledKeys.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(requiredQuery, key)) output.delete(key);
    });
    for (const [key, value] of Object.entries(requiredQuery)) output.set(key, value);
    return output;
  }

  return { routes, aliases, legacyAliases, maturity: M, matchRoute, normalizeLegacyPath, patternToRegex, sanitizeQuery };
});
