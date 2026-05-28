import { describe, it, expect } from 'vitest';
import { scoreQuality } from './quality';
import type { TestResult } from './types';

function r(over: Partial<TestResult> = {}): TestResult {
  return {
    id: 'x',
    timestamp: 0,
    downloadMbps: 100,
    uploadMbps: 20,
    pingMs: 30,
    jitterMs: 15,
    server: { isp: '', colo: '', country: '', ip: '' },
    verdict: 'poor',
    ...over,
  };
}

describe('scoreQuality verdict tiers', () => {
  it('returns excellent when all metrics meet the excellent thresholds', () => {
    expect(scoreQuality(r()).verdict).toBe('excellent');
  });

  it('drops to good when download alone falls below excellent', () => {
    expect(scoreQuality(r({ downloadMbps: 50 })).verdict).toBe('good');
  });

  it('drops to good when ping alone falls below excellent', () => {
    expect(scoreQuality(r({ pingMs: 60 })).verdict).toBe('good');
  });

  it('drops to good when jitter alone falls below excellent', () => {
    expect(scoreQuality(r({ jitterMs: 25 })).verdict).toBe('good');
  });

  it('drops to fair when upload falls below good', () => {
    expect(scoreQuality(r({ uploadMbps: 3 })).verdict).toBe('fair');
  });

  it('drops to poor when download falls below fair', () => {
    expect(scoreQuality(r({ downloadMbps: 2 })).verdict).toBe('poor');
  });

  it('verdict equals the worst band across all four metrics', () => {
    expect(scoreQuality(r({ downloadMbps: 500, uploadMbps: 50, pingMs: 100, jitterMs: 10 })).verdict).toBe('fair');
    expect(scoreQuality(r({ downloadMbps: 500, uploadMbps: 50, pingMs: 200, jitterMs: 10 })).verdict).toBe('poor');
  });
});

describe('scoreQuality capabilities', () => {
  it('lights up netflix4k at download ≥ 25', () => {
    expect(scoreQuality(r({ downloadMbps: 25 })).capabilities.netflix4k).toBe(true);
    expect(scoreQuality(r({ downloadMbps: 24.9 })).capabilities.netflix4k).toBe(false);
  });

  it('lights up zoomHd1on1 only when upload ≥ 1.2 AND ping ≤ 150', () => {
    expect(scoreQuality(r({ uploadMbps: 1.2, pingMs: 150 })).capabilities.zoomHd1on1).toBe(true);
    expect(scoreQuality(r({ uploadMbps: 1.1, pingMs: 150 })).capabilities.zoomHd1on1).toBe(false);
    expect(scoreQuality(r({ uploadMbps: 5,   pingMs: 151 })).capabilities.zoomHd1on1).toBe(false);
  });

  it('lights up onlineGaming only when ping ≤ 50 AND jitter ≤ 20', () => {
    expect(scoreQuality(r({ pingMs: 50, jitterMs: 20 })).capabilities.onlineGaming).toBe(true);
    expect(scoreQuality(r({ pingMs: 60, jitterMs: 5 })).capabilities.onlineGaming).toBe(false);
    expect(scoreQuality(r({ pingMs: 10, jitterMs: 25 })).capabilities.onlineGaming).toBe(false);
  });

  it('lights up largeFileShare at upload ≥ 25', () => {
    expect(scoreQuality(r({ uploadMbps: 25 })).capabilities.largeFileShare).toBe(true);
    expect(scoreQuality(r({ uploadMbps: 24.99 })).capabilities.largeFileShare).toBe(false);
  });
});

describe('scoreQuality headline', () => {
  it('emits the excellent headline at the top tier', () => {
    expect(scoreQuality(r()).headline.toLowerCase()).toContain('great');
  });
  it('emits a slow headline at the poor tier', () => {
    expect(scoreQuality(r({ downloadMbps: 1, uploadMbps: 0.2, pingMs: 400, jitterMs: 100 })).headline.toLowerCase())
      .toContain('slow');
  });
});
