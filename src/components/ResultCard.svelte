<script lang="ts">
  import type { TestResult, QualityReport } from '../lib/types';
  import { formatMbps, formatMs, formatRelativeTime } from '../lib/format';

  interface Props {
    result: TestResult;
    verdict: QualityReport;
  }
  let { result, verdict }: Props = $props();

  interface ActivityRating {
    name: string;
    grade: string;
    color: string;
  }

  let activities = $derived<ActivityRating[]>([
    {
      name: '4K video streaming',
      grade:
        result.downloadMbps >= 50
          ? 'Great'
          : result.downloadMbps >= 25
            ? 'Good'
            : result.downloadMbps >= 10
              ? 'Fair'
              : 'Poor',
      color:
        result.downloadMbps >= 25
          ? 'var(--accent-success)'
          : result.downloadMbps >= 10
            ? 'var(--accent-warning)'
            : 'var(--accent-danger)',
    },
    {
      name: 'Online gaming',
      grade:
        result.pingMs <= 30 && result.jitterMs <= 10
          ? 'Great'
          : result.pingMs <= 60 && result.jitterMs <= 25
            ? 'Good'
            : result.pingMs <= 100
              ? 'Fair'
              : 'Poor',
      color:
        result.pingMs <= 60 && result.jitterMs <= 25
          ? 'var(--accent-success)'
          : result.pingMs <= 100
            ? 'var(--accent-warning)'
            : 'var(--accent-danger)',
    },
    {
      name: 'Video conferencing',
      grade:
        result.uploadMbps >= 10 && result.pingMs <= 50
          ? 'Excellent'
          : result.uploadMbps >= 3.8 && result.pingMs <= 100
            ? 'Good'
            : result.uploadMbps >= 1.5
              ? 'Fair'
              : 'Poor',
      color:
        result.uploadMbps >= 3.8 && result.pingMs <= 100
          ? 'var(--accent-success)'
          : result.uploadMbps >= 1.5
            ? 'var(--accent-warning)'
            : 'var(--accent-danger)',
    },
  ]);

  let verdictAccent = $derived.by(() => {
    switch (verdict.verdict) {
      case 'excellent':
      case 'good':
        return 'var(--accent-success)';
      case 'fair':
        return 'var(--accent-warning)';
      default:
        return 'var(--accent-danger)';
    }
  });

  let verdictBadge = $derived.by(() => {
    switch (verdict.verdict) {
      case 'excellent':
        return 'Excellent connection';
      case 'good':
        return 'Good connection';
      case 'fair':
        return 'Fair connection';
      default:
        return 'Slow connection';
    }
  });
</script>

<div class="result-card">
  <!-- Hero Metrics Grid -->
  <div class="metrics-grid">
    <!-- Download Stat Tile -->
    <div class="stat-tile">
      <div class="tile-header">
        <span class="tile-pip dl" aria-hidden="true"></span>
        <span class="tile-label">Download</span>
      </div>
      <div class="tile-value-row">
        <span class="tile-value">{formatMbps(result.downloadMbps)}</span>
        <span class="tile-unit">Mbps</span>
      </div>
    </div>

    <!-- Upload Stat Tile -->
    <div class="stat-tile">
      <div class="tile-header">
        <span class="tile-pip ul" aria-hidden="true"></span>
        <span class="tile-label">Upload</span>
      </div>
      <div class="tile-value-row">
        <span class="tile-value">{formatMbps(result.uploadMbps)}</span>
        <span class="tile-unit">Mbps</span>
      </div>
    </div>

    <!-- Ping & Jitter Stat Tile -->
    <div class="stat-tile">
      <div class="tile-header">
        <span class="tile-pip ping" aria-hidden="true"></span>
        <span class="tile-label">Ping & jitter</span>
      </div>
      <div class="tile-value-row">
        <span class="tile-value">{formatMs(result.pingMs)}</span>
        <span class="tile-unit">ms</span>
        <span class="jitter-detail">({formatMs(result.jitterMs)} ms jitter)</span>
      </div>
    </div>
  </div>

  <!-- Quality Assessment & Verdict -->
  <div class="verdict-section">
    <div class="verdict-header">
      <span
        class="verdict-chip"
        style="background: color-mix(in srgb, {verdictAccent} 12%, transparent); color: {verdictAccent}; border-color: color-mix(in srgb, {verdictAccent} 24%, transparent);"
      >
        {verdictBadge}
      </span>
      <div class="headline">{verdict.headline}</div>
    </div>

    <!-- Capability Assessment Pills -->
    <div class="activities-grid">
      {#each activities as act (act.name)}
        <div class="activity-tile">
          <span class="activity-name">{act.name}</span>
          <span
            class="grade-pill"
            style="background: color-mix(in srgb, {act.color} 12%, transparent); color: {act.color}; border-color: color-mix(in srgb, {act.color} 24%, transparent);"
          >
            {act.grade}
          </span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Server & Timestamp Metadata -->
  <div class="meta-strip">
    <span class="meta-text">
      Cloudflare • {result.server?.colo ?? '—'} • {result.server?.isp ?? '—'} • {formatRelativeTime(
        result.timestamp,
      )}
    </span>
  </div>
</div>

<style>
  .result-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    background-color: var(--bg-secondary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-lg);
    width: 100%;
    box-sizing: border-box;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
  }

  .stat-tile {
    background-color: var(--bg-tertiary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .tile-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .tile-pip {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .tile-pip.dl {
    background-color: var(--accent-primary);
  }

  .tile-pip.ul {
    background-color: var(--accent-success);
  }

  .tile-pip.ping {
    background-color: var(--accent-warning);
  }

  .tile-label {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
    font-weight: 500;
    line-height: 1;
  }

  .tile-value-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .tile-value {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-2xl);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    letter-spacing: var(--tracking-tight);
  }

  .tile-unit {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 500;
  }

  .jitter-detail {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    font-weight: 500;
    white-space: nowrap;
  }

  .verdict-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    background-color: var(--bg-tertiary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-lg);
  }

  .verdict-header {
    display: flex;
    align-items: center;
    gap: var(--space-2-5, var(--space-3));
    flex-wrap: wrap;
  }

  .verdict-chip {
    display: inline-flex;
    align-items: center;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: 600;
    border: 1px solid transparent;
    line-height: 1.2;
    white-space: nowrap;
  }

  .headline {
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    line-height: 1.3;
  }

  .activities-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  .activity-tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-2-5, var(--space-2));
    background-color: var(--bg-secondary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-md);
  }

  .activity-name {
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .grade-pill {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    padding: 1px 6px;
    border-radius: var(--radius-full);
    font-size: var(--font-size-2xs);
    font-weight: 600;
    border: 1px solid transparent;
    line-height: 1.3;
  }

  .meta-strip {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .meta-text {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 500;
  }
</style>
