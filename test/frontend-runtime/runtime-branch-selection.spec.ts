import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

const source = fs.readFileSync(path.join(process.cwd(), 'frontend/runtime/app.js'), 'utf8');

function runtime() {
  const elements = new Map<string, Record<string, unknown>>();
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', textContent: '', disabled: false,
      dataset: {}, addEventListener: () => {}, focus: () => {} });
    return elements.get(id)!;
  };
  const fetch = jest.fn();
  const context = vm.createContext({ document: { querySelector: element, querySelectorAll: () => [], addEventListener: () => {} },
    fetch, URLSearchParams });
  vm.runInContext(source + '\nthis.probe = { state, applyCatalog, login, updateContext, apiRequest };', context);
  return { element, fetch, probe: context.probe };
}

function response(body: unknown, status = 200) {
  return { ok: status === 200, status, text: async () => JSON.stringify(body), headers: { get: () => null } };
}

const catalog = { branches: [{ name: 'Merkez', code: 'ANKARA' }, { name: 'Merkez', code: 'IZMIR' }], activeBranch: null };

describe('runtime readable branch selection and authenticated forwarding', () => {
  it('loads the authorized catalog after login and shows distinct name/code labels without choosing the first branch', async () => {
    const ui = runtime();
    ui.element('#email').value = 'synthetic@example.invalid';
    ui.element('#password').value = 'synthetic';
    ui.fetch.mockResolvedValueOnce(response({ accessToken: 'memory-only-token' })).mockResolvedValueOnce(response(catalog));
    await ui.probe.login({ preventDefault: () => {} });
    expect(ui.fetch.mock.calls[1][0]).toBe('/api/v1/context');
    expect(ui.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer memory-only-token');
    expect(ui.element('#branch-id').innerHTML).toContain('Merkez · ANKARA');
    expect(ui.element('#branch-id').innerHTML).toContain('Merkez · IZMIR');
    expect(ui.probe.state.branchId).toBe('');
    expect(ui.element('#branch-id').disabled).toBe(false);
  });

  it('waits for server confirmation before forwarding the chosen code in subsequent authenticated business requests', async () => {
    const ui = runtime();
    ui.probe.state.accessToken = 'memory-only-token';
    ui.probe.applyCatalog(catalog);
    ui.element('#branch-id').value = 'IZMIR';
    let confirm!: (value: unknown) => void;
    ui.fetch.mockReturnValueOnce(new Promise((resolve) => { confirm = resolve; })).mockResolvedValueOnce(response({ items: [] }));
    const selecting = ui.probe.updateContext({ preventDefault: () => {} });
    expect(ui.probe.state.branchId).toBe('');
    expect(ui.fetch.mock.calls).toHaveLength(1);
    const selection = ui.fetch.mock.calls[0];
    expect(selection[0]).toBe('/api/v1/context/branch');
    expect(JSON.parse(selection[1].body)).toEqual({ branchName: 'Merkez', branchCode: 'IZMIR' });
    expect(selection[1].headers['x-branch-code']).toBeUndefined();
    confirm(response({ ...catalog, activeBranch: catalog.branches[1] }));
    await selecting;
    expect(ui.fetch.mock.calls[1][0]).toBe('/api/v1/daily-operations/today?branchId=IZMIR');
    expect(ui.fetch.mock.calls[1][1].headers).toMatchObject({ Authorization: 'Bearer memory-only-token', 'x-branch-code': 'IZMIR' });
    expect(ui.element('#summary-scope').textContent).toBe('Merkez · IZMIR');
  });

  it('does not retain a previous choice after failed selection or a new failed login', async () => {
    const ui = runtime();
    ui.probe.state.accessToken = 'memory-only-token';
    ui.probe.applyCatalog({ ...catalog, activeBranch: catalog.branches[0] });
    ui.element('#branch-id').value = 'IZMIR';
    ui.fetch.mockResolvedValueOnce(response({ message: 'Kayıt bulunamadı' }, 404));
    await ui.probe.updateContext({ preventDefault: () => {} });
    expect(ui.probe.state.branchId).toBe('');
    expect(ui.fetch.mock.calls).toHaveLength(1);
    ui.fetch.mockResolvedValueOnce(response({}, 401));
    await ui.probe.login({ preventDefault: () => {} });
    expect(ui.probe.state.accessToken).toBe('');
    expect(ui.probe.state.branches).toHaveLength(0);
    expect(ui.element('#branch-id').disabled).toBe(true);
  });
});
