<script lang="ts">
  import type { HistoryEntry } from '../lib/types';

  interface Props {
    series: HistoryEntry[];
    selectedId?: string | null;
    metric: 'download' | 'upload' | 'ping';
  }
  let { series, selectedId = null, metric }: Props = $props();

  const W = 460;
  const H = 120;
  const PAD_X = 16;
  const PAD_Y = 16;

  let pts = $derived(
    series.map((e) =>
      metric === 'download' ? e.downloadMbps : metric === 'upload' ? e.uploadMbps : e.pingMs,
    ),
  );

  let max = $derived(pts.length === 0 ? 1 : Math.max(...pts, 1));
  let min = $derived(pts.length === 0 ? 0 : Math.min(...pts));

  let strokeColor = $derived(
    metric === 'download'
      ? 'var(--accent-primary)'
      : metric === 'upload'
        ? 'var(--accent-success)'
        : 'var(--accent-warning)',
  );

  function xy(i: number, v: number): { x: number; y: number } {
    const x = pts.length <= 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (pts.length - 1);
    const usableH = H - 2 * PAD_Y;
    const y = H - PAD_Y - (v / max) * usableH;
    return { x, y };
  }

  let linePath = $derived(
    pts
      .map((v, i) => {
        const { x, y } = xy(i, v);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' '),
  );

  let areaPath = $derived.by(() => {
    if (pts.length <= 1) return '';
    const first = xy(0, pts[0]);
    const last = xy(pts.length - 1, pts[pts.length - 1]);
    const bottomY = H - PAD_Y;
    return `${linePath} L ${last.x.toFixed(1)},${bottomY} L ${first.x.toFixed(1)},${bottomY} Z`;
  });
</script>

{#if series.length === 0}
  <div class="empty">No test history recorded yet</div>
{:else}
  <div class="chart-container">
    <svg width={W} height={H} viewBox="0 0 {W} {H}" class="chart-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkline-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color={strokeColor} stop-opacity="0.25" />
          <stop offset="100%" stop-color={strokeColor} stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Horizontal grid baseline -->
      <line
        x1={PAD_X}
        y1={H - PAD_Y}
        x2={W - PAD_X}
        y2={H - PAD_Y}
        stroke="var(--separator)"
        stroke-width="1"
      />

      <!-- Subtle mid-guideline -->
      <line
        x1={PAD_X}
        y1={H / 2}
        x2={W - PAD_X}
        y2={H / 2}
        stroke="var(--divider-soft)"
        stroke-dasharray="2 4"
        stroke-width="1"
      />

      <!-- Area fill -->
      {#if areaPath}
        <path d={areaPath} fill="url(#sparkline-gradient)" />
      {/if}

      <!-- Sparkline stroke -->
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      />

      <!-- Data point pips -->
      {#each pts as v, i (series[i].id)}
        {@const p = xy(i, v)}
        {@const isSelected = series[i].id === selectedId}

        {#if isSelected}
          <!-- Highlight halo for selected item -->
          <circle
            cx={p.x}
            cy={p.y}
            r="8"
            fill="none"
            stroke={strokeColor}
            stroke-width="1.5"
            opacity="0.4"
          />
        {/if}

        <circle
          cx={p.x}
          cy={p.y}
          r={isSelected ? 4 : 2.5}
          fill={isSelected ? 'var(--bg-popup)' : strokeColor}
          stroke={isSelected ? strokeColor : 'none'}
          stroke-width={isSelected ? 2 : 0}
        />
      {/each}
    </svg>
  </div>
{/if}

<style>
  .chart-container {
    width: 100%;
    overflow: hidden;
  }

  .chart-svg {
    display: block;
    width: 100%;
    height: 120px;
  }

  .empty {
    padding: var(--space-5);
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
    text-align: center;
    font-weight: 500;
  }
</style>
