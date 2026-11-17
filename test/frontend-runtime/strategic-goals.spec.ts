import * as fs from 'node:fs';
import * as path from 'node:path';
import { runtime, response } from './runtime-harness';

/**
 * #483 — Stratejik hedefler runtime ekranı (mock-up → runtime).
 *
 * Dışsal sözleşme pinlenir:
 * - Akademik yıl istemcide tarihten türetilir (Eylül başlangıç, bu dönem ± 1) ve
 *   seçim sunucuya gider.
 * - Yönetici hedef ekler/gerçekleşme girer/siler; öğretmen salt-okunur görür ve
 *   yazma kontrolü DOM'unda bulunmaz.
 * - Tekillik (kirum + yıl + metrik) sunucudadır: 409 okunabilir nedenle
 *   karşılanır, ham kod arayüze sızmaz.
 * - Deploy yeteneği `strategic_goals` kapalıyken yüzey hiç açılmaz ve istek
 *   gönderilmez (sunucu rota vermez).
 * - Makine-okur metrik anahtarı yalnız tanılama özniteliğinde kalır.
 */

const PROBE = [
  'state',
  'applyCatalog',
  'apiRequest',
  'renderStrategicGoals',
  'loadStrategicGoals',
  'renderStrategicGoalsControls',
  'submitStrategicGoal',
  'submitStrategicGoalProgress',
  'deleteStrategicGoal',
  'openStrategicGoalProgress',
  'openStrategicGoalDelete',
  'strategicGoalsPeriod',
  'strategicGoalsRatio',
].join(', ');

const ADMIN_PERMISSIONS = ['daily_operations:update', 'strategic_goal:read', 'strategic_goal:manage'];
const TEACHER_PERMISSIONS = ['strategic_goal:read'];
const VIEWER_PERMISSIONS = ['user:read'];

const GOALS = [
  {
    id: 'goal-1',
    academicYear: '2026-2027',
    metricKey: 'devam_orani',
    metricLabel: 'Devam oranı',
    targetValue: 95,
    progressValue: 91,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-22T08:00:00.000Z',
  },
  {
    id: 'goal-2',
    academicYear: '2026-2027',
    metricKey: 'odev_teslim_orani',
    metricLabel: 'Ödev teslim oranı',
    targetValue: 100,
    progressValue: 105,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
  },
];

function catalogFor(permissions: string[], capabilities: string[] = ['strategic_goals']) {
  return {
    version: 1,
    institution: { name: 'Atatürk Anadolu Lisesi' },
    role: { label: 'Yetki Etiketi' },
    branches: [{ name: 'Merkez', code: 'ANKARA' }],
    activeBranch: { name: 'Merkez', code: 'ANKARA' },
    permissions,
    capabilities,
  };
}

function signedIn(permissions: string[], capabilities: string[] = ['strategic_goals']) {
  const ui = runtime(PROBE, permissions);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'ANKARA';
  ui.probe.applyCatalog(catalogFor(permissions, capabilities));
  return ui;
}

/** Görünür metni tanılama özniteliklerinden arındırır (kopya hijyeni). */
function visibleText(html: string): string {
  return String(html || '').replace(/data-[a-z-]+="[^"]*"/g, '');
}

describe('#483 Stratejik hedefler seti (mock-up → runtime)', () => {
  const root = process.cwd();
  const runtimeDir = path.join(root, 'frontend', 'runtime');
  const screensDir = path.join(runtimeDir, 'screens');
  const designDir = path.join(root, 'frontend', 'design');

  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
  const module = fs.readFileSync(path.join(screensDir, 'strategic-goals.js'), 'utf8');
  const mockup = fs.readFileSync(path.join(designDir, 'strategic-goals.html'), 'utf8');

  describe('mock-up → runtime port sözleşmesi', () => {
    it('runtime bölgesi mock-up ile aynı başlık ve sütun dili taşır', () => {
      expect(html).toContain('id="strategic-goals-section"');
      expect(html).toContain('Stratejik hedefler ve gerçekleşme');
      expect(html).toContain('id="strategic-goals-year"');
      expect(html).toContain('id="strategic-goals-controls"');
      expect(html).toContain('id="strategic-goals-table"');
      expect(module).toContain('<th scope="col">Metrik</th>');
      expect(module).toContain('<th scope="col">Hedef</th>');
      expect(module).toContain('<th scope="col">Gerçekleşme</th>');
      expect(module).toContain('<th scope="col">Oran</th>');
      expect(module).toContain('<th scope="col">Güncellendi</th>');
    });

    it('mock-up tasarım referansı bozulmadan taşınır', () => {
      expect(mockup).toContain('Stratejik hedefler ve gerçekleşme');
      expect(mockup).toContain('STRATEGIC_GOALS_ENABLED=false');
      // Bozuk kodlama kalıntısı (ilk mock-up sürümü) tekrarlamaz.
      expect(mockup).not.toMatch(/içcin|rotaıl|düfşer|görünç|tanımlıl|ödnem/);
    });

    it('modül Yönetim sekmesine yazma kontrolleriyle birlikte kaydolur', () => {
      expect(module).toContain("registerTabActivationHook('yonetim'");
      expect(app).toContain('STRATEGIC_GOALS_DEPLOY_CAPABILITY'.replace('STRATEGIC_GOALS_DEPLOY_CAPABILITY', 'strategic_goals'));
      expect(app).toContain("'strategic_goal:read'");
      expect(app).toContain("'strategic_goal:manage'");
    });
  });

  describe('görünürlük ve izin kapısı', () => {
    it('yönetici sekmeyi ve yazma kontrollerini görür', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      expect(ui.element('#strategic-goals-section').classList.contains('hidden')).toBe(false);
      const controls = ui.element('#strategic-goals-controls');
      expect(controls.innerHTML).toContain('id="strategic-goals-add"');
      expect(controls.innerHTML).toContain('id="strategic-goal-create"');
      expect(controls.innerHTML).toContain('id="strategic-goal-progress"');
      expect(controls.innerHTML).toContain('id="strategic-goal-delete"');
    });

    it('öğretmen salt-okunur görür: yazma kontrolü DOM\'da bulunmaz', async () => {
      const ui = signedIn(TEACHER_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      expect(ui.element('#strategic-goals-controls').innerHTML).toBe('');
      const table = ui.element('#strategic-goals-table');
      expect(table.innerHTML).toContain('Devam oranı');
      expect(table.innerHTML).not.toContain('Gerçekleşme gir');
      expect(table.innerHTML).not.toContain('data-action="strategic-goal-delete"');
      expect(table.innerHTML).not.toContain('<th scope="col">İşlem</th>');
    });

    it('izin anahtarı olmayan aktör bölgeyi görmez ve istek göndermez', async () => {
      const ui = signedIn(VIEWER_PERMISSIONS);
      await ui.probe.renderStrategicGoals();

      expect(ui.element('#strategic-goals-section').classList.contains('hidden')).toBe(true);
      expect(ui.fetch).not.toHaveBeenCalled();
    });

    it('deploy yeteneği kapalıyken yüzey hiç açılmaz', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS, []);
      await ui.probe.renderStrategicGoals();

      expect(ui.element('#strategic-goals-section').classList.contains('hidden')).toBe(true);
      expect(ui.fetch).not.toHaveBeenCalled();
    });
  });

  describe('liste sözleşmesi', () => {
    it('hedef, gerçekleşme, oran ve güncellenme zamanı gösterilir', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      const table = ui.element('#strategic-goals-table');
      expect(table.innerHTML).toContain('Devam oranı');
      expect(table.innerHTML).toContain('95');
      expect(table.innerHTML).toContain('91');
      expect(table.innerHTML).toContain('%95,8');
      expect(table.innerHTML).toContain('22.10.2026');
    });

    it('oran %100\'ü aşarsa ham değerle yazılır', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      expect(ui.element('#strategic-goals-table').innerHTML).toContain('%105');
    });

    it('makine-okur metrik anahtarı yalnız tanılama özniteliğinde kalır', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      const table = ui.element('#strategic-goals-table');
      expect(table.innerHTML).toContain('data-metric-key="devam_orani"');
      expect(visibleText(table.innerHTML)).not.toContain('devam_orani');
    });

    it('hedef yokken dürüst boş durum taşır', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response([]));
      await ui.probe.renderStrategicGoals();

      const table = ui.element('#strategic-goals-table');
      expect(table.dataset.state).toBe('same_scope_empty');
      expect(table.innerHTML).toContain('Bu akademik yıl için henüz hedef tanımlanmamış.');
    });

    it('yüzey bu kurulumda yoksa sunucu 404 döner ve varlık sızmaz', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValueOnce(response({ message: 'Not Found' }, 404));
      await ui.probe.loadStrategicGoals();

      const table = ui.element('#strategic-goals-table');
      expect(table.innerHTML).toContain('bu kurulumda kullanılamıyor');
      expect(table.innerHTML).not.toMatch(/bulunamadı/i);
    });
  });

  describe('akademik yıl seçimi', () => {
    it('varsayılan dönem istemcide tarihten türetilir', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      const period = ui.probe.strategicGoalsPeriod();
      expect(period).toMatch(/^\d{4}-\d{4}$/);
      expect(ui.element('#strategic-goals-year').innerHTML).toContain('(bu dönem)');
      expect(ui.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`academicYear=${period}`),
        expect.anything(),
      );
    });

    it('başka bir yıl seçimi sunucuya filtre olarak gider', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      ui.element('#strategic-goals-year').value = '2025-2026';
      ui.fetch.mockClear();
      await ui.probe.loadStrategicGoals();

      expect(ui.fetch).toHaveBeenCalledWith(
        expect.stringContaining('academicYear=2025-2026'),
        expect.anything(),
      );
    });
  });

  describe('yazma akışı', () => {
    it('yönetici hedef ekler ve liste yenilenir', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      ui.element('#strategic-goal-key').value = 'devam_orani';
      ui.element('#strategic-goal-label').value = 'Devam oranı';
      ui.element('#strategic-goal-target').value = '95';
      ui.fetch.mockResolvedValueOnce(response(GOALS[0]));
      ui.fetch.mockResolvedValueOnce(response(GOALS));
      await ui.probe.submitStrategicGoal();

      const post = ui.fetch.mock.calls.find((call) => String(call[0]).endsWith('/strategic-goals') && call[1]?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
        metricKey: 'devam_orani',
        metricLabel: 'Devam oranı',
        targetValue: 95,
      });
      expect(ui.element('#strategic-goal-form-status').textContent).toContain('Hedef kaydedildi');
    });

    it('duplicate metrik+yıl okunabilir nedenle karşılanır, ham kod sızmaz', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValueOnce(
        response({ reason: 'duplicate_metric_year', message: 'A target for metric "devam_orani" already exists' }, 409),
      );
      ui.element('#strategic-goal-key').value = 'devam_orani';
      ui.element('#strategic-goal-target').value = '95';
      await ui.probe.submitStrategicGoal();

      const status = ui.element('#strategic-goal-form-status');
      expect(status.textContent).toContain('zaten tanımlı');
      expect(status.textContent).not.toContain('duplicate_metric_year');
      expect(status.textContent).not.toMatch(/already exists/);
    });

    it('gerçekleşme girilir ve hedef silinir', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      ui.fetch.mockResolvedValueOnce(response(GOALS[0]));
      ui.fetch.mockResolvedValueOnce(response(GOALS));
      ui.probe.openStrategicGoalProgress('goal-1');
      ui.element('#strategic-goal-progress-value').value = '93';
      await ui.probe.submitStrategicGoalProgress();

      const patch = ui.fetch.mock.calls.find((call) => String(call[0]).includes('/strategic-goals/goal-1') && call[1]?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ progressValue: 93 });

      ui.fetch.mockResolvedValueOnce(response(null));
      ui.fetch.mockResolvedValueOnce(response(GOALS));
      ui.probe.openStrategicGoalDelete('goal-1');
      await ui.probe.deleteStrategicGoal();

      const remove = ui.fetch.mock.calls.find((call) => String(call[0]).includes('/strategic-goals/goal-1') && call[1]?.method === 'DELETE');
      expect(remove).toBeDefined();
      expect(ui.element('#strategic-goal-form-status').textContent).toContain('Hedef silindi');
    });

    it('yazma yetkisi olmayan aktör yazma isteği göndermez', async () => {
      const ui = signedIn(TEACHER_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      ui.element('#strategic-goal-key').value = 'devam_orani';
      ui.element('#strategic-goal-target').value = '95';
      await ui.probe.submitStrategicGoal();

      const writes = ui.fetch.mock.calls.filter((call) => call[1]?.method && call[1].method !== 'GET');
      expect(writes).toHaveLength(0);
      expect(ui.element('#strategic-goal-form-status').textContent).toContain('yetkiniz yok');
    });

    it('bir akış açılınca diğeri kapanır: hedefler birbirine karışmaz', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      ui.probe.openStrategicGoalDelete('goal-1');
      expect(ui.element('#strategic-goal-delete').classList.contains('hidden')).toBe(false);

      ui.probe.openStrategicGoalProgress('goal-2');
      // Silme onayı kapandı: onaylanacak bir silme hedefi kalmadı.
      expect(ui.element('#strategic-goal-delete').classList.contains('hidden')).toBe(true);

      ui.fetch.mockResolvedValueOnce(response(GOALS[0]));
      ui.fetch.mockResolvedValueOnce(response(GOALS));
      ui.element('#strategic-goal-progress-value').value = '93';
      await ui.probe.submitStrategicGoalProgress();

      const patch = ui.fetch.mock.calls.find((call) => call[1]?.method === 'PATCH');
      expect(String(patch?.[0])).toContain('/strategic-goals/goal-2');
      expect(ui.fetch.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(false);
    });

    it('boş sayısal girdi 0 olarak yazılmaz', async () => {
      const ui = signedIn(ADMIN_PERMISSIONS);
      ui.fetch.mockResolvedValue(response(GOALS));
      await ui.probe.renderStrategicGoals();

      ui.probe.openStrategicGoalProgress('goal-1');
      ui.element('#strategic-goal-progress-value').value = '';
      await ui.probe.submitStrategicGoalProgress();
      expect(ui.fetch.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(false);
      expect(ui.element('#strategic-goal-form-status').textContent).toContain('Gerçekleşme girilmedi');

      ui.element('#strategic-goal-key').value = 'devam_orani';
      ui.element('#strategic-goal-target').value = '';
      await ui.probe.submitStrategicGoal();
      expect(ui.fetch.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
      expect(ui.element('#strategic-goal-form-status').textContent).toContain('Hedef değer girilmedi');
    });
  });
});
