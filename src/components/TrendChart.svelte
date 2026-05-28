<script lang="ts">
  import type { HistoryEntry } from '../lib/types';

  interface Props {
    series: HistoryEntry[];
    selectedId?: string | null;
    metric: 'download' | 'upload' | 'ping';
  }
  let { series, selectedId = null, metric }: Props = $props();

  const W = 480;
  const H = 140;
  const PAD = 16;

  let pts = $derived(series.map(e =>
    metric === 'download' ? e.downloadMbps :
    metric === 'upload'   ? e.uploadMbps   :
                            e.pingMs,
  ));
  let max = $derived(pts.length === 0 ? 1 : Math.max(...pts, 1));
  let stroke = $derived(
    metric === 'download' ? 'var(--accent-primary)' :
    metric === 'upload'   ? 'var(--accent-success)' :
                            'var(--text-secondary)',
  );

  function xy(i: number, v: number) {
    const x = pts.length <= 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (pts.length - 1);
    const y = H - PAD - ((v / max) * (H - 2 * PAD));
    return { x, y };
  }

  let path = $derived(
    pts.map((v, i) => {
      const { x, y } = xy(i, v);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' '),
  );
</script>

{#if series.length === 0}
  <div class="empty">No history yet</div>
{:else}
  <svg width={W} height={H} viewBox="0 0 {W} {H}" class="chart">
    <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--separator)" />
    <path d={path} fill="none" stroke={stroke} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    {#each pts as v, i (series[i].id)}
      {@const p = xy(i, v)}
      <circle cx={p.x} cy={p.y} r={series[i].id === selectedId ? 4 : 2.5}
        fill={series[i].id === selectedId ? 'var(--accent-primary)' : stroke} />
    {/each}
  </svg>
{/if}

<style>
  .chart { display: block; width: 100%; height: auto; }
  .empty {
    padding: var(--space-4);
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
    text-align: center;
  }
</style>
