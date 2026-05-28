import type { INetworkService } from 'asyar-sdk/contracts';
import type { Meta, TestResult, ProgressEvent, Phase } from './types';
import { topDecileMbps, type Sample } from './throughput';
import { scoreQuality } from './quality';

export class SpeedTestError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SpeedTestError';
  }
}

const HOST = 'https://speed.cloudflare.com';

/**
 * The launcher's `reqwest` client sends a truncated User-Agent
 * (`AppleWebKit/605.1.15` with no browser version suffix), which Cloudflare's
 * speedtest endpoint flags as bot-like and answers with 403 Forbidden. Pair it
 * with `Origin` / `Referer` matching the official speed.cloudflare.com page
 * so the request passes Cloudflare's same-origin checks.
 *
 * reqwest's per-request `.header(...)` overrides the client default, so these
 * headers replace whatever the launcher injected.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://speed.cloudflare.com',
  'Referer': 'https://speed.cloudflare.com/',
};

export async function fetchMeta(network: INetworkService): Promise<Meta> {
  let res;
  try {
    res = await network.fetch(`${HOST}/meta`, { method: 'GET', headers: BROWSER_HEADERS });
  } catch (err) {
    throw new SpeedTestError('Network request failed for /meta', err);
  }
  if (!res.ok) {
    throw new SpeedTestError(`/meta returned HTTP ${res.status} ${res.statusText}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(res.body);
  } catch (err) {
    throw new SpeedTestError('Could not parse /meta response (captive portal?)', err);
  }
  const m = raw as Record<string, unknown>;
  return {
    isp:     coerceMetaString(m.asOrganization, 'Unknown ISP'),
    colo:    coerceMetaString(m.colo, '???'),
    country: coerceMetaString(m.country, '??'),
    ip:      coerceMetaString(m.clientIp, ''),
  };
}

/**
 * Cloudflare's `/meta` sometimes returns nested objects instead of bare
 * strings for fields like `colo` (e.g. `{ iata: "FRA", name: "Frankfurt" }`).
 * `String({...})` produces `"[object Object]"`, which then leaks into the UI.
 * This helper unwraps the common nested shapes and falls back to the
 * supplied default for anything unexpected.
 */
function coerceMetaString(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const key of ['code', 'iata', 'name', 'value', 'id']) {
      const val = o[key];
      if (typeof val === 'string' && val.length > 0) return val;
      if (typeof val === 'number') return String(val);
    }
  }
  return fallback;
}

export interface MeasureLatencyOpts {
  probes?: number;
  signal?: AbortSignal;
  now?: () => number;
}

export interface LatencyResult {
  pingMs: number;
  jitterMs: number;
  samples: number[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export async function measureLatency(
  network: INetworkService,
  opts: MeasureLatencyOpts = {},
): Promise<LatencyResult> {
  const probes = opts.probes ?? 20;
  const now = opts.now ?? (() => performance.now());
  const samples: number[] = [];
  for (let i = 0; i < probes; i++) {
    if (opts.signal?.aborted) throw new SpeedTestError('Measurement aborted', opts.signal);
    const t0 = now();
    await network.fetch(`${HOST}/__down?bytes=0`, { method: 'GET', headers: BROWSER_HEADERS });
    const t1 = now();
    samples.push(t1 - t0);
  }
  return {
    pingMs:   median(samples),
    jitterMs: stddev(samples),
    samples,
  };
}

export interface MeasureDownloadOpts {
  budgetMs: number;
  parallelism: number;
  chunkBytesPlan: number[]; // sequence to walk, repeated as needed
  signal?: AbortSignal;
  now?: () => number;
  onSample?: (s: Sample) => void; // called for every completed chunk
}

export interface PhaseMeasurement {
  mbps: number;
  samples: Sample[];
}

export async function measureDownload(
  network: INetworkService,
  opts: MeasureDownloadOpts,
): Promise<PhaseMeasurement> {
  return measurePhase(network, opts, /*upload=*/ false);
}

export async function measureUpload(
  network: INetworkService,
  opts: MeasureDownloadOpts,
): Promise<PhaseMeasurement> {
  return measurePhase(network, opts, /*upload=*/ true);
}

async function measurePhase(
  network: INetworkService,
  opts: MeasureDownloadOpts,
  upload: boolean,
): Promise<PhaseMeasurement> {
  const now = opts.now ?? (() => performance.now());
  const samples: Sample[] = [];
  const start = now();
  let planIdx = 0;
  let stopped = false;

  async function streamLoop() {
    while (!stopped) {
      if (opts.signal?.aborted) throw new SpeedTestError('Measurement aborted', opts.signal);
      if (now() - start >= opts.budgetMs) { stopped = true; break; }
      const bytes = opts.chunkBytesPlan[planIdx % opts.chunkBytesPlan.length];
      planIdx += 1;
      const t0 = now();
      if (upload) {
        const body = '0'.repeat(bytes);
        await network.fetch(`${HOST}/__up`, { method: 'POST', body, headers: BROWSER_HEADERS });
        const t1 = now();
        samples.push({ t: t1, bytes, durMs: t1 - t0 });
        if (opts.onSample) opts.onSample(samples[samples.length - 1]);
      } else {
        const res = await network.fetch(`${HOST}/__down?bytes=${bytes}`, { method: 'GET', headers: BROWSER_HEADERS });
        const delivered = typeof res.body === 'string' ? res.body.length : bytes;
        const t1 = now();
        samples.push({ t: t1, bytes: delivered, durMs: t1 - t0 });
        if (opts.onSample) opts.onSample(samples[samples.length - 1]);
      }
    }
  }

  const streams = Array.from({ length: opts.parallelism }, () => streamLoop());
  await Promise.all(streams);
  return { mbps: topDecileMbps(samples), samples };
}

export interface RunTestOpts {
  latency:  MeasureLatencyOpts;
  download: MeasureDownloadOpts;
  upload:   MeasureDownloadOpts;
  onProgress?: (event: ProgressEvent) => void;
  /** Optional id factory — defaults to a monotonic time-based id. */
  newId?: () => string;
}

function defaultId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function runTest(
  network: INetworkService,
  opts: RunTestOpts,
): Promise<TestResult> {
  const emit = (phase: Phase, mbps?: number) =>
    opts.onProgress?.({ phase, ...(mbps !== undefined ? { mbps } : {}) });

  let meta: Meta;
  try {
    meta = await fetchMeta(network);
  } catch (err) {
    emit('error');
    throw err;
  }

  try {
    emit('latency');
    const lat = await measureLatency(network, opts.latency);

    emit('download');
    const dl = await measureDownload(network, opts.download);
    emit('download', dl.mbps);

    emit('upload');
    const ul = await measureUpload(network, opts.upload);
    emit('upload', ul.mbps);

    const baseResult = {
      id: (opts.newId ?? defaultId)(),
      timestamp: Date.now(),
      downloadMbps: dl.mbps,
      uploadMbps: ul.mbps,
      pingMs: lat.pingMs,
      jitterMs: lat.jitterMs,
      server: meta,
    };
    // Compute verdict via scoreQuality; pass a TestResult shape (verdict placeholder).
    const verdict = scoreQuality({ ...baseResult, verdict: 'poor' } as TestResult).verdict;
    const result: TestResult = { ...baseResult, verdict };

    emit('done');
    return result;
  } catch (err) {
    emit('error');
    throw err;
  }
}
