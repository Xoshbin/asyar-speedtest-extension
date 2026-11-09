import type { IStatusBarService } from 'asyar-sdk/contracts';
import { speedtestTrayTitle } from './format';
import type { TestResult } from './types';

const TRAY_ITEM_ID = 'last-result';

export class SpeedtestTray {
  private active = false;
  private registered = false;
  private currentResult: TestResult | undefined;
  private resultVersion = 0;
  private lifecycleVersion = 0;

  constructor(
    private readonly statusBar: IStatusBarService,
    private readonly loadHistory: () => Promise<TestResult[]>,
  ) {}

  async activate(): Promise<void> {
    this.active = true;
    const lifecycleVersion = ++this.lifecycleVersion;
    const versionBeforeHydration = this.resultVersion;
    let persisted: TestResult | undefined;
    try {
      const history = await this.loadHistory();
      persisted = history.at(-1);
    } catch {
      // A missing or unreadable history should not prevent activation.
    }

    if (!this.active || lifecycleVersion !== this.lifecycleVersion) return;
    if (this.resultVersion === versionBeforeHydration) {
      this.currentResult = persisted;
    }
    this.statusBar.registerItem(this.item(this.currentResult));
    this.registered = true;
  }

  recordResult(result: TestResult): void {
    this.currentResult = result;
    this.resultVersion += 1;
    if (!this.active || !this.registered) return;
    this.statusBar.updateItem(TRAY_ITEM_ID, this.item(result));
  }

  deactivate(): void {
    this.active = false;
    this.lifecycleVersion += 1;
    if (!this.registered) return;
    this.statusBar.unregisterItem(TRAY_ITEM_ID);
    this.registered = false;
  }

  private item(result: TestResult | undefined) {
    return {
      id: TRAY_ITEM_ID,
      icon: '📶',
      text: result ? `Last test: ${speedtestTrayTitle(result)}` : 'No speed test result yet',
      title: speedtestTrayTitle(result),
    };
  }
}
