import {
  runtime,
  response,
  TEACHER_PERMISSION_KEYS,
  OPS_PERMISSION_KEYS,
} from './runtime-harness';

const PROBE = 'state, applyCatalog, login, updateContext, apiRequest, navSectionsFor, renderNavigation, activateTab';
const PROBE_AUTH = `${PROBE}, logout, trySilentRefresh, handleAuthRequired, handleNetworkError`;

const catalogFor = (permissions: string[]) => ({
  version: 1,
  institution: { name: 'Atatürk Anadolu Lisesi' },
  role: { label: 'Yetki Etiketi' },
  branches: [{ name: 'Merkez', code: 'ANKARA' }],
  activeBranch: { name: 'Merkez', code: 'ANKARA' },
  permissions,
});

// Persona kotları: runtime-harness'ta tek kaynak (#445).
// Bu spec yalnız oturum kurtarma davranışını test eder; hangi kot
// seçilirse seçilsin yetkilendirme iddiasını değiştirmez.
const TEACHER_PERMISSIONS = TEACHER_PERMISSION_KEYS;
const OPS_PERMISSIONS = OPS_PERMISSION_KEYS;

describe('runtime auth recovery states (#399)', () => {
  it('login stores both accessToken and refreshToken for silent refresh', () => {
    const ui = runtime(PROBE_AUTH);
    ui.fetch
      .mockResolvedValueOnce(
        response({ accessToken: 'access-abc', refreshToken: 'refresh-xyz', refreshTokenId: 'sid-1' }),
      )
      .mockResolvedValueOnce(response(catalogFor(TEACHER_PERMISSIONS)));
    ui.element('#email').value = 'teacher@example.com';
    ui.element('#password').value = 'secret';
    return ui.probe
      .login({ preventDefault: () => {} })
      .then(() => {
        expect(ui.probe.state.accessToken).toBe('access-abc');
        expect(ui.probe.state.refreshToken).toBe('refresh-xyz');
      });
  });

  it('trySilentRefresh calls /auth/refresh with stored refreshToken and updates tokens', () => {
    const ui = runtime(PROBE_AUTH);
    ui.probe.state.refreshToken = 'refresh-old';
    ui.fetch.mockResolvedValueOnce(
      response({ accessToken: 'access-new', refreshToken: 'refresh-new', refreshTokenId: 'sid-2' }),
    );
    return ui.probe.trySilentRefresh().then((ok: boolean) => {
      expect(ok).toBe(true);
      expect(ui.probe.state.accessToken).toBe('access-new');
      expect(ui.probe.state.refreshToken).toBe('refresh-new');
      expect(ui.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'refresh-old' }),
        }),
      );
    });
  });

  it('trySilentRefresh returns false and clears tokens when refresh fails', () => {
    const ui = runtime(PROBE_AUTH);
    ui.probe.state.refreshToken = 'refresh-bad';
    ui.fetch.mockResolvedValueOnce(response({ message: 'Invalid refresh token' }, 401));
    return ui.probe.trySilentRefresh().then((ok: boolean) => {
      expect(ok).toBe(false);
      expect(ui.probe.state.accessToken).toBe('');
      expect(ui.probe.state.refreshToken).toBe('');
    });
  });

  it('handleAuthRequired shows Turkish re-auth prompt preserving route and branch', () => {
    const ui = runtime(PROBE_AUTH);
    ui.probe.applyCatalog(catalogFor(TEACHER_PERMISSIONS));
    ui.probe.state.accessToken = 'old-token';
    ui.probe.state.refreshToken = 'refresh-old';
    ui.probe.state.branchId = 'ANKARA';
    ui.probe.state.branchLabel = 'Merkez · ANKARA';
    // Simulate being on teacher tab: set teacher selected, bugun deselected
    ui.element('.tab[data-tab="bugun"]').setAttribute('aria-selected', 'false');
    ui.element('.tab[data-tab="teacher"]').setAttribute('aria-selected', 'true');
    ui.probe.handleAuthRequired();
    // Re-auth prompt shown
    expect(ui.element('#message-region').innerHTML).toMatch(/yeniden giriş|oturum.*aç/i);
    // Route preserved
    expect(ui.probe.state.pendingRoute).toBe('teacher');
    // Branch preserved
    expect(ui.probe.state.pendingBranch).toBe('ANKARA');
    // Tokens cleared (session expired)
    expect(ui.probe.state.accessToken).toBe('');
  });

  it('after successful re-auth, user returns to preserved route and branch', () => {
    const ui = runtime(PROBE_AUTH);
    ui.probe.state.pendingRoute = 'ops';
    ui.probe.state.pendingBranch = 'ANKARA';
    ui.fetch
      .mockResolvedValueOnce(
        response({ accessToken: 'access-re', refreshToken: 'refresh-re', refreshTokenId: 'sid-3' }),
      )
      .mockResolvedValueOnce(response(catalogFor(OPS_PERMISSIONS)));
    ui.element('#email').value = 'ops@example.com';
    ui.element('#password').value = 'secret';
    return ui.probe
      .login({ preventDefault: () => {} })
      .then(() => {
        // pendingRoute should be consumed
        expect(ui.probe.state.pendingRoute).toBe('');
        expect(ui.probe.state.pendingBranch).toBe('');
      });
  });

  it('logout clears session state and resets to login surface', () => {
    const ui = runtime(PROBE_AUTH);
    ui.probe.state.accessToken = 'access-xyz';
    ui.probe.state.refreshToken = 'refresh-xyz';
    ui.probe.state.permissions = ['user:read'];
    ui.probe.state.branchId = 'ANKARA';
    ui.probe.state.branchLabel = 'Merkez · ANKARA';
    ui.probe.state.branches = [{ name: 'Merkez', code: 'ANKARA' }];
    ui.probe.state.tenantId = 'tenant-1';
    ui.probe.logout();
    expect(ui.probe.state.accessToken).toBe('');
    expect(ui.probe.state.refreshToken).toBe('');
    expect(ui.probe.state.permissions).toEqual([]);
    expect(ui.probe.state.branchId).toBe('');
    expect(ui.probe.state.branchLabel).toBe('');
    expect(ui.probe.state.branches).toEqual([]);
    expect(ui.probe.state.tenantId).toBe('');
    // Confirmation message
    expect(ui.element('#message-region').innerHTML).toMatch(/çıkış|kapatıldı/i);
  });

  it('logout clears institution and branch display from DOM', () => {
    const ui = runtime(PROBE_AUTH);
    ui.probe.applyCatalog(catalogFor(TEACHER_PERMISSIONS));
    ui.element('#context-institution').textContent = 'Atatürk Anadolu Lisesi';
    ui.probe.logout();
    expect(ui.element('#context-institution').textContent).toBe('');
  });

  it('handleNetworkError shows retryable Turkish state', () => {
    const ui = runtime(PROBE_AUTH);
    ui.probe.handleNetworkError();
    const message = ui.element('#message-region').innerHTML;
    expect(message).toMatch(/bağlantı|ağ|tekrar dene/i);
    expect(message).not.toMatch(/fetch|network error|ECONNREFUSED/i);
  });

  it('forbidden response shows operational Turkish with safe exit, no raw codes', () => {
    const ui = runtime(PROBE_AUTH);
    ui.probe.applyCatalog(catalogFor(TEACHER_PERMISSIONS));
    ui.probe.activateTab('ops');
    const message = ui.element('#message-region').innerHTML;
    expect(message).toContain('yetkiniz yok');
    expect(message).not.toMatch(/403|forbidden|access denied/i);
  });

  it('auth prompt does not expose raw HTTP status or English tokens', () => {
    const ui = runtime(PROBE_AUTH);
    ui.probe.state.accessToken = 'old';
    ui.probe.state.refreshToken = 'refresh-old';
    ui.probe.state.branchId = 'ANKARA';
    ui.probe.handleAuthRequired();
    const message = ui.element('#message-region').innerHTML;
    expect(message).not.toMatch(/401|unauthorized|invalid token|jwt/i);
    expect(message).not.toMatch(/session expired/i);
  });

  it('unsent leave draft fields are preserved across auth interruption', () => {
    const ui = runtime(PROBE_AUTH);
    ui.probe.applyCatalog(catalogFor(TEACHER_PERMISSIONS));
    ui.element('#leave-start').value = '2026-11-01';
    ui.element('#leave-end').value = '2026-11-05';
    ui.element('#leave-reason').value = 'Sağlık raporu';
    ui.probe.state.accessToken = 'old';
    ui.probe.state.refreshToken = 'refresh-old';
    ui.probe.handleAuthRequired();
    // Draft preserved in state
    expect(ui.probe.state.pendingDraft).toMatchObject({
      start: '2026-11-01',
      end: '2026-11-05',
      reason: 'Sağlık raporu',
    });
    // Form fields still have values (not cleared)
    expect(ui.element('#leave-start').value).toBe('2026-11-01');
    expect(ui.element('#leave-end').value).toBe('2026-11-05');
    expect(ui.element('#leave-reason').value).toBe('Sağlık raporu');
  });
});
