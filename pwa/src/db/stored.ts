import type { LookaheadDb, SafetyCopy } from './database.ts';
import { getMeta } from './meta.ts';

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

export interface UnbackedSolves {
  readonly lastBackupAt: number | null;
  readonly count: number;
  /** When the first of them was timed. */
  readonly since: string | null;
}

/**
 * The solves no backup has yet: those since the last backup made here, or the last restore,
 * whichever was later, since what a restore brought is in that backup already.
 */
export async function unbackedSolves(db: LookaheadDb): Promise<UnbackedSolves> {
  const [lastBackupAt, restoredAt] = await Promise.all([
    getMeta(db, 'lastBackupAt'),
    getMeta(db, 'restoredAt'),
  ]);
  const from = Math.max(lastBackupAt ?? 0, restoredAt ?? 0);
  const after = db.solves.where('timestamp').above(new Date(from).toISOString());
  const [count, first] = await Promise.all([after.count(), after.first()]);
  return { lastBackupAt, count, since: first?.timestamp ?? null };
}
