import { describe, expect, it } from 'vitest';
import golden from './golden/scores.json' with { type: 'json' };
import {
  medianWithDnf,
  roundResult,
  sessionScores,
  shareBelow,
  type WcaReference,
} from './scores.ts';
import type { Result } from './stats.ts';
import { wcaReference } from './wcaReference.ts';

// The golden file holds the desktop app's scores (tools/build_pwa_golden.py) against a small
// made-up reference, so these check that both apps score sessions the same way.
const reference = golden.reference as WcaReference;

describe('sessionScores', () => {
  it.each(golden.cases.map((c, i) => [i, c] as const))(
    'matches the desktop app (case %s)',
    (_, c) => {
      expect(sessionScores(reference, c.event, c.results as Result[])).toEqual(c.scores);
    },
  );

  it('gives no scores for an event the WCA reference has no comparison for', () => {
    expect(sessionScores(reference, 'pyram', [5000, 5000, 5000, 5000, 5000])).toEqual({
      speed_score: null,
      consistency_score: null,
      overall_score: null,
      typical_result: null,
      spread: null,
    });
  });
});

describe('the pieces', () => {
  it('takes the median with DNFs as slowest', () => {
    expect(medianWithDnf([3, 1, 2])).toBe(2);
    expect(medianWithDnf([4, 1, 3, 2])).toBe(2.5);
    expect(medianWithDnf([1, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY])).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('scores a group like a WCA round', () => {
    expect(roundResult([10, 20, 30, 40, 50], 'average')).toBe(30);
    expect(roundResult([10, null, 30, 40, 50], 'average')).toBe(40);
    expect(roundResult([10, null, null, 40, 50], 'average')).toBe(Number.POSITIVE_INFINITY);
    expect(roundResult([10, 20, 60], 'average')).toBe(30);
    expect(roundResult([null, 20, 60], 'best')).toBe(20);
  });

  it('counts anyone level as half below', () => {
    expect(shareBelow([1, 2, 2, 3, 4], 2)).toBe(0.375);
    expect(shareBelow([1, 2, 3], 0)).toBe(0);
    expect(shareBelow([1, 2, 3], 9)).toBe(1);
    expect(shareBelow([1, 2, 3], 1.5)).toBe(0.25);
  });
});

describe('the bundled WCA reference', () => {
  it("is the desktop app's, with every event in order", () => {
    expect(wcaReference.min_pairs).toBeGreaterThan(0);
    expect(wcaReference.notice).toMatch(/World Cube Association/);
    for (const [eventId, event] of Object.entries(wcaReference.events)) {
      expect(['average', 'best'], eventId).toContain(event.result);
      expect([3, 5], eventId).toContain(event.solves_per_round);
      const quantiles = event.speed.quantiles_cs;
      expect(
        quantiles.every((q, i) => i === 0 || q >= (quantiles[i - 1] as number)),
        eventId,
      ).toBe(true);
    }
    expect(Object.keys(wcaReference.events)).toContain('333');
  });
});
