<script lang="ts">
  import type { TestResult, QualityReport } from '../lib/types';
  import { formatMbps, formatMs, formatRelativeTime } from '../lib/format';

  interface Props {
    result: TestResult;
    verdict: QualityReport;
  }
  let { result, verdict }: Props = $props();

  type Cap = { key: keyof QualityReport['capabilities']; ok: boolean; label: string };
  let allCaps = $derived<Cap[]>([
    { key: 'netflix4k',      ok: verdict.capabilities.netflix4k,      label: '4K Netflix · multiple streams' },
    { key: 'netflixHd',      ok: verdict.capabilities.netflixHd,      label: 'HD streaming' },
    { key: 'zoomHdGroup',    ok: verdict.capabilities.zoomHdGroup,    label: 'Zoom HD (group call)' },
    { key: 'zoomHd1on1',     ok: verdict.capabilities.zoomHd1on1,     label: 'Zoom HD (1-on-1)' },
    { key: 'onlineGaming',   ok: verdict.capabilities.onlineGaming,   label: 'Online gaming (low ping)' },
    { key: 'cloudBackup',    ok: verdict.capabilities.cloudBackup,    label: 'Cloud sync / backup' },
    { key: 'largeFileShare', ok: verdict.capabilities.largeFileShare, label: 'Large uploads' },
    { key: 'remoteDesktop',  ok: verdict.capabilities.remoteDesktop,  label: 'Remote desktop' },
  ]);
  let shown = $derived(allCaps.filter(c => c.ok).slice(0, 4));
</script>

<div class="result">
  <div class="numbers">
    <div class="cell">
      <div class="num-label">Ping</div>
      <div class="num-value">{formatMs(result.pingMs)} <span>ms</span></div>
    </div>
    <div class="cell">
      <div class="num-label">Download</div>
      <div class="num-value">{formatMbps(result.downloadMbps)} <span>Mbps</span></div>
    </div>
    <div class="cell">
      <div class="num-label">Upload</div>
      <div class="num-value">{formatMbps(result.uploadMbps)} <span>Mbps</span></div>
    </div>
  </div>

  <hr class="sep" />

  <div class="verdict" data-tier={verdict.verdict}>
    <div class="headline">{verdict.headline}</div>
  </div>

  {#if shown.length > 0}
    <ul class="caps">
      {#each shown as c (c.key)}
        <li>✓ {c.label}</li>
      {/each}
    </ul>
  {:else}
    <ul class="caps caps--warn">
      <li>✗ Connection too slow for video calls (upload too low)</li>
    </ul>
  {/if}

  <p class="meta">
    Cloudflare · {result.server?.colo ?? '—'} · {result.server?.isp ?? '—'} · {formatRelativeTime(result.timestamp)}
  </p>
</div>

<style>
  .result {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }
  .numbers {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
  }
  .num-label {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .num-value {
    color: var(--text-primary);
    font-size: var(--font-size-2xl);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .num-value span {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
  .sep { border: 0; border-top: 1px solid var(--separator); margin: 0; }
  .verdict { font-size: var(--font-size-lg); color: var(--text-primary); }
  .headline { font-weight: 500; }
  .caps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
  .caps--warn { color: var(--accent-warning); }
  .meta { color: var(--text-tertiary); font-size: var(--font-size-xs); margin: 0; }
</style>
