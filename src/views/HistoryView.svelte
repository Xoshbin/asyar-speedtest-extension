<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ClipboardItemType,
    ActionContext,
    type IActionService,
    type IClipboardHistoryService,
    type IInteropService,
    type IFeedbackService,
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
    feedback?: IFeedbackService;
    extensionId: string;
  }
  let { context, actions, clipboard, interop, feedback, extensionId }: Props = $props();

  let entries = $state<HistoryEntry[]>([]);
  let focusedId = $state<string | null>(null);
  let metric = $state<'download' | 'upload' | 'ping'>('download');
  let listEl = $state<HTMLElement | undefined>(undefined);

  let focused = $derived(entries.find((e) => e.id === focusedId) ?? null);
  let focusedVerdict = $derived(focused ? scoreQuality(focused) : null);

  function isValidEntry(e: unknown): e is HistoryEntry {
    if (!e || typeof e !== 'object') return false;
    const r = e as Partial<HistoryEntry>;
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
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

  // Visible list shows newest first; single source of truth for keyboard navigation.
  let visibleEntries = $derived(entries.slice().reverse());

  async function reload() {
    const raw = await context.request<unknown>('getHistory', {});
    entries = Array.isArray(raw) ? raw.filter(isValidEntry) : [];
    if (entries.length > 0 && !entries.find((e) => e.id === focusedId)) {
      focusedId = entries[entries.length - 1].id;
    } else if (entries.length === 0) {
      focusedId = null;
    }
  }

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
    const currentIdx = focusedId ? visibleEntries.findIndex((e) => e.id === focusedId) : -1;
    const nextIdx =
      currentIdx < 0
        ? direction === 1
          ? 0
          : visibleEntries.length - 1
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
    else if (key === 'Enter') void interop.launchCommand(extensionId, 'test');
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void interop.launchCommand(extensionId, 'test');
    }
  }

  function dotColor(v: TestResult['verdict']): string {
    switch (v) {
      case 'excellent':
      case 'good':
        return 'var(--accent-success)';
      case 'fair':
        return 'var(--accent-warning)';
      default:
        return 'var(--accent-danger)';
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

  onMount(async () => {
    window.addEventListener('message', handleHostMessage);
    window.addEventListener('keydown', handleWindowKeydown);
    await reload();

    // View-context actions for the ⌘K drawer while HistoryView is mounted.
    actions.registerAction({
      id: `${extensionId}.view.retest`,
      title: 'Retest',
      shortcut: '⌘R',
      category: 'Test',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => {
        void interop.launchCommand(extensionId, 'test');
      },
    });
    actions.registerAction({
      id: `${extensionId}.view.copy-entry`,
      title: 'Copy summary',
      shortcut: '⌘C',
      category: 'Entry',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        if (!focusedId) return;
        const r = await context.request<{ summary: string } | null>('copyEntry', { id: focusedId });
        if (r) {
          await clipboard.writeToClipboard(clipboardTextItem(r.summary));
          try {
            await feedback?.showHUD('Copied summary');
          } catch {
            /* ignore */
          }
        }
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
    window.removeEventListener('keydown', handleWindowKeydown);
    actions.unregisterAction(`${extensionId}.view.retest`);
    actions.unregisterAction(`${extensionId}.view.copy-entry`);
    actions.unregisterAction(`${extensionId}.view.delete-entry`);
    actions.unregisterAction(`${extensionId}.view.clear-all`);
  });
</script>

<div class="history-view">
  {#if entries.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📊</div>
      <p class="empty-title">No speed tests recorded yet</p>
      <p class="empty-subtitle">Run a test to start tracking connection telemetry trends.</p>
      <button class="run-btn" onclick={() => interop.launchCommand(extensionId, 'test')}>
        <kbd>⏎</kbd> Run speed test
      </button>
    </div>
  {:else}
    <div class="split-layout">
      <!-- Left History List (38px row rhythm) -->
      <aside class="history-list custom-scrollbar" bind:this={listEl}>
        <div class="list-header">Past tests ({visibleEntries.length})</div>
        {#each visibleEntries as e (e.id)}
          <button
            class="entry-row"
            class:selected={e.id === focusedId}
            data-entry-id={e.id}
            onclick={() => {
              focusedId = e.id;
              ensureSelectedVisible();
            }}
          >
            <span class="status-pip" style="background-color: {dotColor(e.verdict)}"></span>
            <div class="row-content">
              <div class="row-primary">
                <span class="throughput-summary">
                  <span class="dl-stat">↓ {formatMbps(e.downloadMbps)}</span>
                  <span class="stat-sep">•</span>
                  <span class="ul-stat">↑ {formatMbps(e.uploadMbps)}</span>
                </span>
                <span class="timestamp">{formatRelativeTime(e.timestamp)}</span>
              </div>
              <div class="row-secondary">
                <span class="server-node">{e.server.colo} ({e.server.isp})</span>
                <span class="ping-stat">{formatMs(e.pingMs)} ms</span>
              </div>
            </div>
          </button>
        {/each}
      </aside>

      <!-- Right Detail Pane: Trend Chart & Result Dashboard -->
      <section class="detail-pane custom-scrollbar">
        <!-- Trend Chart Section -->
        <div class="chart-panel">
          <div class="chart-header">
            <span class="panel-title">Telemetry trend</span>
            <div class="metric-tabs">
              <button
                class="tab-btn"
                class:active={metric === 'download'}
                onclick={() => (metric = 'download')}
              >
                Download
              </button>
              <button
                class="tab-btn"
                class:active={metric === 'upload'}
                onclick={() => (metric = 'upload')}
              >
                Upload
              </button>
              <button
                class="tab-btn"
                class:active={metric === 'ping'}
                onclick={() => (metric = 'ping')}
              >
                Ping
              </button>
            </div>
          </div>
          <TrendChart series={entries} selectedId={focusedId} {metric} />
        </div>

        <!-- Selected Result Card -->
        {#if focused && focusedVerdict}
          <ResultCard result={focused} verdict={focusedVerdict} />
        {:else}
          <div class="no-selection">
            <p>Select a past test from the list.</p>
          </div>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .history-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: var(--space-7);
    text-align: center;
  }

  .empty-icon {
    font-size: 2.5rem;
    margin-bottom: var(--space-2);
  }

  .empty-title {
    color: var(--text-primary);
    font-size: var(--font-size-base);
    font-weight: 600;
    margin: 0;
  }

  .empty-subtitle {
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-4) 0;
  }

  .run-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--dur-instant) var(--ease-travel);
  }

  .run-btn:hover {
    background: var(--bg-hover);
  }

  .split-layout {
    display: grid;
    grid-template-columns: 290px 1fr;
    gap: var(--space-3);
    flex: 1;
    min-height: 0;
    padding: var(--space-3);
    overflow: hidden;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow-y: auto;
    padding-right: var(--space-1);
    border-right: 1px solid var(--separator);
  }

  .list-header {
    padding: var(--space-1) var(--space-2) var(--space-2);
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
    font-weight: 500;
    letter-spacing: var(--tracking-normal);
  }

  .entry-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--shell-row-h);
    min-height: var(--shell-row-h);
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    font: inherit;
    transition: background-color var(--dur-instant) var(--ease-travel);
    user-select: none;
    width: 100%;
    box-sizing: border-box;
  }

  .entry-row:hover {
    background-color: var(--bg-hover);
  }

  .entry-row.selected {
    background-color: var(--bg-selected);
  }

  .status-pip {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .row-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }

  .row-primary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .throughput-summary {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .dl-stat {
    color: var(--text-primary);
  }

  .ul-stat {
    color: var(--text-secondary);
  }

  .stat-sep {
    color: var(--separator);
    font-size: var(--font-size-2xs);
  }

  .timestamp {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    font-weight: 500;
    white-space: nowrap;
  }

  .row-secondary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .server-node {
    color: var(--text-tertiary);
    font-size: var(--font-size-2xs);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ping-stat {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .detail-pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    overflow-y: auto;
    padding-right: var(--space-1);
  }

  .chart-panel {
    background-color: var(--bg-secondary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .panel-title {
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 500;
  }

  .metric-tabs {
    display: flex;
    gap: 4px;
    background-color: var(--bg-tertiary);
    padding: 2px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--separator);
  }

  .tab-btn {
    background: transparent;
    border: 0;
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 500;
    padding: 2px var(--space-2);
    border-radius: var(--radius-xs);
    cursor: pointer;
    transition: all var(--dur-instant) var(--ease-travel);
  }

  .tab-btn:hover {
    color: var(--text-primary);
  }

  .tab-btn.active {
    background-color: var(--bg-secondary);
    color: var(--text-primary);
    font-weight: 600;
    box-shadow: var(--shadow-xs);
  }

  .no-selection {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: var(--radius-full);
  }
</style>
