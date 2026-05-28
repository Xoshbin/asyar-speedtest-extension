<script lang="ts">
  import type { Phase } from '../lib/types';
  import { formatMbps, formatMs } from '../lib/format';

  interface Props {
    currentPhase: Phase;
    pingMs?: number;
    downloadMbps?: number;
    uploadMbps?: number;
  }
  let { currentPhase, pingMs, downloadMbps, uploadMbps }: Props = $props();

  type RowId = 'latency'|'download'|'upload';
  type RowState = 'pending'|'active'|'done';
  type Row = { id: RowId; label: string; value: string; state: RowState };

  const ORDER: RowId[] = ['latency', 'download', 'upload'];
  function stateOf(id: RowId): RowState {
    if (currentPhase === 'done' || currentPhase === 'error') return 'done';
    const idx = ORDER.indexOf(id);
    const cur = ORDER.indexOf(currentPhase as RowId);
    if (cur < 0) return 'pending';
    if (idx < cur) return 'done';
    if (idx === cur) return 'active';
    return 'pending';
  }
  function valueOf(id: RowId): string {
    if (id === 'latency')  return pingMs       === undefined ? '—' : `${formatMs(pingMs)} ms`;
    if (id === 'download') return downloadMbps === undefined ? '—' : `${formatMbps(downloadMbps)} Mbps`;
    return uploadMbps === undefined ? '—' : `${formatMbps(uploadMbps)} Mbps`;
  }

  let rows = $derived<Row[]>([
    { id: 'latency',  label: 'Ping',     value: valueOf('latency'),  state: stateOf('latency')  },
    { id: 'download', label: 'Download', value: valueOf('download'), state: stateOf('download') },
    { id: 'upload',   label: 'Upload',   value: valueOf('upload'),   state: stateOf('upload')   },
  ]);
</script>

<ul class="phase-list">
  {#each rows as r (r.id)}
    <li class="row" data-state={r.state}>
      <span class="dot" aria-hidden="true"></span>
      <span class="label">{r.label}</span>
      <span class="value">{r.value}</span>
    </li>
  {/each}
</ul>

<style>
  .phase-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .row {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
  .row[data-state="active"] {
    color: var(--text-primary);
    background-color: var(--bg-hover);
  }
  .row[data-state="done"] {
    color: var(--text-primary);
  }
  .dot {
    width: 8px; height: 8px;
    border-radius: var(--radius-full);
    background-color: var(--text-tertiary);
  }
  .row[data-state="active"] .dot { background-color: var(--accent-primary); }
  .row[data-state="done"]   .dot { background-color: var(--accent-success); }
  .value { font-variant-numeric: tabular-nums; }
</style>
