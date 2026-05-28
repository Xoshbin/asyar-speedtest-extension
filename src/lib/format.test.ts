import { describe, it, expect } from 'vitest';
import {
  formatMbps,
  formatMs,
  formatRelativeTime,
  formatSummary,
} from './format';
import type { TestResult } from './types';

const result: TestResult = {
  id: 'r1',
  timestamp: Date.UTC(2026, 4, 28, 12, 42, 0),
  downloadMbps: 482.7,
  uploadMbps: 95.4,
  pingMs: 12.3,
  jitterMs: 3.1,
  server: { isp: 'BT plc', colo: 'LHR', country: 'GB', ip: '1.2.3.4' },
  verdict: 'excellent',
};

describe('formatMbps', () => {
  it('rounds to no decimal place for values ≥ 10', () => {
    expect(formatMbps(482.7)).toBe('483');
    expect(formatMbps(10)).toBe('10');
  });
  it('keeps one decimal for values < 10', () => {
    expect(formatMbps(9.46)).toBe('9.5');
    expect(formatMbps(0.83)).toBe('0.8');
  });
  it('returns "—" for non-finite input', () => {
    expect(formatMbps(NaN)).toBe('—');
    expect(formatMbps(Infinity)).toBe('—');
  });
});

describe('formatMs', () => {
  it('rounds milliseconds to whole numbers', () => {
    expect(formatMs(12.3)).toBe('12');
    expect(formatMs(0.4)).toBe('0');
  });
  it('returns "—" for non-finite input', () => {
    expect(formatMs(NaN)).toBe('—');
  });
});

describe('formatRelativeTime', () => {
  const NOW = Date.UTC(2026, 4, 28, 13, 0, 0);
  it('returns "just now" for the present minute', () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe('just now');
  });
  it('returns minutes for the same hour', () => {
    expect(formatRelativeTime(NOW - 10 * 60_000, NOW)).toBe('10 min ago');
  });
  it('returns hours for the same day', () => {
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3 hr ago');
  });
  it('returns days when older than 24 hours', () => {
    expect(formatRelativeTime(NOW - 2 * 86_400_000, NOW)).toBe('2 days ago');
  });
});

describe('formatSummary', () => {
  it('produces a one-line copyable summary', () => {
    expect(formatSummary(result)).toContain('483');
    expect(formatSummary(result)).toContain('95');
    expect(formatSummary(result)).toContain('12 ms');
    expect(formatSummary(result)).toContain('LHR');
    expect(formatSummary(result)).toContain('BT plc');
  });
});
