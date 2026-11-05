import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * #491 — İzinler seti (liste, İzinlerim, yeni talep, etki/karar).
 *
 * Bu spec dışsal sözleşmeyi pinler: kullanıcıya görünen durum rozet dili,
 * filtre kesitleri, sahiplik ayrımı, form sınırları (serbest sağlık metni YOK),
 * etki/karar detayı ve mock-up seam'i (K-65: frontend/design altında statik
 * referans + ortak kabuk).
 */
describe('#491 İzinler seti', () => {
  const root = process.cwd();
  const runtimeDir = path.join(root, 'frontend', 'runtime');
  const screensDir = path.join(runtimeDir, 'screens');
  const designDir = path.join(root, 'frontend', 'design');

  const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
  const decisions = fs.readFileSync(path.join(screensDir, 'decisions.js'), 'utf8');
  const mockup = fs.readFileSync(path.join(designDir, 'izinler.html'), 'utf8');

  describe('durum rozet dili ve filtre kesitleri', () => {
    it('labels all four leave statuses in Turkish and gives each a tone', () => {
      const labelBlock = app.slice(app.indexOf('const statusLabels = {'), app.indexOf('const statusTones = {'));
      const toneBlock = app.slice(app.indexOf('const statusTones = {'), app.indexOf('const statusTones = {') + 900);

      for (const status of ['draft', 'pending', 'approved', 'rejected']) {
        expect(labelBlock).toMatch(new RegExp(`${status}: '`));
        expect(toneBlock).toMatch(new RegExp(`${status}: '`));
      }
      expect(labelBlock).toContain("draft: 'Taslak'");
      expect(labelBlock).toContain("pending: 'Beklemede'");
      expect(labelBlock).toContain("approved: 'Onaylandı'");
      expect(labelBlock).toContain("rejected: 'Reddedildi'");
    });

    it('renders a badge from the label map instead of the raw status code', () => {
      expect(app).toContain('function statusBadge(value)');
      expect(app).toContain('data-tone="${escapeHtml(statusTone(key))}"');
      expect(app).toContain('${escapeHtml(displayStatus(key))}');
      expect(decisions).toContain('${statusBadge(decision)}');
      expect(decisions).not.toContain('İzin talebi · ${escapeHtml(decision)}');
    });

    it('ships status filter segments wired to the server-side filter', () => {
      expect(html).toContain('id="leave-status-filter"');
      expect(html).toContain('aria-label="İzin listesi durum filtresi"');
      for (const status of ['', 'draft', 'pending', 'approved', 'rejected']) {
        expect(html).toContain(`data-leave-status="${status}"`);
      }
      expect(html.match(/data-leave-status=/g)?.length).toBe(5);
      // Filtre sunucuya gider: liste istemcide kırpılırsa eksik veri "filtre
      // çalışıyor" gibi görünür.
      expect(decisions).toContain("if (state.leaveStatusFilter) query.set('decisionStatus', state.leaveStatusFilter);");
      expect(decisions).toContain("applyStatusFilter('#leave-status-filter', 'leaveStatus'");
      expect(decisions).toContain("chip.setAttribute('aria-pressed',");
    });
  });

  describe('İzinlerim (sahiplik ayrımı)', () => {
    it('lists own history from the own-scope endpoint and never sends a teacher id', () => {
      expect(html).toContain('id="my-leaves-output"');
      expect(html).toContain('id="refresh-my-leaves"');
      expect(html).toContain('Yalnızca size ait talepler listelenir');
      expect(decisions).toContain('async function loadMyLeaves()');
      expect(decisions).toContain('apiRequest(`/leaves/me');
      // Sahiplik sunucuda çözülür: istemci teacherId göndermez.
      expect(decisions).not.toContain("query.set('teacherId'");
      expect(decisions).not.toMatch(/leaves\/me[^`]*teacherId/);
    });

    it('fails honestly when the own-history surface is not deployed yet', () => {
      expect(decisions).toContain('error.status === 404 || error.status === 405');
      expect(decisions).toContain('İzin geçmişi bu sürümde kullanılamıyor.');
      // 404'ü "kayıt yok" diye göstermek yanlış olurdu.
      expect(decisions).toContain("'unknown_server_state'");
    });

    it('opens one own request through the own-read route', () => {
      expect(decisions).toContain("canRequest('GET', `/leaves/me/:id`)");
      expect(decisions).toContain("target.dataset.action === 'own-leave-open'");
      expect(decisions).toContain('state.activeLeaveId = target.dataset.leaveId;');
    });
  });

  describe('yeni talep formu', () => {
    it('offers the three durations and a reason category only (no free-text health field)', () => {
      for (const duration of ['hourly', 'full_day', 'multi_day']) {
        expect(html).toContain(`<option value="${duration}">`);
      }
      for (const reason of ['administrative', 'health', 'annual_leave', 'other']) {
        expect(html).toContain(`<option value="${reason}">`);
      }
      // Sağlık gerekçesi yalnız KATEGORİDİR: izin formunda serbest metin/tanı alanı yoktur.
      const leaveForm = html.slice(html.indexOf('<form id="leave-form"'), html.indexOf('</form>', html.indexOf('<form id="leave-form"')));
      expect(leaveForm.length).toBeGreaterThan(0);
      expect(leaveForm).not.toContain('<textarea');
      expect(leaveForm).not.toMatch(/id="leave-(health|note|notes|detail|diagnosis)/);
    });

    it('pre-validates the window before calling the API', () => {
      expect(app).toContain('function validateLeaveWindowInput(');
      expect(app).toContain('Saatlik izin en fazla 24 saat olabilir ve iki güne yayılamaz.');
      expect(app).toContain('Tam gün izni tek bir takvim günü içinde kalmalı');
      expect(app).toContain('Çok gün izni en az iki takvim gününe yayılmalı.');
      expect(app).toContain("if (daySpan < 1)");
      const precheckIndex = app.indexOf('const precheck = validateLeaveWindowInput(');
      const postIndex = app.indexOf("await apiRequest('/leaves/me', { method: 'POST', body })");
      expect(precheckIndex).toBeGreaterThan(-1);
      expect(postIndex).toBeGreaterThan(-1);
      expect(precheckIndex).toBeLessThan(postIndex);
      expect(app).toContain("renderRegionState(target, 'validation_error', precheck.message);");
    });
  });

  describe('etki ve karar detayı', () => {
    it('shows impact, coverage and assignment status on the decision card', () => {
      expect(decisions).toContain('Karşılık: ${escapeHtml(displayStatus(coverage))}');
      expect(decisions).toContain("Görevlendirme: ${escapeHtml(assignment ? displayStatus(assignment) : 'Henüz atanmadı')}");
      expect(decisions).toContain("canRequest('PATCH', `/leaves/${encodeURIComponent(leaveId)}/approve`)");
      expect(decisions).toContain("canRequest('PATCH', `/leaves/${encodeURIComponent(leaveId)}/reject`)");
      expect(decisions).toContain('data-leave-etag');
    });
  });

  describe('mock-up seam (K-65)', () => {
    it('keeps the design reference under frontend/design with the shared shell', () => {
      expect(fs.existsSync(path.join(designDir, 'izinler.html'))).toBe(true);
      expect(mockup).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
      expect(mockup).toContain('<link rel="stylesheet" href="../app/tokens.css" />');
      expect(mockup).toContain('class="skip-link" href="#design-main"');
      expect(mockup).toContain('<html lang="tr">');
      // Statik referans: script yok, inline style yok.
      expect(mockup).not.toContain('<script');
      expect(mockup).not.toContain('<style');
      expect(mockup).not.toContain('style="');
    });

    it('keeps the canonical IA order (K-58)', () => {
      const order = ['bugun', 'program', 'izinler', 'yoklama', 'veli-bilgilendirme', 'tanimlar', 'raporlar', 'yonetim'];
      const positions = order.map((tab) => mockup.indexOf(`data-tab="${tab}"`));
      for (const position of positions) expect(position).toBeGreaterThan(-1);
      const sorted = [...positions].sort((left, right) => left - right);
      expect(positions).toEqual(sorted);
    });

    it('documents the same contracts it ships (badges, ownership, no health text, states)', () => {
      expect(mockup).toContain('data-tone="neutral">Taslak');
      expect(mockup).toContain('Yalnızca size ait talepler listelenir');
      expect(mockup).not.toContain('<textarea');
      for (const state of ['loading', 'same_scope_empty', 'stale_version', 'conflict_blocking', 'forbidden_non_enumerating', 'eligibility_not_ready']) {
        expect(mockup).toContain(`data-state="${state}"`);
      }
      expect(mockup).toContain('Görevlendirme: Görevlendirildi');
    });
  });
});
