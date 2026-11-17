<script lang="ts">
  import type { Phase } from '../lib/types';
  import { formatMbps, formatMs } from '../lib/format';

  interface Props {
    currentPhase: Phase;
    pingMs?: number;
    jitterMs?: number;
    downloadMbps?: number;
    uploadMbps?: number;
  }
  let { currentPhase, pingMs, jitterMs, downloadMbps, uploadMbps }: Props = $props();

  type StepId = 'latency' | 'download' | 'upload';
  type StepState = 'pending' | 'active' | 'done';

  const ORDER: StepId[] = ['latency', 'download', 'upload'];

  function stateOf(id: StepId): StepState {
    if (currentPhase === 'done') return 'done';
    if (currentPhase === 'error') {
      const idx = ORDER.indexOf(id);
      return idx === 0 && pingMs !== undefined ? 'done' : 'pending';
    }
    const idx = ORDER.indexOf(id);
    const cur = ORDER.indexOf(currentPhase as StepId);
    if (cur < 0) return 'pending';
    if (idx < cur) return 'done';
    if (idx === cur) return 'active';
    return 'pending';
  }

  function valueOf(id: StepId, state: StepState): string {
    if (id === 'latency') {
      if (pingMs !== undefined) {
        return jitterMs !== undefined
          ? `${formatMs(pingMs)} ms (${formatMs(jitterMs)} ms)`
          : `${formatMs(pingMs)} ms`;
      }
      return state === 'active' ? 'Testing…' : '—';
    }
    if (id === 'download') {
      if (downloadMbps !== undefined && downloadMbps > 0) {
        return `${formatMbps(downloadMbps)} Mbps`;
      }
      return state === 'active' ? 'Testing…' : '—';
    }
    if (id === 'upload') {
      if (uploadMbps !== undefined && uploadMbps > 0) {
        return `${formatMbps(uploadMbps)} Mbps`;
      }
      return state === 'active' ? 'Testing…' : '—';
    }
    return '—';
  }

  let steps = $derived<{ id: StepId; title: string; state: StepState; value: string }[]>([
    {
      id: 'latency',
      title: 'Latency & jitter',
      state: stateOf('latency'),
      value: valueOf('latency', stateOf('latency')),
    },
    {
      id: 'download',
      title: 'Download',
      state: stateOf('download'),
      value: valueOf('download', stateOf('download')),
    },
    {
      id: 'upload',
      title: 'Upload',
      state: stateOf('upload'),
      value: valueOf('upload', stateOf('upload')),
    },
  ]);
</script>

<div class="stepper" role="group" aria-label="Speed test phases">
  {#each steps as s (s.id)}
    <div class="step-card" data-state={s.state}>
      <div class="step-header">
        <span class="indicator {s.state}" aria-hidden="true">
          {#if s.state === 'done'}
            <svg viewBox="0 0 14 14" width="10" height="10" class="check-icon">
              <path
                d="M2.5 7.2L5.4 10.1L11.5 3.8"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          {:else if s.state === 'active'}
            <span class="pulse-ring"></span>
            <span class="active-dot"></span>
          {:else}
            <span class="pending-dot"></span>
          {/if}
        </span>
        <span class="step-title">{s.title}</span>
      </div>
      <div class="step-value" class:active-value={s.state === 'active'}>
        {s.value}
      </div>
    </div>
  {/each}
</div>

<style>
  .stepper {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
    width: 100%;
    max-width: 520px;
  }

  .step-card {
    background: var(--bg-secondary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    transition:
      background-color var(--dur-quick) var(--ease-travel),
      border-color var(--dur-quick) var(--ease-travel);
  }

  .step-card[data-state='active'] {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    position: relative;
    flex-shrink: 0;
  }

  .indicator.done {
    color: var(--accent-success);
  }

  .check-icon {
    display: block;
  }

  .indicator.active {
    color: var(--accent-primary);
  }

  .active-dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    background-color: var(--accent-primary);
  }

  .pulse-ring {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: var(--radius-full);
    border: 1.5px solid var(--accent-primary);
    animation: ring-pulse 1.6s var(--ease-travel) infinite;
  }

  @keyframes ring-pulse {
    0% {
      transform: scale(0.7);
      opacity: 0.9;
    }
    70% {
      transform: scale(1.4);
      opacity: 0;
    }
    100% {
      transform: scale(1.4);
      opacity: 0;
    }
  }

  .pending-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    border: 1.5px solid var(--text-tertiary);
  }

  .step-title {
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    font-weight: 500;
    letter-spacing: var(--tracking-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .step-card[data-state='active'] .step-title {
    color: var(--text-primary);
  }

  .step-value {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .step-value.active-value {
    color: var(--accent-primary);
  }

  .step-card[data-state='pending'] .step-value {
    color: var(--text-tertiary);
  }
</style>
