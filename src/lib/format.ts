import type { TestResult } from './types';

export function formatMbps(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 10) return value.toFixed(0);
  return value.toFixed(1);
}

export function formatMs(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(0);
}

export function formatRelativeTime(at: number, now: number = Date.now()): string {
  const delta = now - at;
  if (delta < 60_000) return 'just now';
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(delta / 3_600_000);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(delta / 86_400_000);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export function formatSummary(r: TestResult): string {
  const down = formatMbps(r.downloadMbps);
  const up = formatMbps(r.uploadMbps);
  const ping = formatMs(r.pingMs);
  const server = `Cloudflare ${r.server.colo} (${r.server.isp})`;
  return `Speed test — ${down} Mbps ↓ / ${up} ↑ · ${ping} ms ping · ${server}`;
}
