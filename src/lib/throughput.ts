export interface Sample {
  /** Completion timestamp of the chunk (ms, performance.now() basis). */
  t: number;
  bytes: number;
  durMs: number;
}

function mbpsOf(s: Sample): number {
  if (s.durMs <= 0) return 0;
  const bytesPerSecond = s.bytes / (s.durMs / 1000);
  return (bytesPerSecond * 8) / 1_000_000;
}

/**
 * Trailing window average of per-sample Mbps for samples whose completion
 * time lies in (now - windowMs, now]. Returns 0 if no samples qualify.
 */
export function slidingWindowMbps(
  samples: readonly Sample[],
  windowMs: number,
  now: number,
): number {
  const cutoff = now - windowMs;
  let sum = 0;
  let count = 0;
  for (const s of samples) {
    if (s.t <= cutoff) continue;
    if (s.t > now) continue;
    sum += mbpsOf(s);
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/**
 * Average Mbps of the top decile (top 10%, rounded up so even tiny sets
 * return a value) — used to compute the final per-phase Mbps after dropping
 * ramp-up and tail noise upstream.
 */
export function topDecileMbps(samples: readonly Sample[]): number {
  if (samples.length === 0) return 0;
  const ranked = samples.map(mbpsOf).sort((a, b) => b - a);
  const k = Math.max(1, Math.ceil(ranked.length / 10));
  let sum = 0;
  for (let i = 0; i < k; i++) sum += ranked[i];
  return sum / k;
}
