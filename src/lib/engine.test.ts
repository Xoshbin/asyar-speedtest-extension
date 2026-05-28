import { describe, it, expect, vi } from 'vitest';
import type { INetworkService } from 'asyar-sdk/contracts';
import { fetchMeta, measureLatency, measureDownload, measureUpload, SpeedTestError, runTest } from './engine';
import { scoreQuality } from './quality';

type FetchArgs = Parameters<INetworkService['fetch']>;
type FetchResult = Awaited<ReturnType<INetworkService['fetch']>>;

function mockNetwork(
  responder: (url: string, init?: any) => Partial<FetchResult> | Promise<Partial<FetchResult>>,
): INetworkService {
  return {
    fetch: vi.fn(async (...args: FetchArgs) => {
      const [url, init] = args;
      const partial = await responder(url, init);
      return {
        ok: true, status: 200, statusText: 'OK',
        headers: {}, body: '',
        ...partial,
      } as FetchResult;
    }),
  } as unknown as INetworkService;
}

describe('fetchMeta', () => {
  it('parses isp/colo/country/ip from /meta', async () => {
    const net = mockNetwork(() => ({
      body: JSON.stringify({
        clientIp: '203.0.113.5',
        country: 'GB',
        colo: 'LHR',
        asOrganization: 'BT plc',
      }),
    }));
    const meta = await fetchMeta(net);
    expect(meta).toEqual({ isp: 'BT plc', colo: 'LHR', country: 'GB', ip: '203.0.113.5' });
  });

  it('throws SpeedTestError on non-ok response', async () => {
    const net = mockNetwork(() => ({ ok: false, status: 503, statusText: 'Bad Gateway' }));
    await expect(fetchMeta(net)).rejects.toBeInstanceOf(SpeedTestError);
  });

  it('throws SpeedTestError on non-JSON body', async () => {
    const net = mockNetwork(() => ({ body: '<html>captive portal</html>' }));
    await expect(fetchMeta(net)).rejects.toBeInstanceOf(SpeedTestError);
  });
});

describe('measureLatency', () => {
  it('runs the configured probe count, derives median + jitter from elapsed', async () => {
    let n = 0;
    const net = mockNetwork(async () => { n += 1; return { body: '' }; });

    // Build a deterministic timeline: each probe consumes two now() calls
    // (t0 then t1). Per-probe elapsed = [10,12,11,13,9,14,10,11,12,13].
    const elapsed = [10, 12, 11, 13, 9, 14, 10, 11, 12, 13];
    const timeline: number[] = [];
    let t = 1000;
    for (const d of elapsed) {
      timeline.push(t);
      timeline.push(t + d);
      t += d;
    }
    let i = 0;
    const fakeNow = () => timeline[i++] ?? t;

    const r = await measureLatency(net, { probes: 10, now: fakeNow });
    expect(r.pingMs).toBeCloseTo(11.5, 1); // median of [9,10,10,11,11,12,12,13,13,14]
    expect(r.jitterMs).toBeGreaterThan(0);
    expect(n).toBe(10);
  });

  it('aborts via the supplied AbortSignal', async () => {
    const ctrl = new AbortController();
    let count = 0;
    const net = mockNetwork(async () => {
      count += 1;
      if (count === 3) ctrl.abort();
      return { body: '' };
    });
    await expect(
      measureLatency(net, { probes: 20, signal: ctrl.signal }),
    ).rejects.toThrow(/abort/i);
  });
});

describe('measureDownload', () => {
  it('returns 0 Mbps when network responses have zero bytes', async () => {
    const net = mockNetwork(() => ({ body: '' }));
    const r = await measureDownload(net, { budgetMs: 50, parallelism: 1, chunkBytesPlan: [0] });
    expect(r.mbps).toBe(0);
  });

  it('computes Mbps from total bytes delivered within the budget', async () => {
    // Each fetch claims to deliver a 1 MB chunk; inject elapsed via fake now.
    // Calls in order: start (loop top, before t0) ... wait we don't have a start call.
    // The loop pattern is: budget-check → t0 → fetch → t1 → push → budget-check ...
    // Per phase start: const start = now();  (1 call)
    // Per iteration: now() for budget check, now() for t0, now() for t1 — 3 calls per iteration.
    // We want: start=0, budget-check#1=0, t0=0, t1=100, budget-check#2=200 (budget=1000 so still in)
    //         then iteration ends because chunkBytesPlan is exhausted? No, plan wraps.
    // To stop after 1 chunk, set budgetMs=100 and now() jumps past it on second budget-check.
    // Timeline: [start=0, budget#1=0, t0=0, t1=100, budget#2=200 → stop].
    // bytes=1_000_000 / 100ms = 10 MB/s = 80 Mbps. topDecileMbps([80]) = 80.
    const timeline = [0, 0, 0, 100, 200];
    let i = 0;
    const fakeNow = () => timeline[i++] ?? 10_000; // exhaust → big number → also stops

    const oneMB = '0'.repeat(1_000_000);
    const net = mockNetwork(() => ({ body: oneMB }));

    const r = await measureDownload(net, {
      budgetMs: 100,
      parallelism: 1,
      chunkBytesPlan: [1_000_000],
      now: fakeNow,
    });
    expect(r.mbps).toBeCloseTo(80, 0);
    expect(r.samples).toHaveLength(1);
  });

  it('aborts when the AbortSignal fires', async () => {
    const ctrl = new AbortController();
    let n = 0;
    const net = mockNetwork(async () => {
      n += 1;
      if (n === 2) ctrl.abort();
      return { body: '0'.repeat(100) };
    });
    await expect(
      measureDownload(net, {
        budgetMs: 5_000,
        parallelism: 1,
        chunkBytesPlan: [100, 100, 100, 100, 100],
        signal: ctrl.signal,
      }),
    ).rejects.toThrow(/abort/i);
  });
});

describe('measureUpload', () => {
  it('POSTs to /__up and returns Mbps from delivered bytes', async () => {
    const seen: number[] = [];
    const net = mockNetwork((_url, init: any) => {
      seen.push(typeof init?.body === 'string' ? init.body.length : 0);
      return { body: 'ok' };
    });
    // Timeline: start=0, budget#1=0, t0=0, t1=200, budget#2=300 ≥ 50 → stop
    // 100_000 bytes / 200ms = 500_000 B/s = 4 Mbps
    const timeline = [0, 0, 0, 200, 300];
    let i = 0;
    const fakeNow = () => timeline[i++] ?? 10_000;

    const r = await measureUpload(net, {
      budgetMs: 50,
      parallelism: 1,
      chunkBytesPlan: [100_000],
      now: fakeNow,
    });
    expect(seen).toEqual([100_000]);
    expect(r.mbps).toBeCloseTo(4, 0);
  });
});

describe('runTest orchestration', () => {
  it('runs meta → latency → download → upload and returns a TestResult', async () => {
    const net = mockNetwork((url) => {
      if (url.endsWith('/meta')) {
        return { body: JSON.stringify({
          clientIp: '1.1.1.1', country: 'GB', colo: 'LHR', asOrganization: 'BT plc',
        })};
      }
      if (url.includes('__down')) return { body: '0'.repeat(1_000_000) };
      if (url.includes('__up'))   return { body: 'ok' };
      return { body: '' };
    });

    const phases: string[] = [];
    let tick = 0;
    const fakeNow = () => (tick++) * 5; // each call advances 5ms

    const result = await runTest(net, {
      latency: { probes: 3, now: fakeNow },
      download: { budgetMs: 30, parallelism: 1, chunkBytesPlan: [1_000_000], now: fakeNow },
      upload:   { budgetMs: 30, parallelism: 1, chunkBytesPlan: [100_000],   now: fakeNow },
      onProgress: (p) => { phases.push(p.phase); },
    });

    // Phases should be emitted in this order (multiple emissions per phase OK)
    expect(phases[0]).toBe('latency');
    expect(phases).toContain('download');
    expect(phases).toContain('upload');
    expect(phases[phases.length - 1]).toBe('done');
    expect(result.server.isp).toBe('BT plc');
    expect(result.server.colo).toBe('LHR');
    expect(result.downloadMbps).toBeGreaterThan(0);
    expect(result.uploadMbps).toBeGreaterThan(0);
    expect(result.pingMs).toBeGreaterThanOrEqual(0);
    expect(result.verdict).toBe(scoreQuality(result).verdict);
    expect(result.id).toBeTruthy();
  });

  it('emits phase:"error" and rethrows when /meta fails', async () => {
    const net = mockNetwork((url) => {
      if (url.endsWith('/meta')) return { ok: false, status: 503, statusText: 'down' };
      return { body: '' };
    });
    const phases: string[] = [];
    await expect(
      runTest(net, {
        latency: { probes: 1 },
        download: { budgetMs: 10, parallelism: 1, chunkBytesPlan: [10] },
        upload:   { budgetMs: 10, parallelism: 1, chunkBytesPlan: [10] },
        onProgress: (p) => phases.push(p.phase),
      }),
    ).rejects.toBeInstanceOf(SpeedTestError);
    expect(phases.at(-1)).toBe('error');
  });
});
