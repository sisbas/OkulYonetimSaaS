import { runtime, response, ALL_PERMISSION_KEYS } from './runtime-harness';

/**
 * #464 — bildirim listesi tek sayfa (20) çekiyordu; >20 kayıtlı şubede toplu onay
 * görünmeyen taslakları atlar, UI "toplu onaylandı" derken sessiz kalıyordu.
 * Düzeltme: API sayfalı olduğu için `limit/offset` ile tüm sayfalar tükenene dek
 * çekilir; liste ekranı ilk sayfayı gösterse de toplu onay verisi TÜMÜNÜ içerir.
 */

const PROBE = 'state, loadNotifications, bulkApproveSession';

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

  it('processes oversized sessions in bounded batches instead of relying on silent server truncation', async () => {
    const ui = signedIn();
    const sessionId = 'ccccccc3-3333-4333-8333-333333333333';
    ui.fetch.mockImplementation(async (url: unknown, init?: { body?: string }) => {
      const u = String(url);
      if (u.includes('/notifications/drafts/session/')) {
        const body = init?.body ? JSON.parse(init.body) as { expectedVersions?: unknown[] } : {};
        expect((body.expectedVersions ?? []).length).toBeLessThanOrEqual(200);
        return response({ status: 'approved' });
      }
      const match = /offset=(\d+)/.exec(u);
      const offset = Number(match?.[1] ?? 0);
      const notifications = Array.from({ length: Math.min(20, 250 - offset) }, (_, i) =>
        notification(`draft-${offset + i}`, sessionId, offset + i + 1),
      ).slice(0, Math.max(0, 250 - offset));
      return response({ notifications });
    });

    await ui.probe.loadNotifications();

    const approveCalls: Array<{ body: string | undefined }> = [];
    ui.fetch.mock.calls.forEach(([url, init]) => {
      if (String(url).includes('/notifications/drafts/session/')) {
        approveCalls.push({ body: (init as { body?: string } | undefined)?.body });
      }
    });
    expect(approveCalls).toHaveLength(0); // tıklamadan önce approve çağrısı yok

    // 250 taslağın toplu onayı: 200 + 50 batch'lerine parçalanmalı, hiçbir batch >200 olmamalı.
    const versionsCsv = encodeURIComponent(
      JSON.stringify(
        Array.from({ length: 250 }, (_, i) => ({ id: `draft-${i}`, version: 1 })),
      ),
    );
    await ui.probe.bulkApproveSession(sessionId, versionsCsv);

    const batchSizes = ui.fetch.mock.calls
      .map(([url, init]) => ({ url: String(url), body: (init as { body?: string } | undefined)?.body }))
      .filter((call) => call.url.includes('/notifications/drafts/session/'))
      .map((call) => (JSON.parse(String(call.body)) as { expectedVersions: unknown[] }).expectedVersions.length);
    expect(batchSizes).toEqual([200, 50]);
  });
});
