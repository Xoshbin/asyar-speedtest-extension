<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ClipboardItemType,
    ActionContext,
    type IActionService,
    type IClipboardHistoryService,
    type IInteropService,
    type IFeedbackService,
    type ExtensionStateProxy,
  } from 'asyar-sdk/contracts';
  import type { Phase, TestResult, Meta } from '../lib/types';
  import { scoreQuality } from '../lib/quality';
  import { formatSummary, formatMbps } from '../lib/format';
  import SpeedGauge from '../components/SpeedGauge.svelte';
  import PhaseList from '../components/PhaseList.svelte';
  import ResultCard from '../components/ResultCard.svelte';

  interface ContextLike {
    request<T = unknown>(id: string, payload?: unknown, opts?: { timeoutMs?: number }): Promise<T>;
    getService<T>(namespace: string): T;
  }

  interface Props {
    context: ContextLike;
    actions: IActionService;
    clipboard: IClipboardHistoryService;
    interop: IInteropService;
    feedback?: IFeedbackService;
    extensionId: string;
  }
  let { context, actions, clipboard, interop, feedback, extensionId }: Props = $props();

  let runState = $state<'idle' | 'running' | 'done' | 'error'>('idle');
  let phase = $state<Phase>('idle');
  let mbps = $state(0);
  let meta = $state<Meta | null>(null);
  let final = $state<TestResult | null>(null);
  let errorMsg = $state<string | null>(null);

  let lockedDownload = $state<number | undefined>(undefined);
  let lockedUpload = $state<number | undefined>(undefined);

  let gaugeMax = $state(100);
  $effect(() => {
    if (mbps > gaugeMax) gaugeMax = nextGaugeMax(mbps);
  });
  function nextGaugeMax(v: number): number {
    for (const cap of [50, 100, 250, 500, 1000, 2500, 5000]) {
      if (v <= cap) return cap;
    }
    return Math.ceil(v / 1000) * 1000;
  }

  $effect(() => {
    if (phase === 'download' && mbps > 0) {
      lockedDownload = mbps;
    } else if (phase === 'upload' && mbps > 0) {
      lockedUpload = mbps;
    }
  });

  const disposers: Array<() => Promise<void>> = [];

  async function subscribeAll(stateService: ExtensionStateProxy) {
    disposers.push(
      await stateService.subscribe('phase', (v) => {
        phase = (typeof v === 'string' ? v : 'idle') as Phase;
        if (phase === 'error') runState = 'error';
      }),
    );
    disposers.push(
      await stateService.subscribe('mbps', (v) => {
        mbps = typeof v === 'number' ? v : 0;
      }),
    );
    disposers.push(
      await stateService.subscribe('meta', (v) => {
        meta = v && typeof v === 'object' ? (v as Meta) : null;
      }),
    );
  }

  async function start() {
    runState = 'running';
    errorMsg = null;
    mbps = 0;
    lockedDownload = undefined;
    lockedUpload = undefined;
    try {
      final = await context.request<TestResult>('runTest', {}, { timeoutMs: 90_000 });
      runState = 'done';
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Speed test failed.';
      runState = 'error';
    }
  }

  async function cancel() {
    try {
      await context.request('cancelTest', {});
    } catch {
      /* ignore */
    }
    runState = 'idle';
  }

  function looksLikeValidResult(v: unknown): v is TestResult {
    if (!v || typeof v !== 'object') return false;
    const r = v as Partial<TestResult>;
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    if (typeof r.id !== 'string' || r.id.length === 0) return false;
    if (!finite(r.timestamp) || r.timestamp <= 0) return false;
    if (!finite(r.downloadMbps)) return false;
    if (!finite(r.uploadMbps)) return false;
    if (!finite(r.pingMs)) return false;
    if (!finite(r.jitterMs)) return false;
    if (typeof r.verdict !== 'string') return false;
    const s = r.server as Meta | undefined;
    if (!s || typeof s !== 'object') return false;
    if (typeof s.colo !== 'string' || s.colo.length === 0) return false;
    if (typeof s.isp !== 'string' || s.isp.length === 0) return false;
    return true;
  }

  function clipboardTextItem(content: string) {
    return {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: ClipboardItemType.Text,
      content,
      createdAt: Date.now(),
      favorite: false,
    };
  }

  function valueLabel(): string {
    if (phase === 'latency') return mbps > 0 ? mbps.toFixed(0) : '—';
    return formatMbps(mbps);
  }

  function valueUnit(): string {
    return phase === 'latency' ? 'ms' : 'Mbps';
  }

  let verdict = $derived(final ? scoreQuality(final) : null);

  function handleWindowKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      void start();
    } else if (
      ((event.metaKey || event.ctrlKey) && event.key === '.') ||
      (event.key === 'Escape' && runState === 'running')
    ) {
      event.preventDefault();
      void cancel();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      if (final && runState === 'done') {
        event.preventDefault();
        void clipboard.writeToClipboard(clipboardTextItem(formatSummary(final)));
      }
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      void interop.launchCommand(extensionId, 'history');
    } else if (event.key === 'Enter' && runState !== 'running') {
      event.preventDefault();
      void start();
    }
  }

  function handleHostMessage(event: MessageEvent): void {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'asyar:view:keydown') return;
    const payload = data.payload as
      { key?: string; metaKey?: boolean; ctrlKey?: boolean } | undefined;
    const key = payload?.key;
    const metaPressed = payload?.metaKey || payload?.ctrlKey;
    if (metaPressed && key?.toLowerCase() === 'r') {
      void start();
    } else if (metaPressed && key === '.') {
      void cancel();
    } else if (metaPressed && key?.toLowerCase() === 'c') {
      if (final && runState === 'done') {
        void clipboard.writeToClipboard(clipboardTextItem(formatSummary(final)));
      }
    } else if (metaPressed && key?.toLowerCase() === 'h') {
      void interop.launchCommand(extensionId, 'history');
    } else if (key === 'Enter' && runState !== 'running') {
      void start();
    }
  }

  onMount(async () => {
    window.addEventListener('keydown', handleWindowKeydown);
    window.addEventListener('message', handleHostMessage);

    const stateService = context.getService<ExtensionStateProxy>('state');
    await subscribeAll(stateService);

    const last = await stateService.get('lastResult');
    if (looksLikeValidResult(last)) {
      final = last;
      runState = 'done';
    } else {
      void start();
    }

    // View-context actions registered with the host ActionService (for ⌘K drawer)
    actions.registerAction({
      id: `${extensionId}.view.retest`,
      title: 'Retest',
      shortcut: '⌘R',
      category: 'Test',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => {
        void start();
      },
    });
    actions.registerAction({
      id: `${extensionId}.view.cancel`,
      title: 'Cancel test',
      shortcut: '⌘.',
      category: 'Test',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => {
        void cancel();
      },
    });
    actions.registerAction({
      id: `${extensionId}.view.copy-summary`,
      title: 'Copy summary',
      shortcut: '⌘C',
      category: 'Test',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        if (!final) return;
        await clipboard.writeToClipboard(clipboardTextItem(formatSummary(final)));
        try {
          await feedback?.showHUD('Copied summary');
        } catch {
          /* ignore */
        }
      },
    });
    actions.registerAction({
      id: `${extensionId}.view.open-history`,
      title: 'History',
      shortcut: '⌘H',
      category: 'Test',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => {
        void interop.launchCommand(extensionId, 'history');
      },
    });
  });

  onDestroy(async () => {
    window.removeEventListener('keydown', handleWindowKeydown);
    window.removeEventListener('message', handleHostMessage);
    actions.unregisterAction(`${extensionId}.view.retest`);
    actions.unregisterAction(`${extensionId}.view.cancel`);
    actions.unregisterAction(`${extensionId}.view.copy-summary`);
    actions.unregisterAction(`${extensionId}.view.open-history`);
    for (const d of disposers) {
      try {
        await d();
      } catch {
        /* ignore */
      }
    }
  });
</script>

<div class="testview">
  {#if runState === 'running'}
    <div class="active-container">
      <SpeedGauge value={mbps} max={gaugeMax} {phase} label={valueLabel()} unit={valueUnit()} />

      <PhaseList
        currentPhase={phase}
        pingMs={final?.pingMs}
        jitterMs={final?.jitterMs}
        downloadMbps={phase === 'download' ? mbps : (lockedDownload ?? final?.downloadMbps)}
        uploadMbps={phase === 'upload' ? mbps : (lockedUpload ?? final?.uploadMbps)}
      />

      <div class="meta-row">
        {#if meta}
          <span class="meta-pill">Cloudflare • {meta.colo} • {meta.isp}</span>
        {:else}
          <span class="meta-pill">Cloudflare edge node • Initializing…</span>
        {/if}
      </div>
    </div>
  {:else if runState === 'done' && final && verdict}
    <div class="result-container">
      <ResultCard result={final} {verdict} />
    </div>
  {:else if runState === 'error'}
    <div class="error-container">
      <div class="error-badge">Speed test interrupted</div>
      {#if errorMsg}
        <p class="error-reason">{errorMsg}</p>
      {/if}
      <button class="retry-btn" onclick={start}>
        <kbd>⏎</kbd> <span>Run speed test</span>
      </button>
    </div>
  {:else}
    <div class="idle-container">
      <button class="retry-btn" onclick={start}>
        <kbd>⏎</kbd> <span>Run speed test</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .testview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100%;
    padding: var(--space-4);
    box-sizing: border-box;
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
  }

  .active-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
  }

  .result-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .meta-row {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .meta-pill {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 500;
  }

  .error-container,
  .idle-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-6);
    background-color: var(--bg-secondary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-lg);
    width: 100%;
    box-sizing: border-box;
    text-align: center;
  }

  .error-badge {
    color: var(--accent-danger);
    font-size: var(--font-size-base);
    font-weight: 600;
  }

  .error-reason {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .retry-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--dur-instant) var(--ease-travel);
  }

  .retry-btn:hover {
    background: var(--bg-hover);
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-primary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-xs);
    line-height: 1;
  }
</style>
