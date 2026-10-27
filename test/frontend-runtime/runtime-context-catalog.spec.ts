import { runtime, response } from './runtime-harness';

const catalog = {
  version: 1,
  institution: { name: 'Atatürk Anadolu Lisesi' },
  role: { label: 'Kurum Yöneticisi' },
  branches: [
    { name: 'Merkez', code: 'ANKARA' },
    { name: 'Merkez', code: 'IZMIR' },
  ],
  activeBranch: null,
};

describe('runtime context catalog wiring (#397)', () => {
  it('renders the institution name from the catalog in the header context area', async () => {
    const ui = runtime('state, applyCatalog, login, updateContext, apiRequest, retryCatalog');
    ui.element('#email').value = 'ops@example.invalid';
    ui.element('#password').value = 'secret';
    ui.fetch.mockResolvedValueOnce(response({ accessToken: 'memory-only-token' })).mockResolvedValueOnce(response(catalog));
    await ui.probe.login({ preventDefault: () => {} });
    expect(ui.element('#context-institution').textContent).toBe('Atatürk Anadolu Lisesi');
    expect(ui.element('#context-institution').textContent).not.toContain('tenant');
  });

  it('keeps the access token and shows a retryable Turkish error when catalog fetch fails after a successful login', async () => {
    const ui = runtime('state, applyCatalog, login, updateContext, apiRequest, retryCatalog');
    ui.element('#email').value = 'ops@example.invalid';
    ui.element('#password').value = 'secret';
    ui.fetch.mockResolvedValueOnce(response({ accessToken: 'memory-only-token' })).mockResolvedValueOnce(response({ message: 'Bağlantı hatası' }, 500));
    await ui.probe.login({ preventDefault: () => {} });
    expect(ui.probe.state.accessToken).toBe('memory-only-token');
    expect(ui.element('#context-retry').hidden).toBe(false);
    expect(ui.element('#message-region').innerHTML).toContain('tamamlanamadı');
    expect(ui.element('#context-institution').textContent).toBe('');
  });

  it('re-fetches the catalog via retryCatalog without re-authenticating', async () => {
    const ui = runtime('state, applyCatalog, login, updateContext, apiRequest, retryCatalog');
    ui.probe.state.accessToken = 'memory-only-token';
    ui.element('#context-retry').hidden = false;
    ui.fetch.mockResolvedValueOnce(response(catalog));
    await ui.probe.retryCatalog();
    expect(ui.fetch.mock.calls[0][0]).toBe('/api/v1/context');
    expect(ui.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer memory-only-token');
    expect(ui.element('#context-institution').textContent).toBe('Atatürk Anadolu Lisesi');
    expect(ui.element('#context-retry').hidden).toBe(true);
  });

  it('never calls the catalog endpoint on an unauthenticated boot', () => {
    const ui = runtime();
    expect(ui.fetch.mock.calls).toHaveLength(0);
    expect(ui.probe.state.accessToken).toBe('');
    expect(ui.probe.state.branches).toHaveLength(0);
    expect(ui.element('#context-institution').textContent).toBe('');
  });

  it('surfaces the canonical forbidden state for a non-enumerating 404 from branch selection', async () => {
    const ui = runtime();
    ui.probe.state.accessToken = 'memory-only-token';
    ui.probe.applyCatalog({ ...catalog, activeBranch: catalog.branches[0] });
    ui.element('#branch-id').value = 'IZMIR';
    ui.fetch.mockResolvedValueOnce(response({ message: 'Kayıt bulunamadı' }, 404));
    await ui.probe.updateContext({ preventDefault: () => {} });
    const output = ui.element('#queue-output');
    expect(output.dataset.state).toBe('forbidden_non_enumerating');
    expect(output.innerHTML).toContain('yetkiniz yok');
    expect(output.innerHTML.toLowerCase()).not.toContain('kayıt bulunamadı');
    expect(output.innerHTML).not.toMatch(/IZMIR/);
  });

  it('never renders UUID patterns, ETag tokens, snake_case codes, or English tenant/branch terms from catalog data', () => {
    const ui = runtime();
    const hostile = {
      version: 'etag-W/"abc123"',
      institution: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'Atatürk Anadolu Lisesi' },
      role: { code: 'tenant_admin', label: 'Kurum Yöneticisi' },
      branches: [{ id: 'f0e1d2c3-b4a5-9687-7869-5a4b3c2d1e0f', name: 'Merkez', code: 'ANKARA' }],
      activeBranch: { id: 'f0e1d2c3-b4a5-9687-7869-5a4b3c2d1e0f', name: 'Merkez', code: 'ANKARA' },
    };
    ui.probe.applyCatalog(hostile);
    const rendered = ui.renderedStrings();
    expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(rendered).not.toMatch(/etag/i);
    expect(rendered).not.toMatch(/\btenant\b/i);
    expect(rendered).not.toMatch(/\bbranch\b/i);
    expect(rendered).not.toMatch(/tenant_admin/);
    expect(rendered).toContain('Merkez');
    expect(rendered).toContain('Atatürk Anadolu Lisesi');
  });
});
