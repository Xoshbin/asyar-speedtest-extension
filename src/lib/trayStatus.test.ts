import { describe, expect, it, vi } from 'vitest';
import type { IStatusBarService } from 'asyar-sdk/contracts';
import type { TestResult } from './types';
import { SpeedtestTray } from './trayStatus';

function result(id: string, downloadMbps: number): TestResult {
  return {
    id,
    timestamp: 1,
    downloadMbps,
    uploadMbps: 20,
    pingMs: 10,
    jitterMs: 2,
    server: { isp: 'Example', colo: 'EBL', country: 'IQ', ip: '127.0.0.1' },
    verdict: 'good',
  };
}

describe('SpeedtestTray', () => {
  it('keeps a live result that arrives while history hydration is pending', async () => {
    let resolveHistory!: (entries: TestResult[]) => void;
    const history = new Promise<TestResult[]>((resolve) => {
      resolveHistory = resolve;
    });
    const statusBar = {
      registerItem: vi.fn(),
      updateItem: vi.fn(),
      unregisterItem: vi.fn(),
    } as unknown as IStatusBarService;
    const tray = new SpeedtestTray(statusBar, () => history);

    const activation = tray.activate();
    tray.recordResult(result('live', 482.7));
    resolveHistory([result('stale', 25)]);
    await activation;

    expect(statusBar.registerItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: '↓ 483 Mbps' }),
    );
    expect(statusBar.updateItem).not.toHaveBeenCalled();

    tray.recordResult(result('newer', 9.46));
    expect(statusBar.updateItem).toHaveBeenCalledWith(
      'last-result',
      expect.objectContaining({ title: '↓ 9.5 Mbps' }),
    );

    tray.deactivate();
    expect(statusBar.unregisterItem).toHaveBeenCalledWith('last-result');
  });

  it('ignores hydration from an activation that was deactivated and replaced', async () => {
    const resolvers: Array<(entries: TestResult[]) => void> = [];
    const statusBar = {
      registerItem: vi.fn(),
      updateItem: vi.fn(),
      unregisterItem: vi.fn(),
    } as unknown as IStatusBarService;
    const tray = new SpeedtestTray(
      statusBar,
      () =>
        new Promise<TestResult[]>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const firstActivation = tray.activate();
    tray.deactivate();
    const secondActivation = tray.activate();
    resolvers[1]([result('current', 100)]);
    await secondActivation;
    resolvers[0]([result('stale', 5)]);
    await firstActivation;

    expect(statusBar.registerItem).toHaveBeenCalledTimes(1);
    expect(statusBar.registerItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: '↓ 100 Mbps' }),
    );
  });
});
