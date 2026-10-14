import { useLiveQuery } from 'dexie-react-hooks';
import { useDb } from './DbProvider.tsx';
import type { SafetyCopy } from './database.ts';
import { getMeta, type Meta } from './meta.ts';
import type { Cube, Session } from './schema.ts';
import { latestSafetyCopy, type StoredCounts, storedCounts } from './stored.ts';

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
