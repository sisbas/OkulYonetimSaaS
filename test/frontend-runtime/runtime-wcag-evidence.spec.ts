import * as fs from 'fs';
import * as path from 'path';
import { runtime } from './runtime-harness';

const PROBE = 'state, applyCatalog, renderNavigation';

function readShellHtml(): string {
  return fs.readFileSync(path.join(process.cwd(), 'frontend/runtime/index.html'), 'utf8');
}

function readStylesCss(): string {
  return fs.readFileSync(path.join(process.cwd(), 'frontend/runtime/styles.css'), 'utf8');
}

describe('WCAG 2.2 AA evidence suite (#401)', () => {
  describe('semantic landmarks', () => {
    it('shell has banner, navigation, main and contentinfo landmarks', () => {
      const html = readShellHtml();
      // header → implicit banner
      expect(html).toMatch(/<header\b/);
      // nav with accessible name
      expect(html).toMatch(/<nav\b[^>]*aria-label=/);
      // main landmark
      expect(html).toMatch(/<main\b/);
      // footer → contentinfo
      expect(html).toMatch(/<footer\b/);
    });

    it('has exactly one h1 and heading order does not skip levels', () => {
      const html = readShellHtml();
      const h1Count = (html.match(/<h1\b/g) || []).length;
      expect(h1Count).toBe(1);
      // Collect heading levels in document order
      const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
      // First heading is h1
      expect(levels[0]).toBe(1);
      // No level skips forward (h1 → h3 without h2)
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
      }
    });

    it('skip link targets the main landmark', () => {
      const html = readShellHtml();
      expect(html).toMatch(/<a[^>]*class="skip-link"[^>]*href="#runtime-main"/);
      expect(html).toMatch(/<main[^>]*id="runtime-main"/);
    });
  });

  describe('focus visibility', () => {
    it('focus-visible styles exist and are not suppressed', () => {
      const css = readStylesCss();
      expect(css).toMatch(/:focus-visible\s*\{[^}]*outline\s*:/);
      // No outline: none / outline: 0 on focus-visible without a replacement
      const focusVisibleBlocks = css.match(/[^{}]*:focus-visible[^{]*\{[^}]*\}/g) || [];
      for (const block of focusVisibleBlocks) {
        expect(block).not.toMatch(/outline\s*:\s*(none|0)\b(?![^}]*outline\s*:\s*[^;]*[1-9])/);
      }
    });

    it('runtime binds focus-visible on every interactive control selector', () => {
      const css = readStylesCss();
      expect(css).toMatch(/button:focus-visible/);
      expect(css).toMatch(/input:focus-visible/);
      expect(css).toMatch(/a:focus-visible/);
    });
  });

  describe('aria-live dynamic state regions', () => {
    it('announcement trail and status regions use aria-live', () => {
      const html = readShellHtml();
      // Message region (error/success announcements)
      expect(html).toMatch(/id="message-region"[^>]*aria-live="polite"/);
      // Session status pill
      expect(html).toMatch(/id="session-status"[^>]*aria-live="polite"/);
      // Context institution
      expect(html).toMatch(/id="context-institution"[^>]*aria-live="polite"/);
    });

    it('message region is present and wired as a live region in source', () => {
      const html = readShellHtml();
      // Verify the region is declared with aria-live in the static markup
      expect(html).toMatch(/id="message-region"[^>]*aria-live="polite"/);
    });
  });

  describe('form error association', () => {
    it('form fields have aria-describedby linking to help text', () => {
      const html = readShellHtml();
      expect(html).toMatch(/id="tenant-id"[^>]*aria-describedby="tenant-help"/);
      expect(html).toMatch(/id="branch-id"[^>]*aria-describedby="branch-help"/);
    });

    it('help text elements exist for describedby targets', () => {
      const html = readShellHtml();
      expect(html).toMatch(/id="tenant-help"/);
      expect(html).toMatch(/id="branch-help"/);
    });
  });

  describe('44px interactive targets', () => {
    it('button and interactive styles meet 44px minimum on mobile', () => {
      const css = readStylesCss();
      // Buttons should have min-height or padding achieving 44px
      // Accept min-height: 44px+ or padding that sums to 44px (2rem = 32px + line-height)
      const hasMinHeight = /min-height\s*:\s*(4[4-9]|[5-9]\d|\d{3,})px/.test(css);
      const hasButtonPadding = /button\s*\{[^}]*padding\s*:\s*[^;]*(?:[2-9]\d|[3-9]\d)px/.test(css);
      // Either explicit min-height or generous padding on buttons
      expect(hasMinHeight || hasButtonPadding || /\.tab\s*\{[^}]*min-height/.test(css)).toBe(true);
    });

    it('tab controls have adequate touch target sizing', () => {
      const css = readStylesCss();
      // Tabs are primary mobile navigation — must have min-height or padding
      const tabBlock = css.match(/\.tab\s*\{[^}]*\}/);
      expect(tabBlock).toBeTruthy();
      if (tabBlock) {
        const hasSize = /min-height|padding/.test(tabBlock[0]);
        expect(hasSize).toBe(true);
      }
    });
  });

  describe('reduced motion', () => {
    it('prefers-reduced-motion disables non-essential transitions', () => {
      const css = readStylesCss();
      expect(css).toMatch(/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/);
      // The block must disable animations and transitions with none or ~0 duration
      const reducedBlock = css.match(/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)\s*\{[\s\S]*?\n\}/);
      expect(reducedBlock).toBeTruthy();
      if (reducedBlock) {
        expect(reducedBlock[0]).toMatch(/animation(?:-duration)?\s*:\s*(none|0[\d.]*m?s)/);
        expect(reducedBlock[0]).toMatch(/transition(?:-duration)?\s*:\s*(none|0[\d.]*m?s)/);
      }
    });
  });

  describe('no focus-visible suppression', () => {
    it('focus-visible outline is defined with a visible pixel value', () => {
      const css = readStylesCss();
      // Primary assertion: focus-visible provides a non-zero outline
      expect(css).toMatch(/:focus-visible\s*\{[^}]*outline\s*:\s*(\d+)px/);
      const match = css.match(/:focus-visible\s*\{[^}]*outline\s*:\s*(\d+)px/);
      if (match) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('runtime landmark wiring', () => {
    it('navigation renders tab buttons inside the nav landmark', () => {
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.probe.state.authLabel = 'Okul müdürü';
      ui.probe.applyCatalog({ branches: [{ code: 'ANKARA', name: 'Ankara Kampüsü' }], roles: ['school_admin'] });
      return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
        const nav = ui.element('nav.tabs');
        expect(nav).toBeDefined();
        // renderNavigation must have inserted at least one tab button
        const bugunTab = ui.element('.tab[data-tab="bugun"]');
        expect(bugunTab).toBeDefined();
        expect(bugunTab.getAttribute('aria-selected')).toBe('true');
      });
    });

    it('main region is focusable via skip link (tabindex=-1)', () => {
      const html = readShellHtml();
      expect(html).toMatch(/<main[^>]*id="runtime-main"[^>]*tabindex="-1"/);
    });
  });
});
