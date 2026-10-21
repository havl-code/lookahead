import Dexie from 'dexie';
import type { Penalty } from '../features/timer/clock.ts';
import { type Result, resultMs, rollingWcaAverages } from '../lib/stats.ts';
import { localDate } from '../lib/time.ts';
import type { LookaheadDb } from './database.ts';
import { withStorageErrors } from './errors.ts';
import type { Session, Solve } from './schema.ts';
import { recomputeSessionStats } from './sessions.ts';

/*
 * Sessions and solves, the same as the desktop app's db.py: a session a day per event, solves
 * numbered from 1 with no gaps, and the session's stats worked out again after every change.
 */

const noStats = {
  solve_count: 0,
  best_single: null,
  worst_single: null,
  session_mean: null,
  ao5: null,
  ao12: null,
  best_ao5: null,
  best_ao12: null,
  best_ao50: null,
  best_ao100: null,
} as const;

function solvesOf(db: LookaheadDb, sessionId: number) {
  return db.solves
    .where('[session_id+solve_number]')
    .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey]);
}

/**
 * Moves the session's solves numbered `from` and up along by `by`. They're read first and written
 * after, since changing the numbers while walking the index sorted by them could visit one twice.
 */
async function renumber(
  db: LookaheadDb,
  sessionId: number,
  from: number,
  by: number,
): Promise<void> {
  const moving = await db.solves
    .where('[session_id+solve_number]')
    .between([sessionId, from], [sessionId, Dexie.maxKey])
    .toArray();
  await db.solves.bulkPut(
    moving.map((solve) => ({ ...solve, solve_number: solve.solve_number + by })),
  );
}

/** The event's newest session dated today, or undefined. */
export async function findTodaysSession(
  db: LookaheadDb,
  eventId: string,
  today = localDate(),
): Promise<Session | undefined> {
  const sessions = await db.sessions.where('[event_id+date]').equals([eventId, today]).toArray();
  return sessions.sort((a, b) => b.id - a.id)[0];
}

/**
 * Starts a session for today, as the timer's "+ New session" does (the desktop app's
 * start_timer_session). It keeps the cube from the event's latest session, since people usually
 * stick with the same cube.
 */
export async function startTimerSession(
  db: LookaheadDb,
  eventId: string,
  now = new Date(),
): Promise<number> {
  const latest = (
    await db.sessions
      .where('[event_id+date]')
      .between([eventId, Dexie.minKey], [eventId, Dexie.maxKey])
      .toArray()
  )
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id - b.id)
    .at(-1);
  return withStorageErrors(() =>
    db.sessions.add({
      date: localDate(now),
      event_id: eventId,
      cube_id: latest?.cube_id ?? null,
      notes: 'Live timer session',
      created_at: now.toISOString(),
      ...noStats,
    } as Session),
  );
}

/**
 * The session the timer times into: the one picked on the timer while it still exists for the
 * event, or else the event's newest session dated today, if there is one.
 */
export async function timerSession(
  db: LookaheadDb,
  eventId: string,
  pickedId: number | null,
  today: string,
): Promise<Session | undefined> {
  const picked = pickedId === null ? undefined : await db.sessions.get(pickedId);
  return picked?.event_id === eventId ? picked : findTodaysSession(db, eventId, today);
}

export interface TimedSolve {
  readonly eventId: string;
  /** The attempt's own time in ms, without any +2. A DNF that never started has 0. */
  readonly timeMs: number;
  readonly penalty: Penalty;
  readonly scramble: string;
  /** The session picked on the timer, if any; otherwise (or if it's gone) today's. */
  readonly sessionId?: number | null;
}

/**
 * Saves a solve from the timer into its session (see timerSession), starting today's if there
 * isn't one yet. Returns both ids.
 */
export async function saveTimedSolve(
  db: LookaheadDb,
  solve: TimedSolve,
  now = new Date(),
): Promise<{ readonly solveId: number; readonly sessionId: number }> {
  return withStorageErrors(() =>
    db.transaction('rw', db.sessions, db.solves, async () => {
      const sessionId =
        (await timerSession(db, solve.eventId, solve.sessionId ?? null, localDate(now)))?.id ??
        (await startTimerSession(db, solve.eventId, now));
      const last = await solvesOf(db, sessionId).last();
      const solveId = await db.solves.add({
        session_id: sessionId,
        solve_number: (last?.solve_number ?? 0) + 1,
        time_ms: solve.timeMs,
        scramble: solve.scramble,
        penalty: solve.penalty,
        dnf: solve.penalty === 'DNF',
        notes: '',
        timestamp: now.toISOString(),
      } as Solve);
      await recomputeSessionStats(db, sessionId);
      return { solveId, sessionId };
    }),
  );
}

/**
 * Whether a solve can only be a DNF: one with no time, because it never started (an inspection
 * DNF, Regulation A4d2). As OK or +2 it would be a 0.00 or a 2.00.
 */
export function onlyDnf(solve: Pick<Solve, 'time_ms'>): boolean {
  return solve.time_ms === 0;
}

/** Changes a solve's penalty, and its session's stats with it. A solve with no time stays a DNF. */
export async function setPenalty(
  db: LookaheadDb,
  solveId: number,
  penalty: Penalty,
): Promise<void> {
  await withStorageErrors(() =>
    db.transaction('rw', db.sessions, db.solves, async () => {
      const solve = await db.solves.get(solveId);
      if (!solve || (penalty !== 'DNF' && onlyDnf(solve))) return;
      await db.solves.update(solveId, { penalty, dnf: penalty === 'DNF' });
      await recomputeSessionStats(db, solve.session_id);
    }),
  );
}

/**
 * Deletes a solve and closes the gap in its session's numbering. Returns the solve as it was, so
 * it can be put back with restoreSolve, or undefined if there's no such solve.
 */
export async function deleteSolve(db: LookaheadDb, solveId: number): Promise<Solve | undefined> {
  return db.transaction('rw', db.sessions, db.solves, async () => {
    const solve = await db.solves.get(solveId);
    if (!solve) return undefined;
    await db.solves.delete(solveId);
    await renumber(db, solve.session_id, solve.solve_number + 1, -1);
    await recomputeSessionStats(db, solve.session_id);
    return solve;
  });
}

/**
 * Puts a deleted solve back at its old number (or at the end, if its session has fewer solves
 * now), moving the solves after it along by one, with its old id. Nothing happens if its session
 * has gone.
 */
export async function restoreSolve(db: LookaheadDb, solve: Solve): Promise<void> {
  await withStorageErrors(() =>
    db.transaction('rw', db.sessions, db.solves, async () => {
      if (!(await db.sessions.get(solve.session_id))) return;
      const last = await solvesOf(db, solve.session_id).last();
      const number = Math.min(solve.solve_number, (last?.solve_number ?? 0) + 1);
      await renumber(db, solve.session_id, number, 1);
      await db.solves.put({ ...solve, solve_number: number });
      await recomputeSessionStats(db, solve.session_id);
    }),
  );
}

/** A session's latest `limit` solves, newest first. */
export async function latestSolves(
  db: LookaheadDb,
  sessionId: number,
  limit: number,
): Promise<Solve[]> {
  return solvesOf(db, sessionId).reverse().limit(limit).toArray();
}

/** A solve with the Ao5 and Ao12 at it, in ms: null before its window fills, or for a DNF. */
export type SolveWithAverages = Solve & { readonly ao5: Result; readonly ao12: Result };

/**
 * A session's `limit` solves ending at solve `endAt` (its latest by default), newest first, each
 * with the Ao5 and Ao12 at it. It reads the 11 solves before the oldest one returned too, so that
 * one's Ao12 is whole, and never reads beyond the session. The Ao12 drops one result from each
 * end, as the Ao5 does (Regulation 9f8); that's a community convention, not a WCA rule.
 */
export async function solvesWithAverages(
  db: LookaheadDb,
  sessionId: number,
  limit: number,
  endAt?: number,
): Promise<SolveWithAverages[]> {
  const solves = (
    await db.solves
      .where('[session_id+solve_number]')
      .between([sessionId, Dexie.minKey], [sessionId, endAt ?? Dexie.maxKey], true, true)
      .reverse()
      .limit(limit + 11)
      .toArray()
  ).reverse();
  const results = solves.map(resultMs);
  const ao5 = rollingWcaAverages(results, 5);
  const ao12 = rollingWcaAverages(results, 12);
  return solves
    .map((solve, i) => ({ ...solve, ao5: ao5[i] ?? null, ao12: ao12[i] ?? null }))
    .slice(-limit)
    .reverse();
}

/** Changes a solve's notes (already checked). They don't change any stats. */
export async function setSolveNotes(
  db: LookaheadDb,
  solveId: number,
  notes: string,
): Promise<void> {
  await withStorageErrors(() => db.solves.update(solveId, { notes }));
}

export interface TypedSolve {
  /** The attempt's own time in ms, without any +2; 0 for a DNF that never started. */
  readonly timeMs: number;
  readonly penalty: Penalty;
  readonly scramble: string;
  readonly notes: string;
}

/** Adds a solve typed in by hand to the end of a session. Returns its id. */
export async function addSolve(
  db: LookaheadDb,
  sessionId: number,
  solve: TypedSolve,
  now = new Date(),
): Promise<number> {
  return withStorageErrors(() =>
    db.transaction('rw', db.sessions, db.solves, async () => {
      const last = await solvesOf(db, sessionId).last();
      const solveId = await db.solves.add({
        session_id: sessionId,
        solve_number: (last?.solve_number ?? 0) + 1,
        time_ms: solve.timeMs,
        scramble: solve.scramble,
        penalty: solve.penalty,
        dnf: solve.penalty === 'DNF',
        notes: solve.notes,
        timestamp: now.toISOString(),
      } as Solve);
      await recomputeSessionStats(db, sessionId);
      return solveId;
    }),
  );
}

export type SolveSort = 'number' | 'fastest' | 'slowest';

/** A solve's result for sorting: its time with any +2, and DNFs slower than any time. */
function sortKey(solve: Solve): number {
  if (solve.dnf) return Number.POSITIVE_INFINITY;
  return solve.time_ms + (solve.penalty === '+2' ? 2000 : 0);
}

/**
 * One page of a session's solves, in solve order (newest first) or by result, as the desktop
 * app's solves table sorts them. DNFs come last when fastest first, and first when slowest
 * first; ties keep solve order.
 */
export async function sessionSolves(
  db: LookaheadDb,
  sessionId: number,
  sort: SolveSort,
  limit: number,
): Promise<Solve[]> {
  if (sort === 'number') return latestSolves(db, sessionId, limit);
  const solves = await solvesOf(db, sessionId).toArray();
  const sign = sort === 'fastest' ? 1 : -1;
  solves.sort((a, b) => sign * (sortKey(a) - sortKey(b)) || a.solve_number - b.solve_number);
  return solves.slice(0, limit);
}
