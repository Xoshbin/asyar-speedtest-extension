import { describe, it, expect } from 'vitest';
import {
  loadHistory,
  appendHistory,
  deleteHistoryEntry,
  clearHistory,
} from './storage';
import type { HistoryEntry } from './types';

interface FakeStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

function fakeStorage(): FakeStorage & { _store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    _store: store,
    async get(k)        { return store.get(k); },
    async set(k, v)     { store.set(k, v); },
    async delete(k)     { store.delete(k); },
    async clear()       { store.clear(); },
  };
}

function entry(id: string, ts: number, down = 100): HistoryEntry {
  return {
    id, timestamp: ts,
    downloadMbps: down, uploadMbps: 10, pingMs: 20, jitterMs: 5,
    server: { isp: 'ISP', colo: 'XXX', country: 'GB', ip: '1.1.1.1' },
    verdict: 'good',
  };
}

describe('loadHistory', () => {
  it('returns an empty array when nothing is persisted', async () => {
    const s = fakeStorage();
    expect(await loadHistory(s as any)).toEqual([]);
  });

  it('parses the persisted JSON array', async () => {
    const s = fakeStorage();
    s._store.set('history', JSON.stringify([entry('a', 1)]));
    expect(await loadHistory(s as any)).toEqual([entry('a', 1)]);
  });

  it('returns an empty array on corrupt JSON instead of throwing', async () => {
    const s = fakeStorage();
    s._store.set('history', 'not-json');
    expect(await loadHistory(s as any)).toEqual([]);
  });
});

describe('appendHistory', () => {
  it('appends a new entry to the end', async () => {
    const s = fakeStorage();
    await appendHistory(s as any, entry('a', 1), 10);
    await appendHistory(s as any, entry('b', 2), 10);
    const arr = await loadHistory(s as any);
    expect(arr.map(e => e.id)).toEqual(['a', 'b']);
  });

  it('evicts oldest entries when cap is exceeded', async () => {
    const s = fakeStorage();
    for (let i = 0; i < 5; i++) await appendHistory(s as any, entry(`e${i}`, i), /*cap=*/ 3);
    const arr = await loadHistory(s as any);
    expect(arr.map(e => e.id)).toEqual(['e2', 'e3', 'e4']);
  });

  it('honors a cap of 0 by storing nothing', async () => {
    const s = fakeStorage();
    await appendHistory(s as any, entry('a', 1), 0);
    expect(await loadHistory(s as any)).toEqual([]);
  });
});

describe('deleteHistoryEntry', () => {
  it('removes the matching id, preserves the rest', async () => {
    const s = fakeStorage();
    s._store.set('history', JSON.stringify([entry('a', 1), entry('b', 2), entry('c', 3)]));
    await deleteHistoryEntry(s as any, 'b');
    expect((await loadHistory(s as any)).map(e => e.id)).toEqual(['a', 'c']);
  });

  it('is a no-op when the id does not exist', async () => {
    const s = fakeStorage();
    s._store.set('history', JSON.stringify([entry('a', 1)]));
    await deleteHistoryEntry(s as any, 'missing');
    expect((await loadHistory(s as any)).map(e => e.id)).toEqual(['a']);
  });
});

describe('clearHistory', () => {
  it('deletes the history key', async () => {
    const s = fakeStorage();
    s._store.set('history', JSON.stringify([entry('a', 1)]));
    await clearHistory(s as any);
    expect(s._store.has('history')).toBe(false);
  });
});
