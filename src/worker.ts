import {
  ExtensionContext as WorkerExtensionContext,
  extensionBridge,
} from 'asyar-sdk/worker';
import type {
  Extension,
  ExtensionContext,
  ExtensionResult,
  INetworkService,
  IStorageService,
  IToolsService,
  ManifestTool,
} from 'asyar-sdk/contracts';
import type { ExtensionStateProxy } from 'asyar-sdk/contracts';
import manifest from '../manifest.json';

import { runTest, type RunTestOpts } from './lib/engine';
import { slidingWindowMbps, type Sample } from './lib/throughput';
import { scoreQuality } from './lib/quality';
import { appendHistory, loadHistory, deleteHistoryEntry, clearHistory } from './lib/storage';
import { formatSummary } from './lib/format';
import type { TestResult, Phase, HistoryEntry, Meta } from './lib/types';

const extensionId = resolveExtensionId();
const ctx = new WorkerExtensionContext();
ctx.setExtensionId(extensionId);

// Service handles. NOTE: `interop` is not in the worker proxy bag — the SDK's
// asyar-sdk/worker excludes feedback/selection/interop/clipboard from the
// worker bundle.
const network   = ctx.getService<INetworkService>('network');
const storage   = ctx.getService<IStorageService>('storage');
const tools     = ctx.getService<IToolsService>('tools');
const state     = ctx.getService<ExtensionStateProxy>('state');

async function setState(key: 'phase' | 'mbps' | 'meta' | 'lastResult', value: unknown): Promise<void> {
  await state.set(key, value);
}

// ─── engine config ─────────────────────────────────────────────────────────

const FULL_OPTS: RunTestOpts = {
  latency:  { probes: 20 },
  download: { budgetMs: 12_000, parallelism: 4, chunkBytesPlan: [100_000, 1_000_000, 10_000_000, 25_000_000] },
  upload:   { budgetMs: 8_000,  parallelism: 2, chunkBytesPlan: [100_000, 1_000_000, 10_000_000] },
};
const QUICK_OPTS: RunTestOpts = {
  latency:  { probes: 5 },
  download: { budgetMs: 4_000, parallelism: 2, chunkBytesPlan: [100_000, 1_000_000] },
  upload:   { budgetMs: 3_000, parallelism: 1, chunkBytesPlan: [100_000, 1_000_000] },
};

let __runSeq = 0;
let __currentRun: { token: number; controller: AbortController } | null = null;

// ─── history ───────────────────────────────────────────────────────────────

async function writeHistoryIfEnabled(result: TestResult): Promise<void> {
  const prefs = ctx.preferences.values as Record<string, unknown> | undefined;
  if (prefs?.historyEnabled === false) return;
  const limit = Number(prefs?.historyLimit ?? 200);
  const cap = isFinite(limit) && limit > 0 ? limit : 200;
  await appendHistory(storage, result, cap);
}

// ─── runOneTest ─────────────────────────────────────────────────────────────

async function runOneTest(quickMode: boolean): Promise<TestResult> {
  // Cancel any concurrent run.
  __currentRun?.controller.abort();
  const token = ++__runSeq;
  const controller = new AbortController();
  __currentRun = { token, controller };

  // Pump live mbps from sample stream into state:mbps.
  const samples: Sample[] = [];
  const onSample = (s: Sample) => {
    samples.push(s);
    const live = slidingWindowMbps(samples, /*windowMs*/ 1500, performance.now());
    void setState('mbps', live);
  };

  const base = quickMode ? QUICK_OPTS : FULL_OPTS;
  const opts: RunTestOpts = {
    latency:  { ...base.latency,  signal: controller.signal },
    download: { ...base.download, signal: controller.signal, onSample },
    upload:   { ...base.upload,   signal: controller.signal, onSample },
    onProgress: (ev) => {
      void setState('phase', ev.phase as Phase);
      // Reset the sample window when a new phase starts so the live readout
      // doesn't show the previous phase's value.
      if ((ev.phase === 'download' || ev.phase === 'upload') && ev.mbps === undefined) {
        samples.length = 0;
        void setState('mbps', 0);
      }
    },
  };

  let result: TestResult;
  try {
    result = await runTest(network, opts);
  } catch (err) {
    if (__currentRun?.token === token) __currentRun = null;
    throw err;
  }

  if (__currentRun?.token !== token) {
    throw new Error('superseded');
  }
  __currentRun = null;

  // Push final state, persist.
  void setState('meta', result.server);
  void setState('lastResult', result);

  try { await writeHistoryIfEnabled(result); } catch { /* best-effort */ }

  return result;
}

// ─── RPC handlers ──────────────────────────────────────────────────────────

ctx.onRequest<{ quickMode?: boolean } | undefined, TestResult>('runTest', async (payload, _signal) => {
  return runOneTest(Boolean(payload?.quickMode));
});

ctx.onRequest<undefined, void>('cancelTest', async (_payload, _signal) => {
  if (__currentRun) {
    __currentRun.controller.abort();
    __currentRun = null;
  }
  await setState('phase', 'idle');
});

ctx.onRequest<undefined, HistoryEntry[]>('getHistory', async (_payload, _signal) => {
  return loadHistory(storage);
});

ctx.onRequest<{ id: string }, void>('deleteEntry', async (payload, _signal) => {
  if (!payload?.id) return;
  await deleteHistoryEntry(storage, payload.id);
});

ctx.onRequest<undefined, void>('clearHistory', async (_payload, _signal) => {
  await clearHistory(storage);
});

ctx.onRequest<{ id: string }, { summary: string } | null>('copyEntry', async (payload, _signal) => {
  const list = await loadHistory(storage);
  const entry = list.find((e) => e.id === payload?.id);
  if (!entry) return null;
  return { summary: formatSummary(entry) };
});

ctx.onRequest<undefined, Meta | null>('getMeta', async (_payload, _signal) => {
  const cached = await state.get('meta');
  return (cached && typeof cached === 'object') ? cached as Meta : null;
});

// ─── tool registration ─────────────────────────────────────────────────────

void (async () => {
  const tool = (manifest.tools as ManifestTool[] | undefined)?.find((t) => t.id === 'run-speed-test');
  if (!tool) return;
  await tools.registerTool(tool, async (args: unknown) => {
    const a = (args ?? {}) as { quickMode?: unknown };
    const start = performance.now();
    const r = await runOneTest(Boolean(a.quickMode));
    const durationSec = (performance.now() - start) / 1000;
    const verdict = scoreQuality(r);
    return {
      verdict: verdict.verdict,
      headline: verdict.headline,
      downloadMbps: r.downloadMbps,
      uploadMbps: r.uploadMbps,
      pingMs: r.pingMs,
      jitterMs: r.jitterMs,
      server: r.server,
      durationSec,
    };
  });
})();

// ─── extension shell ───────────────────────────────────────────────────────

class SpeedTestExt implements Extension {
  async initialize(_c: ExtensionContext): Promise<void> {}
  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}
  async executeCommand(_id: string, _args?: Record<string, unknown>): Promise<unknown> { return undefined; }
  async search(_query: string): Promise<ExtensionResult[]> { return []; }
}

const ext = new SpeedTestExt();
extensionBridge.registerManifest(manifest as unknown as Parameters<typeof extensionBridge.registerManifest>[0]);
extensionBridge.registerExtensionImplementation(extensionId, ext);

// Clear any stale state from prior worker mounts. Without this, a partial
// result from an earlier broken run would be served to the view on mount,
// bypassing a fresh test.
void setState('phase', 'idle');
void setState('mbps', 0);
void setState('lastResult', null);
void setState('meta', null);

window.parent.postMessage(
  { type: 'asyar:extension:loaded', extensionId, role: 'worker' },
  '*',
);

function resolveExtensionId(): string {
  const fallback = 'org.asyar.speedtest';
  if (window.location.hostname === 'localhost' ||
      window.location.hostname === 'asyar-extension.localhost') {
    return window.location.pathname.split('/').filter(Boolean)[0] || fallback;
  }
  return window.location.hostname || fallback;
}
