import Dexie from 'dexie';
import { sessionStats } from '../lib/stats.ts';
import type { LookaheadDb } from './database.ts';
import { withStorageErrors } from './errors.ts';
import type { Session, Solve } from './schema.ts';

const inSolveOrder = (a: Solve, b: Solve) => a.solve_number - b.solve_number || a.id - b.id;

/** Works out a session's stats again from its solves. Run it after any change to them. */
export async function recomputeSessionStats(db: LookaheadDb, sessionId: number): Promise<void> {
  await db.transaction('rw', db.sessions, db.solves, async () => {
    const solves = await db.solves
      .where('[session_id+solve_number]')
      .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
      .toArray();
    await db.sessions.update(sessionId, sessionStats(solves.sort(inSolveOrder)));
  });
}

/** Works out every session's stats again, reading each solve once. */
export async function recomputeAllSessionStats(db: LookaheadDb): Promise<void> {
  await db.transaction('rw', db.sessions, db.solves, async () => {
    const bySession = new Map<number, Solve[]>();
    await db.solves.each((solve) => {
      const list = bySession.get(solve.session_id);
      if (list) list.push(solve);
      else bySession.set(solve.session_id, [solve]);
    });
    const sessions = await db.sessions.toArray();
    await db.sessions.bulkPut(
      sessions.map((session) => ({
        ...session,
        ...sessionStats((bySession.get(session.id) ?? []).sort(inSolveOrder)),
      })),
    );
  });
}

export interface NewSession {
  readonly eventId: string;
  /** YYYY-MM-DD, already checked. */
  readonly date: string;
  readonly cubeId: number | null;
  readonly notes: string;
}

/** A new, empty session, as the desktop app's Add Session makes one. Returns its id. */
export async function addSession(
  db: LookaheadDb,
  session: NewSession,
  now = new Date(),
): Promise<number> {
  return withStorageErrors(() =>
    db.sessions.add({
      date: session.date,
      event_id: session.eventId,
      cube_id: session.cubeId,
      notes: session.notes,
      created_at: now.toISOString(),
      ...sessionStats([]),
    } as Session),
  );
}

/**
 * Changes whichever of a session's date, cube, and notes are given (already checked). Its stats
 * don't depend on any of them, so they stay as they are.
 */
export async function updateSession(
  db: LookaheadDb,
  sessionId: number,
  fields: Partial<Pick<Session, 'date' | 'cube_id' | 'notes'>>,
): Promise<void> {
  await withStorageErrors(() => db.sessions.update(sessionId, fields));
}

/** Deletes a session and its solves. */
export async function deleteSession(db: LookaheadDb, sessionId: number): Promise<void> {
  await db.transaction('rw', db.sessions, db.solves, async () => {
    await db.solves
      .where('[session_id+solve_number]')
      .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
      .delete();
    await db.sessions.delete(sessionId);
  });
}
