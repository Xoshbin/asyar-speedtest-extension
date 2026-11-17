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

  const WIDTH = 280;
  const HEIGHT = 160;
  const CX = 140;
  const CY = 136;
  const STROKE = 10;
  const RADIUS = 108;
  const C = Math.PI * RADIUS;

  let pct = $derived(Math.max(0, Math.min(1, max === 0 ? 0 : value / max)));
  let dash = $derived(C * pct);

  let phaseLabel = $derived.by(() => {
    switch (phase) {
      case 'latency':
        return 'Latency & jitter';
      case 'download':
        return 'Download throughput';
      case 'upload':
        return 'Upload throughput';
      case 'done':
        return 'Completed';
      case 'error':
        return 'Interrupted';
      default:
        return 'Ready';
    }
  });

  let accentColor = $derived.by(() => {
    switch (phase) {
      case 'latency':
        return 'var(--accent-warning)';
      case 'download':
        return 'var(--accent-primary)';
      case 'upload':
        return 'var(--accent-success)';
      case 'error':
        return 'var(--accent-danger)';
      default:
        return 'var(--accent-primary)';
    }
  });

  const TICKS = [0, 0.25, 0.5, 0.75, 1];
</script>

<div
  class="gauge-container"
  role="meter"
  aria-valuenow={value}
  aria-valuemin={0}
  aria-valuemax={max}
  aria-label={phaseLabel}
>
  <svg
    class="gauge-svg"
    width={WIDTH}
    height={HEIGHT}
    viewBox="0 0 {WIDTH} {HEIGHT}"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="gauge-arc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color={accentColor} stop-opacity="0.55" />
        <stop offset="100%" stop-color={accentColor} stop-opacity="1" />
      </linearGradient>
    </defs>

    <!-- Subtle dial ticks -->
    {#each TICKS as tickRatio}
      {@const angle = Math.PI * (1 - tickRatio)}
      {@const rInner = RADIUS - 14}
      {@const rOuter = RADIUS - 7}
      <line
        x1={CX + rInner * Math.cos(angle)}
        y1={CY - rInner * Math.sin(angle)}
        x2={CX + rOuter * Math.cos(angle)}
        y2={CY - rOuter * Math.sin(angle)}
        stroke="var(--separator)"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    {/each}

    <!-- Inset background track -->
    <path
      d="M {CX - RADIUS} {CY} A {RADIUS} {RADIUS} 0 0 1 {CX + RADIUS} {CY}"
      fill="none"
      stroke="var(--bg-tertiary)"
      stroke-width={STROKE}
      stroke-linecap="round"
    />

    <!-- Active gradient sweep arc -->
    <path
      d="M {CX - RADIUS} {CY} A {RADIUS} {RADIUS} 0 0 1 {CX + RADIUS} {CY}"
      fill="none"
      stroke="url(#gauge-arc-gradient)"
      stroke-width={STROKE}
      stroke-linecap="round"
      stroke-dasharray="{dash} {C}"
      style="transition: stroke-dasharray var(--dur-travel) var(--ease-travel);"
    />

    <!-- Rotating aerodynamic needle & tip pip -->
    <g
      class="needle-group"
      style="transform: rotate({pct * 180}deg); transform-origin: {CX}px {CY}px;"
    >
      <line
        x1={CX - 28}
        y1={CY}
        x2={CX - RADIUS + 10}
        y2={CY}
        stroke={accentColor}
        stroke-width="2"
        stroke-linecap="round"
        opacity="0.8"
      />
      <circle
        cx={CX - RADIUS}
        cy={CY}
        r="5"
        fill="var(--bg-popup)"
        stroke={accentColor}
        stroke-width="2.5"
      />
    </g>

    <!-- Center pivot -->
    <circle cx={CX} cy={CY} r="3.5" fill={accentColor} opacity="0.75" />

    <!-- Min / Max scale indicators -->
    <text x={CX - RADIUS} y={CY + 18} class="gauge-scale-text" text-anchor="middle"> 0 </text>
    <text x={CX + RADIUS} y={CY + 18} class="gauge-scale-text" text-anchor="middle">
      {max}
    </text>
  </svg>

  <!-- Central numeric readout inside the arc -->
  <div class="readout">
    <div class="phase-chip">{phaseLabel}</div>
    <div class="value-row">
      <span class="value">{label}</span>
      <span class="unit-chip">{unit}</span>
    </div>
  </div>
</div>

<style>
  .gauge-container {
    position: relative;
    width: 280px;
    height: 160px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    user-select: none;
  }

  .gauge-svg {
    display: block;
    overflow: visible;
  }

  .needle-group {
    transition: transform var(--dur-travel) var(--ease-travel);
  }

  .gauge-scale-text {
    fill: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    font-weight: 500;
  }

  .readout {
    position: absolute;
    top: 50px;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    pointer-events: none;
  }

  .phase-chip {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
    font-weight: 500;
    letter-spacing: var(--tracking-tight);
    line-height: 1;
  }

  .value-row {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .value {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-display);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    letter-spacing: var(--tracking-tight);
  }

  .unit-chip {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-full);
    padding: 2px var(--space-2);
    line-height: 1;
  }
</style>
