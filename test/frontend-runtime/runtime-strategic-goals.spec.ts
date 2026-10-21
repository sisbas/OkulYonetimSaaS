/**
 * #459 — Stratejik hedefler ekranı, varsayılan kapalı.
 *
 * Sentetik store (frontend/ux/store.js) ve rol-aware shell (frontend/app/ui.js)
 * üzerinde kabul kriterlerini doğrular: ekran kapalı başlar, Ayarlar'dan
 * yönetici açar, hedefler yıla bağlıdır ve gerçekleşme hedefin oranında
 * okunur; öğretmen yalnız okur; aynı metrik ve yılda ikinci hedef arayüzde
 * gerekçesiyle reddedilir.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

const storeSource = () =>
  fs.readFileSync(path.join(process.cwd(), 'frontend/ux/store.js'), 'utf8');
const uiSource = () =>
  fs.readFileSync(path.join(process.cwd(), 'frontend/app/ui.js'), 'utf8');

function buildStore(): any {
  const context: any = vm.createContext({});
  vm.runInContext(storeSource().replace(/^export /m, '') + '\nthis.createDemoStore = createDemoStore;', context);
  return context.createDemoStore();
}

describe('#459 strategic goals screen, off by default', () => {
  let store: any;

  beforeEach(() => {
    store = buildStore();
  });

  it('AC1 · starts switched off, and the shell shows the screen only after enabling', () => {
    expect(store.strategicGoalsEnabled).toBe(false);

    const ui = uiSource();
    // Rota ve gezinme kapalıysa gizlidir; Ayarlar'dan açma seçeneği vardır.
    expect(ui).toContain('strategic-goals');
    expect(ui).toMatch(/goalsVisible\s*=[^;]*strategicGoalsEnabled/);
    expect(ui).toMatch(/r !== "strategic-goals" \|\| goalsVisible/);
    expect(ui).toContain('goals-enabled');
    // Yaşayan sözleşme: kapalı durumun görünümü rota işleyicisinde durur.
    expect(ui).toMatch(/if \(!store\.strategicGoalsEnabled\) return goalsOff\(\)/);
  });

  it('AC1 · is enabled from settings by the school administrator only', () => {
    for (const role of ['TEACHER', 'OPS_STAFF', 'VIEWER', 'ACADEMIC_STAFF']) {
      store.role = role;
      expect(() => store.enableStrategicGoals()).toThrow(/yalnız kurum yöneticisi/);
    }
    store.role = 'TENANT_ADMIN';
    store.enableStrategicGoals();
    expect(store.strategicGoalsEnabled).toBe(true);
    store.enableStrategicGoals(false);
    expect(store.strategicGoalsEnabled).toBe(false);
    // Ayarlar alanı kabukta yöneticiye açılır.
    const ui = uiSource();
    expect(ui).toContain('Ayarlar · Stratejik hedefler');
  });

  it('AC3 · administrator adds a year-scoped, school-defined metric target with a manual value', () => {
    store.role = 'TENANT_ADMIN';
    store.enableStrategicGoals();
    const before = store.strategicGoals.length;
    const goal = store.createGoal({
      academicYear: '2026-2027',
      metricKey: 'ham_net',
      metricLabel: 'Ham net toplamı',
      targetValue: 180,
    });
    expect(goal.academicYear).toBe('2026-2027');
    expect(goal.metricKey).toBe('ham_net');
    expect(goal.metricLabel).toBe('Ham net toplamı');
    expect(goal.targetValue).toBe(180);
    expect(goal.progressValue).toBeNull();
    expect(store.strategicGoals.length).toBe(before + 1);
  });

  it('AC5 · a duplicate metric and year is refused in the interface with the reason shown', () => {
    store.role = 'TENANT_ADMIN';
    store.enableStrategicGoals();
    store.createGoal({
      academicYear: '2026-2027',
      metricKey: 'ham_net',
      targetValue: 180,
    });
    let thrown = '';
    try {
      store.createGoal({
        academicYear: '2026-2027',
        metricKey: 'ham_net',
        metricLabel: 'Yinelenen metrik',
        targetValue: 10,
      });
    } catch (error) {
      thrown = (error as Error).message;
    }
    // Gerekçe ölçüyü ve yılı okunabilir biçimde adlandırır.
    expect(thrown).toContain('ham_net');
    expect(thrown).toContain('2026-2027');
    expect(thrown).toMatch(/zaten bir hedef/);
    // Arayüz: hedef formunun hatası role=alert alanına yazılır.
    const ui = uiSource();
    expect(ui).toMatch(/id="goal-error" role="alert"/);
    // Aynı metrik farklı yılda, aynı yıl farklı metrikte reddedilmez.
    expect(() =>
      store.createGoal({ academicYear: '2027-2028', metricKey: 'ham_net', targetValue: 100 }),
    ).not.toThrow();
    expect(() =>
      store.createGoal({ academicYear: '2026-2027', metricKey: 'gelisim_yuzdesi', targetValue: 75 }),
    ).not.toThrow();
  });

  it('AC2 · goals read as year-scoped with progress shown as a proportion of target', () => {
    store.role = 'TENANT_ADMIN';
    store.enableStrategicGoals();
    const goal = store.strategicGoals[0];
    // Hedef ve gerçekleşme elle girilir.
    store.updateGoalProgress(goal.id, 22);
    expect(goal.progressValue).toBe(22);
    // Kabuk: ilerleme hedefin oranında sunulur (yüzde + ham değer) ve
    // liste akademik yıla göre kapsanır.
    const ui = uiSource();
    expect(ui).toContain('progressValue');
    expect(ui).toMatch(/Math\.round\(\(Number\(p\) \/ target\) \* 100\)/);
    expect(ui).toContain('İlerleme');
    expect(ui).toContain('goalsYear');
  });

  it('AC4 · a teacher reads the school goals and cannot change them', () => {
    store.role = 'TENANT_ADMIN';
    store.enableStrategicGoals();
    const count = store.strategicGoals.length;
    store.role = 'TEACHER';
    // Okumak serbesttir.
    expect(store.strategicGoals.length).toBe(count);
    // Yazmak reddedilir.
    expect(() =>
      store.createGoal({
        academicYear: '2026-2027',
        metricKey: 'ozel_net',
        targetValue: 10,
      }),
    ).toThrow(/yalnız kurum yöneticisi/);
    expect(() => store.updateGoalProgress('sg1', 44)).toThrow(/yalnız kurum yöneticisi/);
    const ui = uiSource();
    // Kabukta öğretmen yüzeyi yazma düğmesi içermez, salt okunur notu taşır.
    expect(ui).toContain('salt okunur');
  });
});
