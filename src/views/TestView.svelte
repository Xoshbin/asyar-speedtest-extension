<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ClipboardItemType,
    ActionContext,
    type IActionService,
    type IClipboardHistoryService,
    type IInteropService,
    type ExtensionStateProxy,
  } from 'asyar-sdk/contracts';
  import type { Phase, TestResult, Meta } from '../lib/types';
  import { scoreQuality } from '../lib/quality';
  import { formatSummary, formatMbps } from '../lib/format';
  import SpeedGauge  from '../components/SpeedGauge.svelte';
  import PhaseList   from '../components/PhaseList.svelte';
  import ResultCard  from '../components/ResultCard.svelte';

  interface ContextLike {
    request<T = unknown>(id: string, payload?: unknown, opts?: { timeoutMs?: number }): Promise<T>;
    getService<T>(namespace: string): T;
  }

  interface Props {
    context: ContextLike;
    actions: IActionService;
    clipboard: IClipboardHistoryService;
    interop: IInteropService;
    extensionId: string;
  }
  let { context, actions, clipboard, interop, extensionId }: Props = $props();

  // NOTE: don't call this `state` — that identifier shadows Svelte 5's `$state`
  // rune detection and the compiler routes every `$state(...)` call through
  // this proxy at runtime, causing the view to never initialise.
  const stateService = context.getService<ExtensionStateProxy>('state');

  let runState  = $state<'idle'|'running'|'done'|'error'>('idle');
  let phase     = $state<Phase>('idle');
  let mbps      = $state(0);
  let meta      = $state<Meta | null>(null);
  let final     = $state<TestResult | null>(null);
  let errorMsg  = $state<string | null>(null);

  let gaugeMax  = $state(100);
  $effect(() => {
    if (mbps > gaugeMax) gaugeMax = nextGaugeMax(mbps);
  });
  function nextGaugeMax(v: number): number {
    for (const cap of [50, 100, 250, 500, 1000, 2500, 5000]) if (v <= cap) return cap;
    return Math.ceil(v / 1000) * 1000;
  }

  const disposers: Array<() => Promise<void>> = [];

  async function subscribeAll() {
    disposers.push(await stateService.subscribe('phase', (v) => {
      phase = (typeof v === 'string' ? v : 'idle') as Phase;
      if (phase === 'error') runState = 'error';
    }));
    disposers.push(await stateService.subscribe('mbps', (v) => {
      mbps = typeof v === 'number' ? v : 0;
    }));
    disposers.push(await stateService.subscribe('meta', (v) => {
      meta = (v && typeof v === 'object') ? v as Meta : null;
    }));
  }

  async function start() {
    runState = 'running';
    errorMsg = null;
    mbps = 0;
    try {
      final = await context.request<TestResult>('runTest', {}, { timeoutMs: 90_000 });
      runState = 'done';
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Speed test failed.';
      runState = 'error';
    }
  }

  async function cancel() {
    // Always pass a payload object — Tauri's `state_rpc_request` command
    // requires the `payload` key to be present, and the SDK strips `undefined`
    // during JSON serialisation if we omit it here.
    try { await context.request('cancelTest', {}); } catch { /* ignore */ }
    runState = 'idle';
  }

  function looksLikeValidResult(v: unknown): v is TestResult {
    if (!v || typeof v !== 'object') return false;
    const r = v as Partial<TestResult>;
    // typeof NaN === 'number', so we need Number.isFinite for the metric
    // fields — otherwise a stale entry full of NaNs passes the guard and
    // the view shows ghost data instead of running a fresh test.
    const finite = (n: unknown): n is number =>
      typeof n === 'number' && Number.isFinite(n);
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
    if (phase === 'latency') return mbps.toFixed(0);
    return formatMbps(mbps);
  }
  function valueUnit(): string {
    return phase === 'latency' ? 'ms' : 'Mbps';
  }

  let verdict = $derived(final ? scoreQuality(final) : null);

  onMount(async () => {
    await subscribeAll();
    const last = await stateService.get('lastResult');
    if (looksLikeValidResult(last)) {
      final = last;
      runState = 'done';
    } else {
      void start();
    }

    // View-context actions that show up in the launcher's ⌘K drawer while
    // this view is mounted. Each one is paired with an `unregisterAction`
    // in onDestroy so they don't leak to other views.
    actions.registerAction({
      id: `${extensionId}.view.rerun`,
      title: 'Run speed test',
      shortcut: '⌘R',
      category: 'Test',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => { void start(); },
    });
    actions.registerAction({
      id: `${extensionId}.view.cancel`,
      title: 'Cancel test',
      shortcut: '⌘.',
      category: 'Test',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => { void cancel(); },
    });
    actions.registerAction({
      id: `${extensionId}.view.copy-summary`,
      title: 'Copy result',
      shortcut: '⌘C',
      category: 'Test',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        if (!final) return;
        await clipboard.writeToClipboard(clipboardTextItem(formatSummary(final)));
      },
    });
    actions.registerAction({
      id: `${extensionId}.view.open-history`,
      title: 'Open history',
      shortcut: '⌘H',
      category: 'Test',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => { void interop.launchCommand(extensionId, 'history'); },
    });
  });

  onDestroy(async () => {
    for (const d of disposers) { try { await d(); } catch { /* ignore */ } }
    for (const id of [
      `${extensionId}.view.rerun`,
      `${extensionId}.view.cancel`,
      `${extensionId}.view.copy-summary`,
      `${extensionId}.view.open-history`,
    ]) {
      try { actions.unregisterAction(id); } catch { /* ignore */ }
    }
  });
</script>

<div class="testview">
  {#if runState === 'running'}
    <SpeedGauge value={mbps} max={gaugeMax} {phase} label={valueLabel()} unit={valueUnit()} />
    <PhaseList currentPhase={phase}
      pingMs={undefined}
      downloadMbps={phase === 'download' ? mbps : undefined}
      uploadMbps={phase === 'upload' ? mbps : undefined} />
    {#if meta}
      <p class="meta">Cloudflare · {meta.colo} · {meta.isp}</p>
    {/if}

  {:else if runState === 'done' && final && verdict}
    <ResultCard result={final} {verdict} />

  {:else if runState === 'error'}
    <div class="error">
      <p class="hint">Speed test failed.</p>
      {#if errorMsg}<p class="reason">{errorMsg}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .testview {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    align-items: center;
  }
  .error {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-6);
  }
  .hint   { color: var(--text-secondary); font-size: var(--font-size-base); margin: 0; }
  .reason { color: var(--accent-danger);  font-size: var(--font-size-sm);   margin: 0; }
  .meta   { color: var(--text-tertiary);  font-size: var(--font-size-xs);   margin: 0; }
</style>
