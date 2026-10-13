import { runtime, response } from './runtime-harness';
import { readFileSync } from 'fs';
import { join } from 'path';

const PROBE = 'state, applyCatalog, login, updateContext, apiRequest, retryCatalog, navSectionsFor, renderNavigation';
const PROBE_TAB = `${PROBE}, activateTab`;

const catalogFor = (roleLabel: string | null) => ({
  version: 1,
  institution: { name: 'Atatürk Anadolu Lisesi' },
  role: roleLabel ? { label: roleLabel } : null,
  branches: [{ name: 'Merkez', code: 'ANKARA' }],
  activeBranch: { name: 'Merkez', code: 'ANKARA' },
});

const visibleTabs = (ui: { elements: Map<string, any> }) =>
  [...ui.elements.entries()]
    .filter(([key]) => key.startsWith('.tab[data-tab='))
    .map(([, el]) => el)
    .filter((t) => !t.classList.contains('hidden'))
    .map((t) => t.dataset.tab);

describe('runtime role-aware navigation (#398)', () => {
  it('stores the catalog role label in state for navigation derivation', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor('Operasyon Yöneticisi'));
    expect(ui.probe.state.authLabel).toBe('Operasyon Yöneticisi');
  });

  it('navSectionsFor returns distinct entry sets per role label', () => {
    const ui = runtime(PROBE);
    const teacher = ui.probe.navSectionsFor('Öğretmen');
    const ops = ui.probe.navSectionsFor('Operasyon Yöneticisi');
    const admin = ui.probe.navSectionsFor('Kurum Yöneticisi');
    // Teacher does not see ops-only sections
    expect(teacher).not.toContain('ops');
    expect(teacher).not.toContain('notifications');
    // Ops does not see teacher leave tab
    expect(ops).not.toContain('teacher');
    // Admin sees everything
    expect(admin).toEqual(expect.arrayContaining(['bugun', 'teacher', 'ops', 'program', 'attendance', 'notifications']));
    // All roles see bugün
    expect(teacher).toContain('bugun');
    expect(ops).toContain('bugun');
    expect(admin).toContain('bugun');
  });

  it('unknown or missing role gets safe default (bugün only)', () => {
    const ui = runtime(PROBE);
    expect(ui.probe.navSectionsFor(null)).toEqual(['bugun']);
    expect(ui.probe.navSectionsFor('Bilinmeyen Rol')).toEqual(['bugun']);
  });

  it('renders only authorized tabs for teacher role', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor('Öğretmen'));
    const tabs = visibleTabs(ui);
    expect(tabs).toContain('bugun');
    expect(tabs).toContain('teacher');
    expect(tabs).toContain('program');
    expect(tabs).toContain('attendance');
    expect(tabs).not.toContain('ops');
    expect(tabs).not.toContain('notifications');
  });

  it('renders only authorized tabs for operations manager role', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor('Operasyon Yöneticisi'));
    const tabs = visibleTabs(ui);
    expect(tabs).toContain('bugun');
    expect(tabs).toContain('ops');
    expect(tabs).toContain('program');
    expect(tabs).toContain('attendance');
    expect(tabs).toContain('notifications');
    expect(tabs).not.toContain('teacher');
  });

  it('renders all tabs for admin role', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor('Kurum Yöneticisi'));
    const tabs = visibleTabs(ui);
    expect(tabs).toEqual(expect.arrayContaining(['bugun', 'teacher', 'ops', 'program', 'attendance', 'notifications']));
  });

  it('unauthorized tab click shows Turkish forbidden state with safe exit', () => {
    const ui = runtime(PROBE_TAB);
    ui.probe.applyCatalog(catalogFor('Öğretmen'));
    // Teacher tries to deep-link to ops (unauthorized)
    ui.probe.activateTab('ops');
    // The forbidden state should appear in the message region
    expect(ui.element('#message-region').innerHTML).toContain('yetkiniz yok');
    // Fallback to bugun tab
    expect(ui.element('.tab[data-tab="bugun"]').getAttribute('aria-selected')).toBe('true');
    // Ops panel should not be shown
    expect(ui.element('#ops-panel').classList.contains('hidden')).toBe(true);
  });

  it('bugün is the default landing tab after catalog load', () => {
    const ui = runtime(PROBE_TAB);
    ui.probe.applyCatalog(catalogFor('Operasyon Yöneticisi'));
    // bugun panel should be visible by default
    expect(ui.element('#bugun-panel').classList.contains('hidden')).toBe(false);
    expect(ui.element('.tab[data-tab="bugun"]').getAttribute('aria-selected')).toBe('true');
  });

  it('no navigation label or aria text exposes backend jargon', () => {
    const ui = runtime(PROBE);
    ui.probe.applyCatalog(catalogFor('Kurum Yöneticisi'));
    const rendered = ui.renderedStrings();
    expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(rendered).not.toMatch(/etag/i);
    expect(rendered).not.toMatch(/\btenant\b/i);
    expect(rendered).not.toMatch(/\bbranch\b/i);
    expect(rendered).not.toMatch(/\bqueue\b/i);
    expect(rendered).not.toMatch(/coverage/i);
  });

  it('static HTML labels and aria text expose no backend jargon', () => {
    const html = readFileSync(join(__dirname, '../../frontend/runtime/index.html'), 'utf8');
    // Extract visible text and aria-label values (not IDs or attributes)
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
    ui.probe.applyCatalog(catalogFor('Öğretmen'));
    ui.probe.activateTab('notifications');
    const message = ui.element('#message-region').innerHTML;
    expect(message).toContain('yetkiniz yok');
    expect(message).not.toMatch(/forbidden/i);
    expect(message).not.toMatch(/403/i);
    expect(message).not.toMatch(/access denied/i);
  });
});
