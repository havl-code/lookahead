import Dexie from 'dexie';
import type { LookaheadDb } from '../../db/database.ts';
import type { Session, Solve } from '../../db/schema.ts';
import { type SessionScores, sessionScores, type WcaReference } from '../../lib/scores.ts';
import {
  type AverageSize,
  type BoxStats,
  bestAverage,
  boxStats,
  droppedInWindow,
  filterDistributionOutliers,
  populationStdDev,
  type Result,
  resultMs,
  rollingWcaAverages,
  wcaSingleMs,
} from '../../lib/stats.ts';

/*
 * What the Analytics tab shows, worked out on the device the same way as the 3.x desktop app's
 * /api/stats, /api/analytics/session-heatmap, and /api/charts routes (speedcube/api.py).
 */

// The biggest charts only use this many solves, so even tens of thousands stay quick to draw.
export const maxChartSolves = 1000;
export const maxDistributionSolves = 10_000;

const newestFirst = (a: Session, b: Session) =>
  (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id;
const inSolveOrder = (a: Solve, b: Solve) => a.solve_number - b.solve_number || a.id - b.id;
const latestFirst = (a: Solve, b: Solve) =>
  (b.timestamp ?? '').localeCompare(a.timestamp ?? '') || b.id - a.id;

export async function eventSessions(db: LookaheadDb, eventId: string): Promise<Session[]> {
  const sessions = await db.sessions
    .where('[event_id+date]')
    .between([eventId, Dexie.minKey], [eventId, Dexie.maxKey])
    .toArray();
  return sessions.sort(newestFirst);
}

async function solvesOf(db: LookaheadDb, sessionId: number): Promise<Solve[]> {
  const solves = await db.solves
    .where('[session_id+solve_number]')
    .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
    .toArray();
  return solves.sort(inSolveOrder);
}

/** Every solve in the event's sessions, newest first. */
async function eventSolves(db: LookaheadDb, sessions: readonly Session[]): Promise<Solve[]> {
  const ids = sessions.map((session) => session.id);
  const solves = await db.solves.where('session_id').anyOf(ids).toArray();
  return solves.sort(latestFirst);
}

export interface BestAverage {
  readonly value: number;
  readonly sessionId: number;
  readonly date: string | null;
}

export interface Overview {
  readonly sessions: number;
  readonly solves: number;
  /** The best single in ms (with any +2), and the session it's from, or null. */
  readonly best: {
    readonly ms: number;
    readonly sessionId: number;
    readonly date: string | null;
  } | null;
  /** The mean of every completed solve, as the WCA records singles, in ms, or null. */
  readonly average: number | null;
  readonly bestAverages: Readonly<Record<5 | 12 | 50 | 100, BestAverage | null>>;
}

const averageKeys = { 5: 'best_ao5', 12: 'best_ao12', 50: 'best_ao50', 100: 'best_ao100' } as const;

/** The event's best of a stored stat: lowest, then the earliest session, as the desktop picks. */
function bestOf(sessions: readonly Session[], key: keyof Session) {
  let best: Session | null = null;
  for (const session of sessions) {
    const value = session[key] as number | null;
    if (value === null) continue;
    const current = best?.[key] as number | null | undefined;
    if (
      best === null ||
      current === null ||
      current === undefined ||
      value < current ||
      (value === current &&
        ((session.date ?? '') < (best.date ?? '') ||
          (session.date === best.date && session.id < best.id)))
    )
      best = session;
  }
  return best;
}

/**
 * The event's numbers for the top of the tab: the best single, the average of every solve, the
 * best averages (each from the session that holds it), and the totals.
 */
export async function eventOverview(db: LookaheadDb, eventId: string): Promise<Overview> {
  const sessions = await eventSessions(db, eventId);
  const solves = await db.solves
    .where('session_id')
    .anyOf(sessions.map((session) => session.id))
    .toArray();
  let total = 0;
  let completed = 0;
  for (const solve of solves) {
    const result = resultMs(solve);
    if (result === null) continue;
    total += wcaSingleMs(result);
    completed += 1;
  }
  const bestSession = bestOf(sessions, 'best_single');
  const bestAverage = (size: 5 | 12 | 50 | 100): BestAverage | null => {
    const session = bestOf(sessions, averageKeys[size]);
    const value = session?.[averageKeys[size]];
    return session && value != null ? { value, sessionId: session.id, date: session.date } : null;
  };
  return {
    sessions: sessions.length,
    solves: sessions.reduce((sum, session) => sum + session.solve_count, 0),
    best:
      bestSession && bestSession.best_single !== null
        ? { ms: bestSession.best_single, sessionId: bestSession.id, date: bestSession.date }
        : null,
    average: completed > 0 ? total / completed : null,
    bestAverages: {
      5: bestAverage(5),
      12: bestAverage(12),
      50: bestAverage(50),
      100: bestAverage(100),
    },
  };
}

export type PbKind = 'single' | AverageSize;

export interface SingleDetails {
  readonly kind: 'single';
  readonly scramble: string | null;
}

export interface AverageDetails {
  readonly kind: AverageSize;
  /** The solves of the best average, in order, with the dropped ones not counted. */
  readonly solves: readonly {
    readonly solveNumber: number;
    readonly ms: Result;
    readonly counted: boolean;
  }[];
}

/**
 * Where a PB in a session came from, as the desktop app's /api/pb-details gives it: the best
 * single's scramble (the earlier solve on a tie), or a best average's solves, with the dropped
 * ones marked. Null if the session has no such PB.
 */
export async function pbDetails(
  db: LookaheadDb,
  sessionId: number,
  kind: PbKind,
): Promise<SingleDetails | AverageDetails | null> {
  const solves = await solvesOf(db, sessionId);
  const results = solves.map(resultMs);
  if (kind === 'single') {
    let best: { readonly solve: Solve; readonly ms: number } | null = null;
    for (const [i, solve] of solves.entries()) {
      const ms = results[i] ?? null;
      if (ms === null) continue;
      if (best === null || ms < best.ms || (ms === best.ms && solve.id < best.solve.id))
        best = { solve, ms };
    }
    return best && { kind, scramble: best.solve.scramble || null };
  }
  const { end } = bestAverage(results, kind);
  if (end === null) return null;
  const start = end - kind + 1;
  const window = results.slice(start, end + 1);
  const dropped = droppedInWindow(window, kind);
  return {
    kind,
    solves: window.map((ms, i) => ({
      solveNumber: (solves[start + i] as Solve).solve_number,
      ms,
      counted: !dropped.has(i),
    })),
  };
}

export interface ScoredSession extends SessionScores {
  readonly session: Session;
}

/** The event's latest 50 sessions, newest first, each with its scores. */
export async function scoredSessions(
  db: LookaheadDb,
  eventId: string,
  reference: WcaReference,
): Promise<ScoredSession[]> {
  const sessions = (await eventSessions(db, eventId)).slice(0, 50);
  return Promise.all(
    sessions.map(async (session) => ({
      session,
      ...sessionScores(reference, eventId, (await solvesOf(db, session.id)).map(resultMs)),
    })),
  );
}

// ---- Charts ----

export interface ProgressPoint {
  readonly label: string;
  readonly best: Result;
  readonly mean: Result;
  readonly ao5: Result;
}

/** Each session's best, mean, and last Ao5, for its latest 500 sessions with 5 solves or more. */
export function eventProgress(sessions: readonly Session[]): ProgressPoint[] {
  return sessions
    .filter((session) => session.solve_count >= 5)
    .slice(0, 500)
    .reverse()
    .map((session) => ({
      label: session.date ?? '',
      best: session.best_single,
      mean: session.session_mean,
      ao5: session.ao5,
    }));
}

export interface SolvePoint {
  readonly solveNumber: number;
  readonly time: Result;
  readonly mean: Result;
  readonly ao5: Result;
}

/** A session's latest 1,000 solves, with its running mean and Ao5 (DNFs counted the WCA way). */
export function sessionProgress(solves: readonly Solve[]): SolvePoint[] {
  const latest = solves.slice(-maxChartSolves);
  const results = latest.map(resultMs);
  const ao5s = rollingWcaAverages(results, 5);
  let total = 0;
  let completed = 0;
  return latest.map((solve, i) => {
    const result = results[i] as Result;
    if (result !== null) {
      total += wcaSingleMs(result);
      completed += 1;
    }
    return {
      solveNumber: solve.solve_number,
      time: result,
      mean: completed ? total / completed : null,
      ao5: ao5s[i] as Result,
    };
  });
}

/** Results in seconds for the distribution: the latest 10,000, without the far-off ones. */
export function distribution(results: readonly Result[], wholeEvent: boolean): number[] {
  const times = results
    .filter((r): r is number => r !== null)
    .slice(-maxDistributionSolves)
    .map((r) => r / 1000)
    .sort((a, b) => a - b);
  if (times.length < 5) return [];
  if (wholeEvent) return filterDistributionOutliers(times);
  // One session: within 5 standard deviations of its mean, as the desktop app keeps them.
  const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
  const sd = populationStdDev(times);
  return times.filter((t) => Math.abs(t - mean) <= 5 * sd);
}

export interface Rolling {
  readonly times: Result[];
  readonly ao5: Result[];
  readonly ao12: Result[];
}

/** The latest 1,000 results, oldest first, with rolling Ao5 and Ao12, or null with fewer than 12. */
export function rolling(results: readonly Result[]): Rolling | null {
  const latest = results.slice(-maxChartSolves);
  if (latest.length < 12) return null;
  return {
    times: [...latest],
    ao5: rollingWcaAverages(latest, 5),
    ao12: rollingWcaAverages(latest, 12),
  };
}

export interface SessionBox extends BoxStats {
  readonly sessionId: number;
  readonly date: string | null;
}

export interface ChartData {
  readonly progress: ProgressPoint[] | SolvePoint[];
  readonly distribution: number[];
  readonly rolling: Rolling | null;
  /** Box plots of the last 10 sessions, for the whole event only; null with fewer than 2. */
  readonly consistency: SessionBox[] | null;
}

/** Everything the charts draw, for the whole event or one of its sessions. */
export async function chartData(
  db: LookaheadDb,
  eventId: string,
  sessionId: number | null,
): Promise<ChartData> {
  if (sessionId !== null) {
    const solves = await solvesOf(db, sessionId);
    const results = solves.map(resultMs);
    return {
      progress: sessionProgress(solves),
      distribution: distribution(results, false),
      rolling: rolling(results),
      consistency: null,
    };
  }
  const sessions = await eventSessions(db, eventId);
  const solves = (await eventSolves(db, sessions)).reverse(); // oldest first
  const results = solves.map(resultMs);

  const boxes: SessionBox[] = [];
  for (const session of sessions
    .filter((s) => s.solve_count >= 5)
    .slice(0, 15)
    .reverse()) {
    const times = (await solvesOf(db, session.id))
      .map(resultMs)
      .filter((r): r is number => r !== null)
      .map((r) => r / 1000)
      .sort((a, b) => a - b);
    if (times.length >= 5)
      boxes.push({ sessionId: session.id, date: session.date, ...boxStats(times) });
  }
  const last10 = boxes.slice(-10);
  return {
    progress: eventProgress(sessions),
    distribution: distribution(results, true),
    rolling: rolling(results),
    consistency: last10.length >= 2 ? last10 : null,
  };
}
