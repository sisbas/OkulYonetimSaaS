import {
  runtime,
  TEACHER_PERMISSION_KEYS,
  OPS_PERMISSION_KEYS,
  TENANT_ADMIN_PERMISSION_KEYS,
  VIEWER_PERMISSION_KEYS,
} from './runtime-harness';
import { readFileSync } from 'fs';
import { join } from 'path';

// #445 — capability-driven navigation. Navigasyon artık sunucu /context'ten
// gelen makine-okur izin anahtarlarından (catalog.permissions) türetilir;
// client kendi akıl yürütmez. Persona kotları runtime-harness'ta tek
// kaynaklıdır (sunucu seeds gerçekliği); rol etiketi yalnız ekran metnidir.

const PROBE = 'state, applyCatalog, login, updateContext, apiRequest, retryCatalog, navSectionsFor, renderNavigation';
const PROBE_TAB = `${PROBE}, activateTab`;
const PROBE_FETCH = `fetch ${PROBE}`;

const catalogFor = (permissions: string[]) => ({
  version: 1,
  institution: { name: 'Atatürk Anadolu Lisesi' },
  role: { label: 'Yetki Etiketi' },
  branches: [{ name: 'Merkez', code: 'ANKARA' }],
  activeBranch: { name: 'Merkez', code: 'ANKARA' },
  permissions,
});

const visibleTabs = (ui: { elements: Map<string, any> }) =>
  [...ui.elements.entries()]
    .filter(([key]) => key.startsWith('.tab[data-tab='))
    .map(([, el]) => el)
    .filter((t) => !t.classList.contains('hidden'))
    .map((t) => t.dataset.tab);

describe('runtime capability-driven navigation (#445)', () => {
  it('applyCatalog stores the server-provided permission keys, deduped in order', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor(['user:read', 'leave:own:read', 'user:read']));
    expect(ui.probe.state.permissions).toEqual(['user:read', 'leave:own:read']);
  });

  it('navSectionsFor returns capability-derived entry sets per persona', () => {
    const ui = runtime(PROBE);
    // Öğretmen: teacher + attendance; program/ops/notifications anahtarı yok
    const teacher = ui.probe.navSectionsFor(TEACHER_PERMISSION_KEYS);
    expect(teacher).toEqual(expect.arrayContaining(['bugun', 'teacher', 'attendance']));
    expect(teacher).not.toContain('program');
    expect(teacher).not.toContain('ops');
    expect(teacher).not.toContain('notifications');
    // Ops, teacher anahtarlarını da içerdiğinden teacher sekmesi de görünür
    expect(ui.probe.navSectionsFor(OPS_PERMISSION_KEYS)).toEqual(
      expect.arrayContaining(['bugun', 'teacher', 'ops', 'program', 'attendance', 'notifications']),
    );
    // Yalnız-okur ve boş aktör: yalnız bugün
    expect(ui.probe.navSectionsFor(VIEWER_PERMISSION_KEYS)).toEqual(['bugun']);
    expect(ui.probe.navSectionsFor([])).toEqual(['bugun']);
  });

  it('renders only capability-authorized tabs for teacher persona', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor(TEACHER_PERMISSION_KEYS));
    const tabs = visibleTabs(ui);
    expect(tabs).toContain('bugun');
    expect(tabs).toContain('teacher');
    expect(tabs).toContain('attendance');
    expect(tabs).not.toContain('program');
    expect(tabs).not.toContain('ops');
    expect(tabs).not.toContain('notifications');
  });

  it('renders every tab for operations persona (teacher included as superset member)', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor(OPS_PERMISSION_KEYS));
    const tabs = visibleTabs(ui);
    expect(tabs).toEqual(expect.arrayContaining(['bugun', 'teacher', 'ops', 'program', 'attendance', 'notifications']));
  });

  it('renders only bugün for read-only viewer persona (published program hidden entirely)', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor(VIEWER_PERMISSION_KEYS));
    const tabs = visibleTabs(ui);
    expect(tabs).toEqual(['bugun']);
  });

  it('renders every tab for tenant administrator persona (ops superset + user/tenant management)', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor(TENANT_ADMIN_PERMISSION_KEYS));
    const tabs = visibleTabs(ui);
    expect(tabs).toEqual(expect.arrayContaining(['bugun', 'teacher', 'ops', 'program', 'attendance', 'notifications']));
  });

  it('apiRequest refuses an unauthorized request before fetch is called', async () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor(TEACHER_PERMISSION_KEYS));
    await expect(
      ui.probe.apiRequest('/schedules/77/draft', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({ status: 403, uiState: 'forbidden_non_enumerating' });
    expect(ui.fetch).not.toHaveBeenCalled();
  });

  it('apiRequest allows an authorized request through to the network', async () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor(TEACHER_PERMISSION_KEYS));
    ui.probe.state.accessToken = 'tok';
    ui.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{}', headers: { get: () => null } });
    await ui.probe.apiRequest('/leaves/me', { method: 'POST', body: {} });
    expect(ui.fetch).toHaveBeenCalledWith(expect.stringContaining('/leaves/me'), expect.anything());
  });

  it('renderNavigation falls back to bugün when the active tab loses its capability', () => {
    const ui = runtime(PROBE_TAB);
    ui.probe.applyCatalog(catalogFor(TEACHER_PERMISSION_KEYS));
    ui.probe.activateTab('teacher');
    expect(ui.element('.tab[data-tab="teacher"]').getAttribute('aria-selected')).toBe('true');
    // Bağlam tazelendiğinde teacher anahtarı düştü: render → bugün'e dönüş
    ui.probe.applyCatalog(catalogFor(['user:read']));
    expect(ui.element('.tab[data-tab="teacher"]').getAttribute('aria-selected')).toBe('false');
    expect(ui.element('.tab[data-tab="bugun"]').getAttribute('aria-selected')).toBe('true');
    expect(ui.element('#teacher-panel').classList.contains('hidden')).toBe(true);
  });

  it('unauthorized tab click shows Turkish forbidden state with safe exit', () => {
    const ui = runtime(PROBE_TAB);
    ui.probe.applyCatalog(catalogFor(TEACHER_PERMISSION_KEYS));
    ui.probe.activateTab('ops');
    expect(ui.element('#message-region').innerHTML).toContain('yetkiniz yok');
    expect(ui.element('.tab[data-tab="bugun"]').getAttribute('aria-selected')).toBe('true');
    expect(ui.element('#ops-panel').classList.contains('hidden')).toBe(true);
  });

  it('viewer deep-linking to program also refuses with safe exit', () => {
    const ui = runtime(PROBE_TAB);
    ui.probe.applyCatalog(catalogFor(VIEWER_PERMISSION_KEYS));
    ui.probe.activateTab('program');
    expect(ui.element('#message-region').innerHTML).toContain('yetkiniz yok');
    expect(ui.element('.tab[data-tab="bugun"]').getAttribute('aria-selected')).toBe('true');
  });

  it('an empty permission catalog fails closed when a hidden tab is activated directly', () => {
    const ui = runtime(PROBE_TAB);
    ui.probe.applyCatalog(catalogFor([]));
    ui.probe.activateTab('ops');

    expect(ui.element('#message-region').innerHTML).toContain('yetkiniz yok');
    expect(ui.element('.tab[data-tab="bugun"]').getAttribute('aria-selected')).toBe('true');
    expect(ui.element('#ops-panel').classList.contains('hidden')).toBe(true);
  });

  it('bugün is the default landing tab after catalog load', () => {
    const ui = runtime(PROBE_TAB);
    ui.probe.applyCatalog(catalogFor(OPS_PERMISSION_KEYS));
    expect(ui.element('#bugun-panel').classList.contains('hidden')).toBe(false);
    expect(ui.element('.tab[data-tab="bugun"]').getAttribute('aria-selected')).toBe('true');
  });

  it('no navigation label or aria text exposes backend jargon', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor(OPS_PERMISSION_KEYS));
    const rendered = ui.renderedStrings();
    expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(rendered).not.toMatch(/etag/i);
    expect(rendered).not.toMatch(/\btenant\b/i);
    expect(rendered).not.toMatch(/\bbranch\b/i);
    expect(rendered).not.toMatch(/\bqueue\b/i);
    expect(rendered).not.toMatch(/coverage/i);
    // İzin kodları makine-okur veridir; düz metne sızmaz
    expect(rendered).not.toMatch(/user:read|leave:create|schedule:draft:/i);
  });

  it('static HTML labels and aria text expose no backend jargon', () => {
    const html = readFileSync(join(__dirname, '../../frontend/runtime/index.html'), 'utf8');
    const ariaLabels = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    const strongTexts = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
    const smallTexts = [...html.matchAll(/<small>([^<]+)<\/small>/g)].map((m) => m[1]);
    const allVisible = [...ariaLabels, ...strongTexts, ...smallTexts].join(' ');
    expect(allVisible).not.toMatch(/\bqueue\b/i);
    expect(allVisible).not.toMatch(/kuyruk/i);
    expect(allVisible).not.toMatch(/coverage/i);
    expect(allVisible).not.toMatch(/etag/i);
    expect(allVisible).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('deep-linking to a forbidden section shows operational Turkish message, not raw denial', () => {
    const ui = runtime(PROBE_TAB);
    ui.probe.applyCatalog(catalogFor(VIEWER_PERMISSION_KEYS));
    ui.probe.activateTab('notifications');
    const message = ui.element('#message-region').innerHTML;
    expect(message).toContain('yetkiniz yok');
    expect(message).not.toMatch(/forbidden/i);
    expect(message).not.toMatch(/403/i);
    expect(message).not.toMatch(/access denied/i);
  });
});
