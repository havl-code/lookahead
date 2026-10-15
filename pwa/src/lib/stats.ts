/**
 * WCA-style results and averages, the same as the desktop app's speedcube/stats.py. The golden
 * tests (stats.test.ts) check that both give exactly the same numbers.
 *
 * Solve times are stored in milliseconds as the raw attempt time; a +2 penalty is added on top
 * wherever a result is shown or averaged, as in WCA competitions. A result is null for a DNF.
 */

export type Result = number | null;

/** Rounds to the nearest whole number, with halves going up (12.5 to 13). */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/** Rounds to 2 places, with halves going up, as stats.py's round2. */
export function round2(value: number): number {
  return roundHalfUp(value * 100) / 100;
}

// Results are written the way the WCA records them. Regulation 9f1: a single under 10 minutes is
// truncated (cut off, not rounded) to the hundredth of a second, and an average or mean under 10
// minutes is rounded to the nearest hundredth. Regulation 9f2: from 10 minutes up, singles are
// truncated and averages rounded to the whole second. Averages are worked out from the truncated
// singles, as they are from the times recorded in a competition.
export const tenMinutesMs = 10 * 60 * 1000;

/** A single as the WCA records it, in ms: truncated to the hundredth, or the second from 10 minutes up. */
export function wcaSingleMs(ms: number): number;
export function wcaSingleMs(ms: Result): Result;
export function wcaSingleMs(ms: Result): Result {
  if (ms === null) return null;
  const whole = Math.trunc(ms);
  return whole >= tenMinutesMs ? whole - (whole % 1000) : whole - (whole % 10);
}

/** A single result in seconds, as the WCA records it (Regulations 9f1 and 9f2). */
export function singleSeconds(ms: Result): number | null {
  return ms === null ? null : round2(wcaSingleMs(ms) / 1000);
}

/** An average or mean in seconds, rounded to the hundredth, or the second from 10 minutes up. */
export function averageSeconds(ms: Result): number | null {
  if (ms === null) return null;
  if (ms >= tenMinutesMs) return roundHalfUp(ms / 1000);
  return roundHalfUp(ms / 10) / 100;
}

export interface Attempt {
  readonly time_ms: number;
  readonly penalty: string | null;
  readonly dnf: boolean;
}

/** A solve's result in ms: null for a DNF, the raw time plus 2000 for a +2 penalty. */
export function resultMs(attempt: Attempt): Result {
  if (attempt.dnf) return null;
  return attempt.penalty === '+2' ? attempt.time_ms + 2000 : attempt.time_ms;
}

const byNumber = (a: number, b: number) => a - b;

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * A WCA-style average: drop the best `trim` and the worst `trim`, where a DNF counts as slower
 * than any time, and average the rest. More DNFs than `trim` make it a DNF (null). With trim 1
 * over 5 results this is Regulations 9f8 and 9f9.
 */
export function trimmedAverage(results: readonly Result[], trim = 1): Result {
  const times: number[] = [];
  for (const result of results) if (result !== null) times.push(wcaSingleMs(result));
  if (results.length - times.length > trim) return null;
  times.sort(byNumber);
  const kept = times.slice(trim, results.length - trim);
  return sum(kept) / kept.length;
}

// The averages the app tracks bests for. The WCA defines only the average of 5 (Regulation 9f8,
// which drops one result from each end). Longer averages follow the community convention
// (csTimer's, and the SpeedSolving wiki's): drop 5% of the results from each end, rounded up, so
// 1 for an Ao12, 3 for an Ao50, and 5 for an Ao100. That also gives 1 for an Ao5.
export const averageSizes = [5, 12, 50, 100] as const;
export type AverageSize = (typeof averageSizes)[number];

/** How many results an average of `size` drops from each end. */
export function trimFor(size: number): number {
  return Math.ceil(size * 0.05);
}

/** Where `value` goes in an ascending list: the first place it isn't bigger than. */
function lowerBound(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((sorted[middle] as number) < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The best (lowest) average of `size` results in a row, and the index of the last result in it,
 * or nulls if there's no such average that isn't a DNF. The window slides along a sorted list, so
 * a session of tens of thousands of solves doesn't re-sort every window.
 */
export function bestAverage(
  results: readonly Result[],
  size: number,
): { readonly average: number | null; readonly end: number | null } {
  if (results.length < size) return { average: null, end: null };
  const trim = trimFor(size);
  const values = results.map((result) => wcaSingleMs(result));
  const times = values
    .slice(0, size)
    .filter((value): value is number => value !== null)
    .sort(byNumber);
  let dnfs = size - times.length;
  let best: number | null = null;
  let bestEnd: number | null = null;
  for (let end = size - 1; end < values.length; end++) {
    if (end >= size) {
      const leaving = values[end - size] as Result;
      const arriving = values[end] as Result;
      if (leaving === null) dnfs -= 1;
      else times.splice(lowerBound(times, leaving), 1);
      if (arriving === null) dnfs += 1;
      else times.splice(lowerBound(times, arriving), 0, arriving);
    }
    if (dnfs <= trim) {
      const average = sum(times.slice(trim, size - trim)) / (size - 2 * trim);
      if (best === null || average < best) {
        best = average;
        bestEnd = end;
      }
    }
  }
  return { average: best, end: bestEnd };
}

export interface SessionStats {
  solve_count: number;
  best_single: number | null;
  worst_single: number | null;
  session_mean: number | null;
  ao5: number | null;
  ao12: number | null;
  best_ao5: number | null;
  best_ao12: number | null;
  best_ao50: number | null;
  best_ao100: number | null;
}

/**
 * A session's stats from its solves in solve order: the count, best and worst results (with +2s),
 * the mean of the singles as the WCA records them, the last Ao5 and Ao12, and the best Ao5, Ao12,
 * Ao50, and Ao100. The same as the desktop app's db.recompute_session_stats.
 */
export function sessionStats(attempts: readonly Attempt[]): SessionStats {
  const results = attempts.map(resultMs);
  const times = results.filter((result): result is number => result !== null);
  const count = results.length;
  const best = (size: AverageSize) => bestAverage(results, size).average;
  return {
    solve_count: count,
    best_single: times.length > 0 ? Math.min(...times) : null,
    worst_single: times.length > 0 ? Math.max(...times) : null,
    session_mean:
      times.length > 0 ? sum(times.map((time) => wcaSingleMs(time))) / times.length : null,
    ao5: count >= 5 ? trimmedAverage(results.slice(-5)) : null,
    ao12: count >= 12 ? trimmedAverage(results.slice(-12)) : null,
    best_ao5: best(5),
    best_ao12: best(12),
    best_ao50: best(50),
    best_ao100: best(100),
  };
}

// ---- Chart maths, the same as stats.py's ----

/**
 * The WCA-style average of each run of `size` results in a row, in order, for the charts' rolling
 * Ao5 and Ao12. Null until a window fills, and null for a window that's a DNF; DNFs count the WCA
 * way rather than being skipped.
 */
export function rollingWcaAverages(results: readonly Result[], size: number): Result[] {
  return results.map((_, i) =>
    i >= size - 1 ? trimmedAverage(results.slice(i - size + 1, i + 1)) : null,
  );
}

/**
 * Which positions of an average's window are dropped: the best trimFor(size) and the worst as
 * many, with DNFs as the worst (ties go to the earlier solve).
 */
export function droppedInWindow(window: readonly Result[], size: number): Set<number> {
  const trim = trimFor(size);
  const order = window
    .map((_, i) => i)
    .sort((a, b) => {
      const x = window[a] ?? null;
      const y = window[b] ?? null;
      if ((x === null) !== (y === null)) return x === null ? 1 : -1;
      return (x ?? 0) - (y ?? 0) || a - b;
    });
  return new Set([...order.slice(0, trim), ...order.slice(order.length - trim)]);
}

export function sampleStdDev(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = sum(values) / n;
  return Math.sqrt(sum(values.map((x) => (x - mean) ** 2)) / (n - 1));
}

export function populationStdDev(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = sum(values) / n;
  return Math.sqrt(sum(values.map((x) => (x - mean) ** 2)) / n);
}

/** Linear-interpolated quantile of an already sorted list. */
export function quantile(sorted: readonly number[], q: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const index = q * (n - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const low = sorted[lower] as number;
  if (lower === upper) return low;
  return low + ((sorted[upper] as number) - low) * (index - lower);
}

export interface BoxStats {
  readonly count: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly lowerfence: number;
  readonly upperfence: number;
  readonly mean: number;
  readonly sd: number;
}

/**
 * Box plot summary of an already sorted, non-empty list: quartiles, whiskers (the furthest times
 * within 1.5 times the box height of the box), mean, and standard deviation.
 */
export function boxStats(sorted: readonly number[]): BoxStats {
  const q1 = quantile(sorted, 0.25) as number;
  const median = quantile(sorted, 0.5) as number;
  const q3 = quantile(sorted, 0.75) as number;
  const reach = 1.5 * (q3 - q1);
  return {
    count: sorted.length,
    q1,
    median,
    q3,
    lowerfence: sorted.find((t) => t >= q1 - reach) as number,
    upperfence: sorted.findLast((t) => t <= q3 + reach) as number,
    mean: sum(sorted) / sorted.length,
    sd: populationStdDev(sorted),
  };
}

/**
 * Drops times more than 3 standard deviations from the mean. If that would throw away more than
 * 10% of them, keeps the 1st to 99th percentile instead.
 */
export function filterDistributionOutliers(times: readonly number[]): number[] {
  const sd = sampleStdDev(times);
  if (sd <= 0) return [...times];
  const mean = sum(times) / times.length;
  let kept = times.filter((t) => mean - 3 * sd <= t && t <= mean + 3 * sd);
  if (kept.length < times.length * 0.9) {
    const ordered = [...times].sort(byNumber);
    const p1 = quantile(ordered, 0.01) as number;
    const p99 = quantile(ordered, 0.99) as number;
    kept = times.filter((t) => p1 <= t && t <= p99);
  }
  return kept;
}
