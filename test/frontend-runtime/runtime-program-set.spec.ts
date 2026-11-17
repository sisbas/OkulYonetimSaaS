import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * #490 — Program seti (haftalık program, builder, çakışma çözümü).
 *
 * Dışsal sözleşmeyi pinler: kapsam filtreleri (sınıf/öğretmen/derslik), ders
 * kartı görünümü, çakışma çözüm yüzeyi ve "otomatik çözücü devre dışı"
 * dürüstlüğü. Ham referans kimlikleri (UUID) yalnız data-* tanılama kanalında
 * kalır (K-35); görünür kart metni gün/saat gibi gerçek kullanıcı verisidir.
 */
describe('#490 Program seti', () => {
  const root = process.cwd();
  const runtimeDir = path.join(root, 'frontend', 'runtime');
  const screensDir = path.join(runtimeDir, 'screens');
  const designDir = path.join(root, 'frontend', 'design');

  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
  const schedule = fs.readFileSync(path.join(screensDir, 'schedule.js'), 'utf8');

  describe('kapsam filtreleri (sınıf / öğretmen / derslik)', () => {
    it('ships the three scope filters on the program panel', () => {
      expect(html).toContain('id="program-filter-form"');
      expect(html).toContain('aria-label="Program kapsam filtreleri"');
      expect(html).toContain('id="branch-filter"');
      expect(html).toContain('id="teacher-filter"');
      expect(html).toContain('id="room-filter"');
      for (const label of ['Tüm sınıflar', 'Tüm öğretmenler', 'Tüm derslikler']) {
        expect(html).toContain(label);
      }
    });

    it('derives filter options from the loaded events, not synthetic fixtures', () => {
      expect(schedule).toContain('function populateProgramFilters()');
      expect(schedule).toContain('function distinctValues(events, field)');
      expect(schedule).toContain("distinctValues(events, 'studentGroupId')");
      expect(schedule).toContain("distinctValues(events, 'teacherId')");
      expect(schedule).toContain("distinctValues(events, 'roomId')");
    });

    it('filters the card view and keeps the filtered emptiness on the shared empty path', () => {
      const cards = schedule.slice(
        schedule.indexOf('function renderLessonCards()'),
        schedule.indexOf('function renderConflictResolution('),
      );
      expect(cards).toContain("empty(target, 'schedule')");
    });
  });

  describe('ders kartları (#lesson-cards)', () => {
    it('renders a live card region', () => {
      expect(html).toContain('id="lesson-cards"');
      expect(html).toContain('aria-label="Ders kartları"');
      expect(schedule).toContain('function renderLessonCards()');
      expect(schedule).toContain('data-lesson-card="${i}"');
    });

    it('keeps reference identifiers in diagnostics attributes, never visible copy (K-35)', () => {
      expect(schedule).toContain("data-lesson-teacher=\"${escapeHtml(ev.teacherId || '')}\"");
      expect(schedule).toContain("data-lesson-group=\"${escapeHtml(ev.studentGroupId || '')}\"");
      expect(schedule).toContain("data-lesson-room=\"${escapeHtml(ev.roomId || '')}\"");
      // Görünür metin gerçek kullanıcı verisidir: gün adı + saat aralığı;
      // ham UUID öğretmen/sınıf/derslik etiketi kart metnine sızamaz.
      expect(schedule).toContain("['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']");
      expect(schedule).not.toContain('Öğretmen: ${escapeHtml(ev.teacherId');
      expect(schedule).not.toContain('Sınıf: ${escapeHtml(ev.studentGroupId');
      expect(schedule).not.toContain('Derslik: ${escapeHtml(ev.roomId');
    });

    it('keeps the card view read-only; edits continue through the existing editor rows', () => {
      // Tek mutasyon yüzeyi kalması için (K-59 bağlı): kartlar aksiyon taşımaz.
      expect(schedule).toMatch(/data-lesson-card="\$\{i\}"[^>]*>([\s\S]*?)<p class="hint">Kayıt ayrıntısı/);
      expect(schedule).toContain('data-schedule-row="${index}"');
    });
  });

  describe('çakışma çözümü (otomatik çözücü devre dışı)', () => {
    it('renders conflicts from the server validation findings, never an auto-solver', () => {
      expect(html).toContain('id="schedule-conflicts"');
      expect(html).toContain('aria-label="Çakışma çözümü"');
      expect(html).toContain('Otomatik çözücü devre dışı');
      expect(schedule).toContain('function renderConflictResolution(reasons)');
      expect(schedule).toContain('Çakışma çözümü (otomatik çözücü devre dışı)');
      expect(schedule).toContain('Çakışmalar elle çözülür');
      // Negatif sınırlar: istemcide otomatik çözücü yoktur.
      expect(schedule.toLowerCase()).not.toContain('autoresolve');
      expect(schedule).not.toContain('resolveAllConflicts');
    });

    it('routes the finding code only through the label map and keeps the raw code in diagnostics', () => {
      expect(schedule).toContain('data-schedule-reason="${escapeHtml(code)}"');
      expect(schedule).toContain("displayTerm(scheduleReasonLabels, code, 'Çözülmesi gereken bir bulgu')");
    });

    it('offers manual resolution by jumping to the conflicting lesson row', () => {
      expect(schedule).toContain('data-action="schedule-conflict-edit"');
      expect(schedule).toContain('scrollIntoView(');
    });

    it('clears the conflict surface when the schedule is created or a draft is saved', () => {
      expect((schedule.match(/renderConflictResolution\(\[\]\)/g) || []).length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('mock-up seam (K-65)', () => {
    it('keeps the program design trio as permanent static references', () => {
      for (const file of ['program.html', 'program-builder.html', 'program-conflicts.html']) {
        const mockup = fs.readFileSync(path.join(designDir, file), 'utf8');
        expect(mockup).toContain('../app/tokens.css');
        expect(mockup).toContain('id="design-main"');
        expect(mockup).toContain('data-tab="program"');
      }
    });

    it('labels the schedule findings from the single canonical map in app.js', () => {
      const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
      // Çakışma bulguları sunucunun kanonik neden kodlarıyla gelir; istemci kod
      // üretmez (K-30/K-32). Etiket haritası app.js'te tek kaynaktır.
      expect(app).toContain('const scheduleReasonLabels = {');
      expect(app).toContain('TEACHER_TIME_OVERLAP:');
      expect(app).toContain('SCHEDULE_HARD_CONFLICTS_PRESENT:');
    });
  });
});
