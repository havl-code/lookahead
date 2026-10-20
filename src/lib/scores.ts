/**
 * The Analytics scores: Speed, Consistency, and Overall, each from 0 to 100, which
 * docs/SCORES.md explains. Ported from the 3.x desktop app's speedcube/scores.py; the golden
 * tests (scores.test.ts) hold the numbers it gave. tools/build_wca_reference.py measures
 * competitors the same way, so no scoring changes here without changing it, and the docs.
 *
 * Both scores place one session among WCA competitors in the same event over the two years up to
 * the export date, as the share of those competitors the session beats:
 *
 * - Speed: the session's typical result, scored the way the WCA ranks the event. The solves are
 *   taken in consecutive groups the size of an official round (5 for an average of 5, 3 for a
 *   mean of 3 or best of 3), each group is scored like a round, and the median is taken.
 * - Consistency: how much back-to-back completed solves differ, relative to the typical solve.
 *
 * Overall is the average of the two.
 */

import type { Result } from './stats.ts';

export interface SpeedReference {
  /** The share of competitors whose typical result is a DNF. */
  readonly dnf_share: number;
  /** 1,001 quantiles of the others' typical results, in centiseconds, fastest first. */
  readonly quantiles_cs: readonly number[];
}

export interface EventReference {
  readonly result: 'average' | 'best';
  readonly solves_per_round: number;
  readonly speed: SpeedReference;
  readonly consistency?: { readonly quantiles: readonly number[] };
}

/** wca_reference.json, built by tools/build_wca_reference.py. */
export interface WcaReference {
  readonly source: string;
  readonly export_date: string;
  readonly window_start: string;
  readonly min_pairs: number;
  readonly notice: string;
  readonly events: Readonly<Record<string, EventReference>>;
}

const dnf = Number.POSITIVE_INFINITY; // a DNF counts as slower than any time

// For normally distributed times, the median gap between two independent solves is 0.9539
// standard deviations (the square root of 2, times 0.6745), so dividing a median gap by this
// estimates the standard deviation: the median moving range estimate.
const medianRangeToSd = 0.9539;

const ascending = (a: number, b: number) => a - b;

/** The median, where a DNF counts as slower than any time, so it can be a DNF. */
export function medianWithDnf(values: readonly number[]): number {
  const sorted = [...values].sort(ascending);
  const n = sorted.length;
  const middle = Math.floor(n / 2);
  return n % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * One group of results scored like a WCA round: the best single for a best of N, otherwise the
 * average, which drops the best and worst of 5 (none of 3) and is a DNF if a DNF is left in.
 */
export function roundResult(attempts: readonly Result[], kind: EventReference['result']): number {
  const times = attempts.map((a) => (a === null ? dnf : a)).sort(ascending);
  if (kind === 'best') return times[0] as number;
  const trim = times.length === 5 ? 1 : 0;
  const kept = times.slice(trim, times.length - trim);
  return kept.includes(dnf) ? dnf : sum(kept) / kept.length;
}

/**
 * The median round result over consecutive groups of `size` results, or null if there isn't a
 * full group. A last group that isn't full is left out.
 */
export function typicalResult(
  results: readonly Result[],
  kind: EventReference['result'],
  size: number,
): number | null {
  const rounds: number[] = [];
  for (let i = 0; i + size <= results.length; i += size)
    rounds.push(roundResult(results.slice(i, i + size), kind));
  return rounds.length === 0 ? null : medianWithDnf(rounds);
}

/**
 * Back-to-back variation as a fraction of the typical (median) completed result, or null with
 * fewer than `minPairs` pairs of back-to-back completed results.
 */
export function spread(results: readonly Result[], minPairs: number): number | null {
  const gaps: number[] = [];
  for (let i = 1; i < results.length; i++) {
    const a = results[i - 1] as Result;
    const b = results[i] as Result;
    if (a !== null && b !== null) gaps.push(Math.abs(b - a));
  }
  if (gaps.length < minPairs) return null;
  const sd = medianWithDnf(gaps) / medianRangeToSd;
  return sd / medianWithDnf(results.filter((r): r is number => r !== null));
}

/** Where `value` goes in an ascending list: the first place it isn't bigger than. */
function bisectLeft(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((sorted[middle] as number) < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Where `value` goes in an ascending list: just after any equal to it. */
function bisectRight(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (value < (sorted[middle] as number)) high = middle;
    else low = middle + 1;
  }
  return low;
}

/**
 * Where `value` falls among the competitors these quantiles describe (from 0, below everyone, to
 * 1, above everyone), counting anyone exactly level as half below.
 */
export function shareBelow(quantiles: readonly number[], value: number): number {
  const lo = bisectLeft(quantiles, value);
  const hi = bisectRight(quantiles, value);
  const steps = quantiles.length - 1;
  if (lo < hi) return (lo + hi - 1) / 2 / steps;
  if (lo === 0) return 0;
  if (lo === quantiles.length) return 1;
  const below = quantiles[lo - 1] as number;
  const above = quantiles[lo] as number;
  return (lo - 1 + (value - below) / (above - below)) / steps;
}

/** The percentage of competitors whose typical result is slower. */
export function speedScore(reference: SpeedReference, typicalMs: number): number {
  const dnfShare = reference.dnf_share;
  // Level with everyone else whose typical result is a DNF.
  if (typicalMs === dnf) return (100 * dnfShare) / 2;
  const faster = shareBelow(reference.quantiles_cs, typicalMs / 10);
  return 100 * ((1 - dnfShare) * (1 - faster) + dnfShare);
}

/** The percentage of competitors whose solves vary more. */
export function consistencyScore(quantiles: readonly number[], sessionSpread: number): number {
  return 100 * (1 - shareBelow(quantiles, sessionSpread));
}

export interface SessionScores {
  readonly speed_score: number | null;
  readonly consistency_score: number | null;
  readonly overall_score: number | null;
  /** The typical result in seconds, unrounded, or null for a DNF or too few solves. */
  readonly typical_result: number | null;
  readonly spread: number | null;
}

/**
 * Scores for one session's results (ms in solve order, null for a DNF). A score is null when
 * there's no WCA comparison for the event or not enough solves to measure it.
 */
export function sessionScores(
  reference: WcaReference,
  eventId: string,
  results: readonly Result[],
): SessionScores {
  const event = Object.hasOwn(reference.events, eventId) ? reference.events[eventId] : undefined;
  let speed: number | null = null;
  let consistency: number | null = null;
  let typicalSeconds: number | null = null;
  let sessionSpread: number | null = null;
  if (event === undefined)
    return {
      speed_score: null,
      consistency_score: null,
      overall_score: null,
      typical_result: null,
      spread: null,
    };

  const typical = typicalResult(results, event.result, event.solves_per_round);
  if (typical !== null) {
    typicalSeconds = typical === dnf ? null : typical / 1000;
    speed = speedScore(event.speed, typical);
  }

  const measured = spread(results, reference.min_pairs);
  if (measured !== null && event.consistency) {
    sessionSpread = measured;
    consistency = consistencyScore(event.consistency.quantiles, measured);
  }

  return {
    speed_score: speed,
    consistency_score: consistency,
    overall_score: speed !== null && consistency !== null ? (speed + consistency) / 2 : null,
    typical_result: typicalSeconds,
    spread: sessionSpread,
  };
}
