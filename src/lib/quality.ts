import type { TestResult, QualityReport, Verdict } from './types';

// Thresholds match spec §5 — keep the tables here so tuning is one edit.
const TIERS: Array<{
  verdict: Verdict;
  down: number;
  up: number;
  ping: number;
  jitter: number;
  headline: string;
}> = [
  { verdict: 'excellent', down: 100, up: 20, ping: 30,  jitter: 15, headline: 'Great for 4K streaming and HD calls' },
  { verdict: 'good',      down: 25,  up: 5,  ping: 80,  jitter: 30, headline: 'Fine for HD streaming and video calls' },
  { verdict: 'fair',      down: 5,   up: 1,  ping: 150, jitter: 60, headline: 'OK for SD video and browsing' },
  { verdict: 'poor',      down: 0,   up: 0,  ping: Infinity, jitter: Infinity, headline: 'Slow — basic browsing only' },
];

function bandFor(metric: 'down'|'up'|'ping'|'jitter', value: number): Verdict {
  for (const t of TIERS) {
    const meets =
      metric === 'down'   ? value >= t.down   :
      metric === 'up'     ? value >= t.up     :
      metric === 'ping'   ? value <= t.ping   :
                            value <= t.jitter;
    if (meets) return t.verdict;
  }
  return 'poor';
}

const TIER_ORDER: Record<Verdict, number> = {
  excellent: 4, good: 3, fair: 2, poor: 1,
};

function worst(a: Verdict, b: Verdict): Verdict {
  return TIER_ORDER[a] <= TIER_ORDER[b] ? a : b;
}

export function scoreQuality(r: TestResult): QualityReport {
  const v = [
    bandFor('down', r.downloadMbps),
    bandFor('up',   r.uploadMbps),
    bandFor('ping', r.pingMs),
    bandFor('jitter', r.jitterMs),
  ].reduce(worst);

  const headline = TIERS.find(t => t.verdict === v)!.headline;

  return {
    verdict: v,
    headline,
    capabilities: {
      netflix4k:      r.downloadMbps >= 25,
      netflixHd:      r.downloadMbps >= 5,
      zoomHd1on1:     r.uploadMbps >= 1.2 && r.pingMs <= 150,
      zoomHdGroup:    r.uploadMbps >= 3.8 && r.pingMs <= 150,
      cloudBackup:    r.uploadMbps >= 10,
      largeFileShare: r.uploadMbps >= 25,
      onlineGaming:   r.pingMs <= 50 && r.jitterMs <= 20,
      remoteDesktop:  r.pingMs <= 80 && r.uploadMbps >= 5,
    },
  };
}
