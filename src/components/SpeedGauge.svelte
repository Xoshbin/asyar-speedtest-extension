<script lang="ts">
  import type { Phase } from '../lib/types';

  interface Props {
    value: number;
    max: number;
    phase: Phase;
    label: string;
    unit?: string;
  }
  let { value, max, phase, label, unit = 'Mbps' }: Props = $props();

  const SIZE   = 220;
  const STROKE = 14;
  const RADIUS = (SIZE - STROKE) / 2;
  const C      = Math.PI * RADIUS;

  let pct = $derived(Math.max(0, Math.min(1, max === 0 ? 0 : value / max)));
  let dash = $derived(C * pct);
  let phaseLabel = $derived(
    phase === 'latency'  ? 'Ping' :
    phase === 'download' ? 'Download' :
    phase === 'upload'   ? 'Upload' :
                           '',
  );
</script>

<div class="gauge">
  <svg width={SIZE} height={SIZE / 2 + STROKE / 2} viewBox="0 0 {SIZE} {SIZE / 2 + STROKE / 2}">
    <path
      d="M {STROKE / 2} {SIZE / 2}
         A {RADIUS} {RADIUS} 0 0 1 {SIZE - STROKE / 2} {SIZE / 2}"
      fill="none"
      stroke="var(--separator)"
      stroke-width={STROKE}
      stroke-linecap="round"
    />
    <path
      d="M {STROKE / 2} {SIZE / 2}
         A {RADIUS} {RADIUS} 0 0 1 {SIZE - STROKE / 2} {SIZE / 2}"
      fill="none"
      stroke="var(--accent-primary)"
      stroke-width={STROKE}
      stroke-linecap="round"
      stroke-dasharray="{dash} {C}"
      style="transition: stroke-dasharray var(--transition-smooth);"
    />
  </svg>
  <div class="readout">
    <div class="phase">{phaseLabel}</div>
    <div class="value">{label}</div>
    <div class="unit">{unit}</div>
  </div>
</div>

<style>
  .gauge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }
  .readout { text-align: center; }
  .phase {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .value {
    color: var(--text-primary);
    font-size: var(--font-size-display);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .unit {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
</style>
