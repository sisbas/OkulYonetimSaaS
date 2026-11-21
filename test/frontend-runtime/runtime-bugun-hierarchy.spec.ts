import * as fs from 'node:fs';
import * as path from 'node:path';

import { response, runtime, ALL_PERMISSION_KEYS } from './runtime-harness';

/**
 * #458 — Bugün kalıcı olarak operasyon-önce. Sıra statik HTML'de pinlenir;
 * ilk kullanım/feature-flag ile değişen bir yerleşim yoktur. Takvim (gün akışı)
 * ikincildir; her alan kendi boş durumunu taşır ve veri yokken sıfır paneli
 * gösterilmez.
 */

const PROBE =
  'state, applyCatalog, loadTodayDashboard, renderNavigation, renderStrategicGoals, apiRequest, logout';

const root = process.cwd();
const runtimeDir = path.join(root, 'frontend/runtime');
const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
const bugun = fs.readFileSync(path.join(runtimeDir, 'screens/bugun.js'), 'utf8');
const goals = fs.readFileSync(path.join(runtimeDir, 'screens/strategic-goals.js'), 'utf8');

const order = (input: string, needles: string[]) => needles.map((needle) => {
  const index = input.indexOf(needle);
  if (index < 0) throw new Error(`missing marker: ${needle}`);
  return { needle, index };
});

describe('#458 Bugün operasyon-önce kalıcı hiyerarşi', () => {
  it('kuyruklar takvimden, takvim hedeflerden, hedefler rol kesitlerinden önce gelir', () => {
    const panelStart = html.indexOf('<section id="bugun-panel"');
    const panelEnd = html.indexOf('<section id="teacher-panel"');
    expect(panelStart).toBeGreaterThan(-1);
    expect(panelEnd).toBeGreaterThan(panelStart);
    const panel = html.slice(panelStart, panelEnd);

    const positions = order(panel, [
      'id="bugun-stats"',
      'id="bugun-queue-output"',
      'id="bugun-sessions-output"',
      'class="day-split"',
      'id="strategic-goals-section"',
      'id="bugun-roles-output"',
    ]);
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i - 1].index).toBeLessThan(positions[i].index);
    }
    // Takvim ikincil olarak etiketli; ilk açılışa özel bir kapı yok.
    expect(panel).toContain('İkincil · takvim');
    expect(panel).not.toMatch(/first[- ]?run|onboarding|data-first/);
  });

  it('hedefler ana ekran modülü olarak kaydolur ve boş ölçüm kopyası tek yoldan gelir', () => {
    expect(goals).toContain("registerTabActivationHook('bugun'");
    expect(goals).not.toContain("registerTabActivationHook('yonetim'");
    expect(app).toContain('bugunStats:');
    expect(app).toContain('tabActivationHooks.bugun');
    expect(bugun).toContain('renderBugunStatsSurface(metricResults)');
  });

  it('ölçüm yokken sıfır paneli yerine alanın kendi boş durumu görünür', async () => {
    const ui = runtime(PROBE, ALL_PERMISSION_KEYS);
    ui.probe.state.accessToken = 'token';
    ui.probe.state.branchId = 'ANKARA';
    ui.fetch
      .mockResolvedValueOnce(response({ lessons: [] }))
      .mockResolvedValueOnce(response({ leaves: [] }))
      .mockResolvedValueOnce(response({ sessions: [] }));

    await ui.probe.loadTodayDashboard();

    const stats = ui.element('#bugun-stats');
    expect(stats.classList.contains('hidden')).toBe(true);
    expect(ui.element('#bugun-stats-empty').dataset.state).toBe('same_scope_empty');
    expect(ui.element('#bugun-stats-empty').innerHTML).toContain('Bugün için ölçüm yok');
    expect(ui.element('#bugun-open-work-value').textContent).toBe('');
    expect(ui.element('#bugun-awaiting-leave-value').textContent).toBe('');
    expect(ui.element('#bugun-sessions-open-value').textContent).toBe('');
    expect(ui.element('#bugun-queue-output').dataset.state).toBe('same_scope_empty');
    expect(ui.element('#bugun-sessions-output').dataset.state).toBe('same_scope_empty');
  });

  it('veri gelince ölçüm kartları döner ve hedefler ilk katalogta yüklenir', async () => {
    const ui = runtime(PROBE, ALL_PERMISSION_KEYS);
    ui.probe.state.accessToken = 'token';
    ui.probe.state.branchId = 'ANKARA';
    ui.fetch.mockResolvedValue(response({ goals: [] }));

    await ui.probe.applyCatalog({
      version: 1,
      institution: { name: 'Okul' },
      role: { label: 'rol' },
      branches: [{ name: 'Merkez', code: 'ANKARA' }],
      activeBranch: { name: 'Merkez', code: 'ANKARA' },
      permissions: ALL_PERMISSION_KEYS,
      capabilities: ['strategic_goals'],
    });

    expect(ui.fetch.mock.calls.some((call) => String(call[0]).includes('/strategic-goals?'))).toBe(true);
    expect(ui.element('#strategic-goals-table').innerHTML.length).toBeGreaterThan(0);
  });

  it('çıkışta hedefler temizlenir ve yetenek kalsa bile izinsiz görünmez', async () => {
    const ui = runtime(PROBE, ['strategic_goal:read']);
    ui.probe.state.accessToken = 'token';
    ui.probe.state.branchId = 'ANKARA';
    ui.fetch.mockResolvedValue(response({
      strategicGoals: [{ id: 'g1', academicYear: '2026-2027', metricKey: 'devam', metricLabel: 'Devam', targetValue: 90, progressValue: 80 }],
    }));
    ui.probe.applyCatalog({
      version: 1,
      institution: { name: 'Okul' },
      role: { label: 'rol' },
      branches: [{ name: 'Merkez', code: 'ANKARA' }],
      activeBranch: { name: 'Merkez', code: 'ANKARA' },
      permissions: ['strategic_goal:read'],
      capabilities: ['strategic_goals'],
    });
    await ui.probe.renderStrategicGoals();
    expect(ui.element('#strategic-goals-section').classList.contains('hidden')).toBe(false);
    expect(ui.element('#strategic-goals-table').innerHTML).toContain('Devam');

    ui.probe.logout();
    ui.probe.renderNavigation();

    expect(ui.element('#strategic-goals-table').innerHTML).toBe('');
    expect(ui.element('#strategic-goals-controls').innerHTML).toBe('');
    expect(ui.element('#strategic-goals-section').classList.contains('hidden')).toBe(true);
    expect(ui.probe.state.capabilities).toContain('strategic_goals');
  });
});
