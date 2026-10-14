import Dexie from 'dexie';
import { sessionStats } from '../lib/stats.ts';
import type { LookaheadDb } from './database.ts';
import type { Solve } from './schema.ts';

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
