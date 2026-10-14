import Dexie from 'dexie';
import type { Penalty } from '../features/timer/clock.ts';
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
 * The event's newest session dated today, starting one if there isn't one yet. A new one keeps
 * the cube from the event's latest session, since people usually stick with the same cube.
 */
async function todaysSession(db: LookaheadDb, eventId: string, now: Date): Promise<number> {
  const today = localDate(now);
  const existing = await findTodaysSession(db, eventId, today);
  if (existing) return existing.id;
  const latest = (
    await db.sessions
      .where('[event_id+date]')
      .between([eventId, Dexie.minKey], [eventId, Dexie.maxKey])
      .toArray()
  )
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id - b.id)
    .at(-1);
  return db.sessions.add({
    date: today,
    event_id: eventId,
    cube_id: latest?.cube_id ?? null,
    notes: 'Live timer session',
    created_at: now.toISOString(),
    ...noStats,
  } as Session);
}

export interface TimedSolve {
  readonly eventId: string;
  /** The attempt's own time in ms, without any +2. A DNF that never started has 0. */
  readonly timeMs: number;
  readonly penalty: Penalty;
  readonly scramble: string;
}

/** Saves a solve from the timer into today's session for its event. Returns both ids. */
export async function saveTimedSolve(
  db: LookaheadDb,
  solve: TimedSolve,
  now = new Date(),
): Promise<{ readonly solveId: number; readonly sessionId: number }> {
  return withStorageErrors(() =>
    db.transaction('rw', db.sessions, db.solves, async () => {
      const sessionId = await todaysSession(db, solve.eventId, now);
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
