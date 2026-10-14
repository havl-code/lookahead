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

/** Changes a solve's penalty, and its session's stats with it. */
export async function setPenalty(
  db: LookaheadDb,
  solveId: number,
  penalty: Penalty,
): Promise<void> {
  await withStorageErrors(() =>
    db.transaction('rw', db.sessions, db.solves, async () => {
      const solve = await db.solves.get(solveId);
      if (!solve) return;
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
