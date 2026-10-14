import type { LookaheadDb, SafetyCopy } from './database.ts';

export interface StoredCounts {
  readonly cubes: number;
  readonly sessions: number;
  readonly solves: number;
}

export async function storedCounts(db: LookaheadDb): Promise<StoredCounts> {
  const [cubes, sessions, solves] = await Promise.all([
    db.cubes.count(),
    db.sessions.count(),
    db.solves.count(),
  ]);
  return { cubes, sessions, solves };
}

/** The newest safety copy, if any: what was here before the last restore. */
export async function latestSafetyCopy(db: LookaheadDb): Promise<SafetyCopy | undefined> {
  return db.safetyCopies.orderBy('made_at').last();
}
