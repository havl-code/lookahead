import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { type CubeUsage, cubeUsage } from './cubes.ts';
import { useDb } from './DbProvider.tsx';
import type { LookaheadDb, SafetyCopy } from './database.ts';
import { getMeta, type Meta } from './meta.ts';
import type { Cube, Session, Solve } from './schema.ts';
import {
  type SolveSort,
  type SolveWithAverages,
  sessionSolves,
  solvesWithAverages,
  timerSession,
} from './solves.ts';
import {
  latestSafetyCopy,
  type StoredCounts,
  storedCounts,
  type UnbackedSolves,
  unbackedSolves,
} from './stored.ts';
import { getTimerSettings, type TimerSettings } from './timerSettings.ts';
import { getWcaPerson, type WcaPerson } from './user.ts';

export type SessionSort = 'newest' | 'oldest' | 'best' | 'ao5';

const newestFirst = (a: Session, b: Session) =>
  (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id;

/** Lowest first, with sessions that have none last, then newest first. */
const byLowest = (value: (session: Session) => number | null) => (a: Session, b: Session) => {
  const x = value(a);
  const y = value(b);
  if (x !== y) {
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  }
  return newestFirst(a, b);
};

const sessionSorts: Record<SessionSort, (a: Session, b: Session) => number> = {
  newest: newestFirst,
  oldest: (a, b) => -newestFirst(a, b),
  best: byLowest((session) => session.best_single),
  ao5: byLowest((session) => session.best_ao5),
};

function sessionsFor(db: LookaheadDb, eventId: string | null) {
  return eventId === null
    ? db.sessions.toCollection()
    : db.sessions
        .where('[event_id+date]')
        .between([eventId, Dexie.minKey], [eventId, Dexie.maxKey]);
}

/**
 * The first `limit` sessions, for one event or all of them, in the order asked for, and how many
 * there are in all. Undefined while loading.
 */
export function useSessions(
  limit: number,
  eventId: string | null = null,
  sort: SessionSort = 'newest',
): { readonly sessions: Session[]; readonly total: number } | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const all = await sessionsFor(db, eventId).toArray();
    return { sessions: all.sort(sessionSorts[sort]).slice(0, limit), total: all.length };
  }, [db, limit, eventId, sort]);
}

/** The events that have sessions, for the filter. Undefined while loading. */
export function useSessionEvents(): string[] | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const keys = await db.sessions.orderBy('[event_id+date]').uniqueKeys();
    return [...new Set(keys.map((key) => (key as unknown as [string, string])[0]))];
  }, [db]);
}

/** One session, null if there's no such session. Undefined while loading. */
export function useSession(sessionId: number): Session | null | undefined {
  const db = useDb();
  return useLiveQuery(async () => (await db.sessions.get(sessionId)) ?? null, [db, sessionId]);
}

/** One page of a session's solves. Undefined while loading. */
export function useSessionSolves(
  sessionId: number,
  sort: SolveSort,
  limit: number,
): Solve[] | undefined {
  const db = useDb();
  return useLiveQuery(
    () => sessionSolves(db, sessionId, sort, limit),
    [db, sessionId, sort, limit],
  );
}

/** How each cube has been used. Undefined while loading. */
export function useCubeUsage(): Map<number, CubeUsage> | undefined {
  const db = useDb();
  return useLiveQuery(() => cubeUsage(db), [db]);
}

/** The person's WCA ID and name, null if not set. Undefined while loading. */
export function useWcaPerson(): WcaPerson | null | undefined {
  const db = useDb();
  return useLiveQuery(() => getWcaPerson(db), [db]);
}

/** Every cube, by ID. Undefined while loading. */
export function useCubes(): Map<number, Cube> | undefined {
  const db = useDb();
  return useLiveQuery(
    async () => new Map((await db.cubes.toArray()).map((cube) => [cube.id, cube])),
    [db],
  );
}

/** How much is stored here. Undefined while loading. */
export function useStoredCounts(): StoredCounts | undefined {
  const db = useDb();
  return useLiveQuery(() => storedCounts(db), [db]);
}

/** One of this device's own values. Undefined while loading. */
export function useMeta<K extends keyof Meta>(key: K): Meta[K] | undefined {
  const db = useDb();
  return useLiveQuery(() => getMeta(db, key), [db, key]);
}

/** What was here before the last restore, null if nothing. Undefined while loading. */
export function useSafetyCopy(): SafetyCopy | null | undefined {
  const db = useDb();
  return useLiveQuery(async () => (await latestSafetyCopy(db)) ?? null, [db]);
}

/** The timer settings. Undefined while loading. */
export function useTimerSettings(): TimerSettings | undefined {
  const db = useDb();
  return useLiveQuery(() => getTimerSettings(db), [db]);
}

/**
 * The session the timer times into, with its latest `limit` solves, newest first, each with the
 * Ao5 and Ao12 at it: the one picked on the timer while it still exists, or else the event's
 * session for today. Null when today's first solve hasn't been timed yet. Undefined while loading.
 */
export function useTimerSession(
  eventId: string,
  today: string,
  pickedId: number | null,
  limit: number,
): { readonly session: Session; readonly solves: SolveWithAverages[] } | null | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const session = await timerSession(db, eventId, pickedId, today);
    return session ? { session, solves: await solvesWithAverages(db, session.id, limit) } : null;
  }, [db, eventId, today, pickedId, limit]);
}

/** A solve with the Ao5 and Ao12 at it, for its sheet. Undefined while loading. */
export function useSolveAverages(
  solve: Pick<Solve, 'session_id' | 'solve_number'> | null,
): SolveWithAverages | undefined {
  const db = useDb();
  const sessionId = solve?.session_id;
  const solveNumber = solve?.solve_number;
  return useLiveQuery(async () => {
    if (sessionId === undefined || solveNumber === undefined) return undefined;
    return (await solvesWithAverages(db, sessionId, 1, solveNumber))[0];
  }, [db, sessionId, solveNumber]);
}

/** How many solves were timed since the last backup, and when the first of them was. */
export function useUnbackedSolves(): UnbackedSolves | undefined {
  const db = useDb();
  return useLiveQuery(() => unbackedSolves(db), [db]);
}
