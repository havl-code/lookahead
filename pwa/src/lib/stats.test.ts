import { describe, expect, it } from 'vitest';
import golden from './golden/stats.json' with { type: 'json' };
import {
  type Attempt,
  averageSeconds,
  bestAverage,
  type Result,
  sessionStats,
  singleSeconds,
  trimFor,
} from './stats.ts';

// The golden file holds answers from the desktop app's Python code
// (tools/build_pwa_golden.py), so these check that both apps give exactly the same numbers.

describe('sessionStats', () => {
  it.each(golden.sessions.map((s) => [s.name, s] as const))(
    'matches the desktop app: %s',
    (_, s) => {
      expect(sessionStats(s.solves as Attempt[])).toEqual(s.stats);
    },
  );

  it('works out a 20,000 solve session quickly', () => {
    const attempts = Array.from({ length: 20_000 }, (_, i) => ({
      time_ms: 9000 + ((i * 7919) % 6000),
      penalty: i % 37 === 0 ? 'DNF' : null,
      dnf: i % 37 === 0,
    }));
    const start = performance.now();
    sessionStats(attempts);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('singles and averages the WCA way', () => {
  it.each(golden.rounding.map((r) => [r.ms, r] as const))(
    'matches the desktop app for %s ms',
    (_, r) => {
      expect(singleSeconds(r.ms)).toBe(r.single);
      expect(averageSeconds(r.ms)).toBe(r.average);
    },
  );
});

describe('bestAverage', () => {
  it.each(golden.bestAverages.map((b) => [b.size, b] as const))(
    'matches the desktop app for Ao%s',
    (_, b) => {
      expect(bestAverage(b.results as Result[], b.size)).toEqual({
        average: b.average,
        end: b.end,
      });
    },
  );

  it('drops 5% from each end, rounded up', () => {
    expect([5, 12, 50, 100].map(trimFor)).toEqual([1, 1, 3, 5]);
  });
});
