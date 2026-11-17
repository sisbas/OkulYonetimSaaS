import { runtime, response, ALL_PERMISSION_KEYS } from './runtime-harness';

/**
 * #464 — bildirim listesi tek sayfa (20) çekiyordu; >20 kayıtlı şubede toplu onay
 * görünmeyen taslakları atlar, UI "toplu onaylandı" derken sessiz kalıyordu.
 * Düzeltme: API sayfalı olduğu için `limit/offset` ile tüm sayfalar tükenene dek
 * çekilir; liste ekranı ilk sayfayı gösterse de toplu onay verisi TÜMÜNÜ içerir.
 */

const PROBE = 'state, loadNotifications';

function signedIn() {
  const ui = runtime(PROBE, ALL_PERMISSION_KEYS);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'ANKARA';
  return ui;
}

const notification = (id: string, sessionId: string, version: number, status = 'pending') => ({
  id,
  sessionId,
  version,
  status,
  eventType: 'attendance.absent.locked',
  channel: 'sms',
  attempts: 0,
  createdAt: '2026-11-17T09:00:00.000Z',
});

describe('#464 notifications list pagination', () => {
  it('fetches every page and includes all pending drafts of the session in the bulk action', async () => {
    const ui = signedIn();
    const sessionId = 'aaaaaaa1-1111-4111-8111-111111111111';
    const page1 = Array.from({ length: 20 }, (_, index) =>
      notification(`pending-${index}`, sessionId, index + 1),
    );
    const page2 = [
      notification('pending-20', sessionId, 21),
      notification('approved-21', sessionId, 22, 'approved'),
    ];
    ui.fetch.mockImplementation(async (url: unknown) => {
      const u = String(url);
      const match = /limit=(\d+)&offset=(\d+)/.exec(u);
      const offset = Number(match?.[2] ?? 0);
      const notifications = offset === 0 ? page1 : offset === 20 ? page2 : [];
      return response({ notifications });
    });

    await ui.probe.loadNotifications();

    const bulk = ui.element('#bulk-approve-output').innerHTML;
    const match = /data-versions="([^"]+)"/.exec(bulk);
    expect(match).not.toBeNull();
    const versions = JSON.parse(decodeURIComponent(match![1])) as Array<{ id: string; version: number }>;
    expect(versions).toHaveLength(21);
    expect(versions.map((v) => v.id)).toContain('pending-20');
    expect(versions.map((v) => v.id)).not.toContain('approved-21');
  });

  it('stops at the first short page when the total is under a full page', async () => {
    const ui = signedIn();
    const sessionId = 'bbbbbbb2-2222-4222-8222-222222222222';
    ui.fetch.mockImplementation(async () =>
      response({ notifications: [notification('only', sessionId, 1)] }),
    );

    await ui.probe.loadNotifications();

    expect(ui.fetch).toHaveBeenCalledTimes(1);
    expect(ui.element('#bulk-approve-output').innerHTML).toContain('data-action="bulk-approve-session"');
  });
});
