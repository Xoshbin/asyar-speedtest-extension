<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ClipboardItemType,
    ActionContext,
    type IActionService,
    type IClipboardHistoryService,
    type IInteropService,
  } from 'asyar-sdk/contracts';
  import type { HistoryEntry, TestResult } from '../lib/types';
  import { formatMbps, formatMs, formatRelativeTime } from '../lib/format';
  import { scoreQuality } from '../lib/quality';
  import TrendChart from '../components/TrendChart.svelte';
  import ResultCard from '../components/ResultCard.svelte';

  interface ContextLike {
    request<T = unknown>(id: string, payload?: unknown, opts?: { timeoutMs?: number }): Promise<T>;
  }

  interface Props {
    context: ContextLike;
    actions: IActionService;
    clipboard: IClipboardHistoryService;
    interop: IInteropService;
    extensionId: string;
  }
  let { context, actions, clipboard, interop, extensionId }: Props = $props();

  let entries     = $state<HistoryEntry[]>([]);
  let focusedId   = $state<string | null>(null);
  let metric      = $state<'download'|'upload'|'ping'>('download');

  let focused = $derived(entries.find(e => e.id === focusedId) ?? null);
  let focusedVerdict = $derived(focused ? scoreQuality(focused) : null);

  function isValidEntry(e: unknown): e is HistoryEntry {
    if (!e || typeof e !== 'object') return false;
    const r = e as Partial<HistoryEntry>;
    const finite = (n: unknown): n is number =>
      typeof n === 'number' && Number.isFinite(n);
    if (typeof r.id !== 'string' || r.id.length === 0) return false;
    if (!finite(r.timestamp) || r.timestamp <= 0) return false;
    if (!finite(r.downloadMbps)) return false;
    if (!finite(r.uploadMbps)) return false;
    if (!finite(r.pingMs)) return false;
    if (!finite(r.jitterMs)) return false;
    if (typeof r.verdict !== 'string') return false;
    if (!r.server || typeof r.server !== 'object') return false;
    if (typeof r.server.colo !== 'string' || r.server.colo.length === 0) return false;
    if (typeof r.server.isp !== 'string' || r.server.isp.length === 0) return false;
    return true;
  }

  // The visible list shows newest first; this derived view is the single
  // source of truth for keyboard navigation order, so ArrowUp/ArrowDown
  // walk it directly instead of `entries`.
  let visibleEntries = $derived(entries.slice().reverse());

  async function reload() {
    // Always pass `{}` — Tauri's `state_rpc_request` command requires the
    // `payload` key to be present, and the SDK strips `undefined` during JSON
    // serialisation if omitted.
    const raw = await context.request<unknown>('getHistory', {});
    entries = Array.isArray(raw) ? raw.filter(isValidEntry) : [];
    if (entries.length > 0 && !entries.find(e => e.id === focusedId)) {
      focusedId = entries[entries.length - 1].id;
    } else if (entries.length === 0) {
      focusedId = null;
    }
  }

  let listEl: HTMLElement | undefined;

  function ensureSelectedVisible(): void {
    requestAnimationFrame(() => {
      if (!listEl || !focusedId) return;
      const el = listEl.querySelector(`[data-entry-id="${focusedId}"]`);
      if (el && 'scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    });
  }

  function moveSelection(direction: 1 | -1): void {
    if (visibleEntries.length === 0) return;
    const currentIdx = focusedId
      ? visibleEntries.findIndex(e => e.id === focusedId)
      : -1;
    const nextIdx = currentIdx < 0
      ? (direction === 1 ? 0 : visibleEntries.length - 1)
      : Math.max(0, Math.min(visibleEntries.length - 1, currentIdx + direction));
    focusedId = visibleEntries[nextIdx].id;
    ensureSelectedVisible();
  }

  function handleHostMessage(event: MessageEvent): void {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'asyar:view:keydown') return;
    const key = (data.payload as { key?: string } | undefined)?.key;
    if (key === 'ArrowDown') moveSelection(1);
    else if (key === 'ArrowUp') moveSelection(-1);
  }

  function dotColor(v: TestResult['verdict']): string {
    switch (v) {
      case 'excellent': return 'var(--accent-success)';
      case 'good':      return 'var(--accent-primary)';
      case 'fair':      return 'var(--accent-warning)';
      default:          return 'var(--accent-danger)';
    }
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

  const VIEW_ACTION_IDS = [
    `${extensionId}.view.retest`,
    `${extensionId}.view.copy-entry`,
    `${extensionId}.view.delete-entry`,
    `${extensionId}.view.clear-all`,
  ];

  onMount(async () => {
    window.addEventListener('message', handleHostMessage);
    await reload();

    // View-context actions for the ⌘K drawer while HistoryView is mounted.
    actions.registerAction({
      id: `${extensionId}.view.retest`,
      title: 'Run a test',
      shortcut: '⌘R',
      category: 'Entry',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => { void interop.launchCommand(extensionId, 'test'); },
    });
    actions.registerAction({
      id: `${extensionId}.view.copy-entry`,
      title: 'Copy entry',
      shortcut: '⌘C',
      category: 'Entry',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        if (!focusedId) return;
        const r = await context.request<{ summary: string } | null>('copyEntry', { id: focusedId });
        if (r) await clipboard.writeToClipboard(clipboardTextItem(r.summary));
      },
    });
    actions.registerAction({
      id: `${extensionId}.view.delete-entry`,
      title: 'Delete entry',
      shortcut: '⌘⌫',
      category: 'Entry',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      destructive: true,
      execute: async () => {
        if (!focusedId) return;
        await context.request('deleteEntry', { id: focusedId });
        focusedId = null;
        await reload();
      },
    });
    actions.registerAction({
      id: `${extensionId}.view.clear-all`,
      title: 'Clear all history',
      category: 'Entry',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      destructive: true,
      execute: async () => {
        await context.request('clearHistory', {});
        focusedId = null;
        await reload();
      },
    });
  });

  onDestroy(() => {
    window.removeEventListener('message', handleHostMessage);
    for (const id of VIEW_ACTION_IDS) {
      try { actions.unregisterAction(id); } catch { /* ignore */ }
    }
  });
</script>

<div class="history">
  {#if entries.length === 0}
    <div class="empty">
      <p>No tests yet.</p>
    </div>
  {:else}
    <div class="split">
      <aside class="list custom-scrollbar" bind:this={listEl}>
        {#each visibleEntries as e (e.id)}
          <button
            class="entry"
            class:selected={e.id === focusedId}
            data-entry-id={e.id}
            onclick={() => { focusedId = e.id; ensureSelectedVisible(); }}>
            <span class="dot" style="background-color: {dotColor(e.verdict)}"></span>
            <span class="title">{formatMbps(e.downloadMbps)} ↓ / {formatMbps(e.uploadMbps)} ↑</span>
            <span class="sub">
              {formatRelativeTime(e.timestamp)} · {e.server.colo} · {formatMs(e.pingMs)} ms
            </span>
          </button>
        {/each}
      </aside>
      <section class="detail custom-scrollbar">
        <div class="chart-row">
          <div class="tabs">
            <button class:active={metric === 'download'} onclick={() => metric = 'download'}>Download</button>
            <button class:active={metric === 'upload'}   onclick={() => metric = 'upload'}>Upload</button>
            <button class:active={metric === 'ping'}     onclick={() => metric = 'ping'}>Ping</button>
          </div>
          <TrendChart series={entries} selectedId={focusedId} {metric} />
        </div>
        {#if focused && focusedVerdict}
          <ResultCard result={focused} verdict={focusedVerdict} />
        {:else}
          <p class="hint">Select a test on the left.</p>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .history { height: 100%; }
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-7);
    color: var(--text-secondary);
  }
  .split {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: var(--space-3);
    height: 100%;
    padding: var(--space-3);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    overflow-y: auto;
    padding-right: var(--space-2);
  }
  .entry {
    display: grid;
    grid-template-columns: 10px 1fr;
    grid-template-rows: auto auto;
    gap: var(--space-1) var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .entry:hover { background-color: var(--bg-hover); }
  .entry.selected { background-color: var(--bg-selected); }
  .dot {
    grid-row: 1 / span 2;
    align-self: center;
    width: 8px; height: 8px;
    border-radius: var(--radius-full);
  }
  .title { font-size: var(--font-size-sm); font-variant-numeric: tabular-nums; }
  .sub   { color: var(--text-tertiary); font-size: var(--font-size-xs); }
  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    overflow-y: auto;
  }
  .chart-row {
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
  }
  .tabs {
    display: flex;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }
  .tabs button {
    background: transparent;
    border: 0;
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-xs);
    cursor: pointer;
  }
  .tabs button.active { background-color: var(--bg-hover); color: var(--text-primary); }
  .hint { color: var(--text-tertiary); }
</style>
