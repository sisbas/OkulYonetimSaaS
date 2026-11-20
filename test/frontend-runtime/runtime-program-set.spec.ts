import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * #490 → #450 — Program seti (haftalık program, gün şeridi, gün ajandası, çakışma).
 *
 * Dışsal sözleşmeyi pinler: kapsam filtreleri (sınıf/öğretmen/derslik), haftanın
 * gün şeridi, seçili günün dikey ajandası, çakışma çözüm yüzeyi ve "otomatik
 * çözücü devre dışı" dürüstlüğü. Ham referans kimlikleri (UUID) yalnız data-*
 * tanılama kanalında ve form değerlerinde kalır (K-35); görünür metin gün/saat
 * ve sıra bilgisidir.
 */
describe('#450 Haftalık program seti', () => {
  const root = process.cwd();
  const runtimeDir = path.join(root, 'frontend', 'runtime');
  const screensDir = path.join(runtimeDir, 'screens');
  const designDir = path.join(root, 'frontend', 'design');

  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
  const schedule = fs.readFileSync(path.join(screensDir, 'schedule.js'), 'utf8');

  describe('panel iskeleti (#450)', () => {
    it('ships the weekly programme skeleton: scope, status, day strip, agenda, gate, actions', () => {
      expect(html).toContain('id="program-panel"');
      expect(html).toContain('id="program-heading"');
      expect(html).toContain('id="program-scope"');
      expect(html).toContain('id="schedule-status"');
      expect(html).toContain('id="schedule-daystrip"');
      expect(html).toContain('id="schedule-agenda"');
      expect(html).toContain('id="schedule-gate"');
      expect(html).toContain('id="schedule-actions"');
      expect(html).toContain('id="schedule-editor"');
      expect(html).toContain('id="schedule-conflicts"');
    });

    it('offers exactly one mutating path for a published programme: the new-period draft form', () => {
      // Yayınlanmış program değiştirilemez: düzenleyici ve mutasyon kontrolleri yok.
      expect(html).not.toContain('id="unpublish-schedule"');
      expect(html).not.toContain('id="schedule-branch"');
      expect(html).not.toContain('id="lesson-cards"');
      expect(html).not.toContain('id="schedule-event-form"');
      // Yeni taslak formu iki tarih de zorunlu tutar ve create yetkisine bağlıdır.
      expect(html).toContain('id="schedule-effective-from" type="date" required');
      expect(html).toContain('id="schedule-effective-to" type="date" required');
      expect(schedule).toContain("hasCapability('schedule:draft:create')");
    });
  });

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

    it('filters the agenda and keeps the filtered emptiness on the shared empty path', () => {
      const agenda = schedule.slice(
        schedule.indexOf('function renderAgenda()'),
        schedule.indexOf('function renderGate()'),
      );
      expect(agenda).toContain("empty(target, 'scheduleDay')");
      expect(agenda).toContain('filteredScheduleEvents()');
    });
  });

  describe('gün şeridi (#schedule-daystrip)', () => {
    it('renders a pressed-button strip for the week, weekends only with events', () => {
      expect(html).toContain('id="schedule-daystrip"');
      expect(html).toContain('aria-label="Haftanın günleri"');
      expect(schedule).toContain('const PROGRAMME_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];');
      expect(schedule).toContain('const PROGRAMME_WEEKDAYS = [1, 2, 3, 4, 5];');
      expect(schedule).toContain('function renderDayStrip()');
      expect(schedule).toContain('data-day="${day}"');
      expect(schedule).toContain('aria-pressed="${selected');
      expect(schedule).toContain("data-day=\"${day}\"");
      for (const day of ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']) {
        expect(schedule).toContain(`'${day}'`);
      }
      // Hafta sonu yalnız o gün ders varsa (ya da seçiliyse) çizilir.
      expect(schedule).toContain('PROGRAMME_WEEKDAYS.includes(day) || counts[day] > 0 || state.scheduleDay === day');
    });

    it('keeps the selection in state and re-renders only the strip and agenda', () => {
      expect(schedule).toContain('function selectScheduleDay(day)');
      expect(schedule).toContain('state.scheduleDay = value;');
      expect(schedule).toContain('renderDayStrip();');
      expect(schedule).toContain('renderAgenda();');
    });
  });

  describe('gün ajandası (#schedule-agenda)', () => {
    it('renders the selected day as a vertical agenda in time order', () => {
      expect(html).toContain('id="schedule-agenda"');
      expect(html).toContain('aria-label="Seçili günün dersleri"');
      expect(schedule).toContain('function renderAgenda()');
      expect(schedule).toContain('.sort(compareByStart)');
      expect(schedule).toContain('data-schedule-event="${escapeHtml(String(ev?.eventId ?? \'\'))}"');
      expect(schedule).toContain('class="agenda-item"');
      expect(schedule).toContain('class="agenda-time"');
    });

    it('keeps reference identifiers out of visible copy; only diagnostics attributes and input values carry them (K-35)', () => {
      expect(schedule).toContain("data-schedule-event=\"${escapeHtml(String(ev?.eventId ?? ''))}\"");
      expect(schedule).toContain('Öğretmen');
      expect(schedule).toContain('Sınıf');
      expect(schedule).toContain('Derslik');
      // Görünür başlık zaman dilimi etiketi ya da sıradır; ham UUID kopyaya sızamaz.
      expect(schedule).toContain('String(ev?.timeSlotLabel ?? \'\').trim() || `Ders ${index + 1}`');
      expect(schedule).not.toContain('Öğretmen: ${escapeHtml(ev.teacherId');
      expect(schedule).not.toContain('Sınıf: ${escapeHtml(ev.studentGroupId');
      expect(schedule).not.toContain('Derslik: ${escapeHtml(ev.roomId');
    });

    it('renders the day empty state through the shared empty path', () => {
      expect(schedule).toContain("empty(target, 'scheduleDay')");
      const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
      expect(app).toContain('scheduleDay: {');
    });
  });

  describe('yayın kapısı ve yayın (read-after-write)', () => {
    it('declares the gate facts and refuses to publish without current evidence', () => {
      expect(schedule).toContain('function canPublishNow()');
      expect(schedule).toContain("evidence.mode !== 'FULL' || evidence.evidenceStatus !== 'authoritative'");
      expect(schedule).toContain('Number(evidence.scheduleRevision) !== Number(read.revision)');
      expect(schedule).toContain('if (!evidence.canPublish) return false;');
      expect(schedule).toContain('if (state.scheduleDirty) return false;');
    });

    it('uses only a server-issued revision for If-Match, never a fabricated one or the GET ETag', () => {
      expect(schedule).toContain('function mutationToken(id, revision)');
      expect(schedule).toContain('Number.isInteger(value) && value >= 1');
      expect(schedule).not.toContain('Number(revision) || 1');
      // GET yanıtının header ETag'i hiçbir mutasyon isteğinde kullanılmaz.
      expect(schedule).toContain("'If-Match': mutationIfMatch()");
      expect(schedule).not.toContain('state.scheduleEtag');
    });

    it('re-reads the schedule after every mutation (read-after-write)', () => {
      expect(schedule).toContain('async function loadScheduleDetail(scheduleId)');
      expect(schedule).toContain('await loadScheduleDetail(state.scheduleId);');
      expect((schedule.match(/await loadScheduleDetail/g) || []).length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('çakışma çözümü (otomatik çözücü devre dışı)', () => {
    it('renders conflicts from the server validation findings, never an auto-solver', () => {
      expect(html).toContain('id="schedule-conflicts"');
      expect(html).toContain('aria-label="Doğrulama bulguları"');
      expect(html).toContain('Otomatik çözücü devre dışı');
      expect(schedule).toContain('function renderConflictResolution(reasons)');
      expect(schedule).toContain('Doğrulama bulguları');
      expect(schedule).toContain('Çakışmalar elle çözülür');
      // Negatif sınırlar: istemcide otomatik çözücü yoktur.
      expect(schedule.toLowerCase()).not.toContain('autoresolve');
      expect(schedule).not.toContain('resolveAllConflicts');
    });

    it('routes the finding code only through the label map and keeps the raw code in diagnostics', () => {
      expect(schedule).toContain('data-schedule-reason="${escapeHtml(code)}"');
      expect(schedule).toContain("displayTerm(scheduleReasonLabels, code, 'Çözülmesi gereken bir bulgu')");
    });

    it('lets the operator jump to the conflicting agenda item', () => {
      expect(schedule).toContain('data-action="schedule-conflict-show"');
      expect(schedule).toContain('scrollIntoView(');
    });

    it('clears the conflict surface when the schedule is loaded or validation is cleared', () => {
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
