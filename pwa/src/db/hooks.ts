import { useLiveQuery } from 'dexie-react-hooks';
import { useDb } from './DbProvider.tsx';
import type { SafetyCopy } from './database.ts';
import { getMeta, type Meta } from './meta.ts';
import type { Cube, Session, Solve } from './schema.ts';
import { findTodaysSession, latestSolves } from './solves.ts';
import { latestSafetyCopy, type StoredCounts, storedCounts } from './stored.ts';
import { getTimerSettings, type TimerSettings } from './timerSettings.ts';

/** The newest `limit` sessions, latest date first. Undefined while loading. */
export function useSessions(limit: number): Session[] | undefined {
  const db = useDb();
  return useLiveQuery(
    () => db.sessions.orderBy('date').reverse().limit(limit).toArray(),
    [db, limit],
  );
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
 * The event's session for today with its latest `limit` solves, newest first, or null when
 * today's first solve hasn't been timed yet. Undefined while loading.
 */
export function useTodaysSolves(
  eventId: string,
  today: string,
  limit: number,
): { readonly session: Session; readonly solves: Solve[] } | null | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const session = await findTodaysSession(db, eventId, today);
    return session ? { session, solves: await latestSolves(db, session.id, limit) } : null;
  }, [db, eventId, today, limit]);
}

/** How many solves were timed since the last backup, and when the first of them was. */
export function useUnbackedSolves():
  | { readonly lastBackupAt: number | null; readonly count: number; readonly since: string | null }
  | undefined {
  const db = useDb();
  return useLiveQuery(async () => {
    const lastBackupAt = await getMeta(db, 'lastBackupAt');
    const after = db.solves.where('timestamp').above(new Date(lastBackupAt ?? 0).toISOString());
    const [count, first] = await Promise.all([after.count(), after.first()]);
    return { lastBackupAt, count, since: first?.timestamp ?? null };
  }, [db]);
}
