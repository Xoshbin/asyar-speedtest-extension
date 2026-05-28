import { describe, it, expect } from 'vitest';
import { slidingWindowMbps, topDecileMbps, type Sample } from './throughput';

function sample(t: number, bytes: number, durMs: number): Sample {
  return { t, bytes, durMs };
}

describe('slidingWindowMbps', () => {
  it('returns 0 when no samples lie inside the window', () => {
    const samples: Sample[] = [sample(100, 1_000_000, 1000)];
    expect(slidingWindowMbps(samples, 1500, /*now*/ 5000)).toBe(0);
  });

  it('averages Mbps across only the samples inside the window', () => {
    // chunk A:  1 MB / 1 s = 8 Mbps   at t=4000
    // chunk B:  2 MB / 1 s = 16 Mbps  at t=4500
    // chunk C: 10 MB / 1 s = 80 Mbps  at t=2000 (outside 1.5s window)
    const samples: Sample[] = [
      sample(2000, 10_000_000, 1000),
      sample(4000,  1_000_000, 1000),
      sample(4500,  2_000_000, 1000),
    ];
    // window covers (3500, 5000] — C excluded, A & B inside
    expect(slidingWindowMbps(samples, 1500, /*now*/ 5000)).toBeCloseTo((8 + 16) / 2, 5);
  });

  it('handles a single sample inside the window', () => {
    const samples: Sample[] = [sample(4000, 1_000_000, 1000)]; // 8 Mbps
    expect(slidingWindowMbps(samples, 1500, /*now*/ 5000)).toBeCloseTo(8, 5);
  });
});

describe('topDecileMbps', () => {
  it('returns 0 for an empty input', () => {
    expect(topDecileMbps([])).toBe(0);
  });

  it('returns the single value when only one sample exists', () => {
    const samples: Sample[] = [sample(0, 1_000_000, 1000)]; // 8 Mbps
    expect(topDecileMbps(samples)).toBeCloseTo(8, 5);
  });

  it('averages the top 10% by Mbps', () => {
    // 20 samples whose Mbps values are 1..20.
    const samples: Sample[] = Array.from({ length: 20 }, (_, i) => {
      const mbps = i + 1;
      return sample(i * 1000, (mbps * 1_000_000) / 8, 1000);
    });
    // top decile = top 2 samples → Mbps 19, 20 → avg 19.5
    expect(topDecileMbps(samples)).toBeCloseTo(19.5, 5);
  });

  it('rounds the top-decile bucket size up so very small sets still produce a value', () => {
    // 7 samples → top 10% rounds up to 1 → returns max sample
    const samples: Sample[] = [3, 4, 5, 6, 7, 8, 9].map((m, i) =>
      sample(i * 1000, (m * 1_000_000) / 8, 1000),
    );
    expect(topDecileMbps(samples)).toBeCloseTo(9, 5);
  });
});
