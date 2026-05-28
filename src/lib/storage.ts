import type { IStorageService } from 'asyar-sdk/contracts';
import type { HistoryEntry } from './types';

const KEY = 'history';

export async function loadHistory(storage: IStorageService): Promise<HistoryEntry[]> {
  const raw = await storage.get(KEY);
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as HistoryEntry[] : [];
  } catch {
    return [];
  }
}

export async function appendHistory(
  storage: IStorageService,
  entry: HistoryEntry,
  cap: number,
): Promise<void> {
  if (cap <= 0) return;
  const arr = await loadHistory(storage);
  arr.push(entry);
  while (arr.length > cap) arr.shift();
  await storage.set(KEY, JSON.stringify(arr));
}

export async function deleteHistoryEntry(
  storage: IStorageService,
  id: string,
): Promise<void> {
  const arr = await loadHistory(storage);
  const next = arr.filter(e => e.id !== id);
  if (next.length === arr.length) return;
  await storage.set(KEY, JSON.stringify(next));
}

export async function clearHistory(storage: IStorageService): Promise<void> {
  await storage.delete(KEY);
}
