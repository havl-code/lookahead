import { describe, expect, it } from 'vitest';
import golden from './golden/stats.json' with { type: 'json' };
import {
  type Attempt,
  averageSeconds,
  bestAverage,
  boxStats,
  droppedInWindow,
  filterDistributionOutliers,
  type Result,
  rollingWcaAverages,
  sessionStats,
  singleMark,
  singleSeconds,
  trimFor,
} from './stats.ts';

// The golden file holds answers from the desktop app's Python code (written by 3.3's
// tools/build_pwa_golden.py), so these check that both apps give exactly the same numbers.

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

describe('singleMark', () => {
  // A session of 12.34, 10.50 (+2, so 12.50), 9.87, and a DNF: best 9.87, worst 12.50.
  const session = { best_single: 9870, worst_single: 12_500 };

  it('marks the solves that are the best and the worst single', () => {
    expect(singleMark({ time_ms: 9870, penalty: 'OK', dnf: false }, session)).toBe('best');
    expect(singleMark({ time_ms: 10_500, penalty: '+2', dnf: false }, session)).toBe('worst');
    expect(singleMark({ time_ms: 12_340, penalty: null, dnf: false }, session)).toBeNull();
  });

  it('never marks a DNF, even in a session of nothing but DNFs', () => {
    const dnf = { time_ms: 0, penalty: 'DNF', dnf: true };
    expect(singleMark(dnf, session)).toBeNull();
    expect(singleMark(dnf, { best_single: null, worst_single: null })).toBeNull();
  });

  it('marks nothing while the best and the worst are the same single', () => {
    const only = { time_ms: 9870, penalty: null, dnf: false };
    expect(singleMark(only, { best_single: 9870, worst_single: 9870 })).toBeNull();
  });
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

describe('chart maths', () => {
  it.each(golden.charts.map((c, i) => [i, c] as const))(
    'matches the desktop app (case %s)',
    (_, c) => {
      const results = c.results as Result[];
      expect(rollingWcaAverages(results, 5)).toEqual(c.rolling5);
      expect(rollingWcaAverages(results, 12)).toEqual(c.rolling12);
      if (results.length >= 5)
        expect([...droppedInWindow(results.slice(0, 5), 5)].sort((a, b) => a - b)).toEqual(
          c.dropped5,
        );
      const times = results
        .filter((r): r is number => r !== null)
        .map((r) => r / 1000)
        .sort((a, b) => a - b);
      if (c.box) {
        // The golden mean and SD are to 9 places (rounded_box in 3.3's build_pwa_golden.py).
        const { mean, sd, ...rest } = boxStats(times);
        expect({ ...rest, mean: c.box.mean, sd: c.box.sd }).toEqual(c.box);
        expect(mean).toBeCloseTo(c.box.mean, 9);
        expect(sd).toBeCloseTo(c.box.sd, 9);
      }
      expect(filterDistributionOutliers(c.times)).toEqual(c.filtered);
    },
  );
});
