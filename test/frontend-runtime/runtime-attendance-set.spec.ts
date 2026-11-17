import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * #492 — Yoklama seti (oturum listesi, işaretleyici, absences).
 *
 * Dışsal sözleşme pinlenir: eksik/tamamlanmış ayrımı, beş işaret + toplu geldi +
 * tamamla (K-50: tamamlama = kilitleme), kilitli görünümde dürüst kopya ve
 * "işaretlenmemiş devamsız sayılmaz" kuralı.
 */
describe('#492 Yoklama seti', () => {
  const root = process.cwd();
  const runtimeDir = path.join(root, 'frontend', 'runtime');
  const screensDir = path.join(runtimeDir, 'screens');
  const designDir = path.join(root, 'frontend', 'design');

  const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
  const attendance = fs.readFileSync(path.join(screensDir, 'attendance.js'), 'utf8');
  const mockup = fs.readFileSync(path.join(designDir, 'yoklama.html'), 'utf8');

  describe('oturum listesi: eksik / tamamlanmış', () => {
    it('derives completion from the lock state (K-50) and labels it in words', () => {
      expect(attendance).toContain('function attendanceCompletion(session)');
      expect(attendance).toContain("if (status === 'locked') {");
      expect(attendance).toContain("return { key: 'complete', label: 'Tamamlanmış', tone: 'success' };");
      expect(attendance).toContain("return { key: 'incomplete', label: 'Eksik', tone: 'warning' };");
      // Ayrım yalnız renkle değil: data-attendance-state + görünür etiket.
      expect(attendance).toContain('data-attendance-state="${escapeHtml(completion.key)}"');
      expect(attendance).toContain('data-tone="${escapeHtml(completion.tone)}"');
    });

    it('ships filter segments and an honest "visible / total" count', () => {
      expect(html).toContain('id="attendance-status-filter"');
      expect(html).toContain('aria-label="Oturum tamamlanma filtresi"');
      expect(html.match(/data-attendance-status=/g)?.length).toBe(3);
      expect(attendance).toContain('function setAttendanceFilter(nextFilter)');
      expect(attendance).toContain('state.attendanceStatusFilter');
      expect(attendance).toContain('oturum gösteriliyor');
      // Filtre boş sonucu "kayıt yok" diye yutturmaz.
      expect(attendance).toContain("'Bu kapsamda eksik oturum yok.'");
      expect(attendance).toContain("'Bu kapsamda tamamlanmış oturum yok.'");
    });
  });

  describe('işaretleyici', () => {
    it('offers the five marks where "unmarked" is the absence of a record', () => {
      expect(attendance).toContain("const ATTENDANCE_MARKS = ['present', 'absent', 'late', 'excused'];");
      expect(app).toContain("unmarked: 'İşaretlenmedi'");
      expect(attendance).toContain('data-mark-state=');
      expect(attendance).toContain("current || 'unmarked'");
      expect(attendance).toContain('aria-pressed="${current === mark}"');
    });

    it('bulk-marks only unmarked students and reports partial failures honestly', () => {
      expect(attendance).toContain('async function bulkPresent(sessionId)');
      expect(attendance).toContain("const marked = new Set(asArray(body, ['records', 'recordRows'])");
      expect(attendance).toContain('Toplu geldi kısmen uygulandı');
      expect(attendance).toContain('data-action="attendance-bulk-present"');
    });

    it('completes by locking and keeps locked sessions read-mostly', () => {
      expect(attendance).toContain('Tamamla ve kilitle');
      expect(attendance).toContain('Tamamlamak = kilitlemek (K-50)');
      expect(attendance).toContain('Oturum kilitli (tamamlanmış); kayıtlar kontrollü düzeltme');
      expect(attendance).toContain("locked ? 'locked_state' : 'ready'");
    });
  });

  describe('absences', () => {
    it('lists the results and states that unmarked students are not absent', () => {
      expect(html).toContain('id="attendance-absences"');
      expect(html).toContain('İşaretlenmemiş öğrenci devamsız sayılmaz');
      expect(attendance).toContain('function renderAttendanceAbsences(');
      expect(attendance).toContain('data-not-marked-copy');
      expect(attendance).toContain('data-absent-count');
      expect(attendance).toContain("marked.get(String(studentId)) === 'absent'");
      // İşaretlenmemiş öğrenci devamsız listesine KARIŞMAZ.
      expect(attendance).toContain('const notMarkedIds = roster.filter((studentId) => !marked.has(String(studentId)));');
    });
  });

  describe('mock-up seam (K-65)', () => {
    it('keeps the design reference under frontend/design with the shared shell', () => {
      expect(fs.existsSync(path.join(designDir, 'yoklama.html'))).toBe(true);
      expect(mockup).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
      expect(mockup).toContain('<link rel="stylesheet" href="../app/tokens.css" />');
      expect(mockup).toContain('class="skip-link" href="#design-main"');
      expect(mockup).toContain('<html lang="tr">');
      expect(mockup).not.toContain('<script');
      expect(mockup).not.toContain('<style');
      expect(mockup).not.toContain('style="');
    });

    it('keeps the canonical IA order (K-58)', () => {
      const order = ['bugun', 'program', 'izinler', 'yoklama', 'veli-bilgilendirme', 'tanimlar', 'raporlar', 'yonetim'];
      const positions = order.map((tab) => mockup.indexOf(`data-tab="${tab}"`));
      for (const position of positions) expect(position).toBeGreaterThan(-1);
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    });

    it('documents the same contracts it ships', () => {
      expect(mockup).toContain('data-attendance-state="incomplete"');
      expect(mockup).toContain('data-attendance-state="complete"');
      expect(mockup).toContain('Toplu geldi (1)');
      expect(mockup).toContain('Tamamla ve kilitle');
      expect(mockup).toContain('data-not-marked-copy');
      expect(mockup).toContain('İşaretlenmemiş öğrenci devamsız sayılmaz');
      for (const state of ['loading', 'same_scope_empty', 'locked_state', 'stale_version', 'forbidden_non_enumerating']) {
        expect(mockup).toContain(`data-state="${state}"`);
      }
    });
  });
});
