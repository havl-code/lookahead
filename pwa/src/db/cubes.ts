import type { LookaheadDb } from './database.ts';
import { withStorageErrors } from './errors.ts';
import type { Cube } from './schema.ts';

/*
 * Cubes, the same as the desktop app's: a cube is never deleted, only retired, since the sessions
 * done with it still name it.
 */

export interface CubeFields {
  /** An event ID, such as 333, or the person's own words for a cube that isn't one. */
  readonly cube_type: string;
  readonly brand: string;
  readonly model: string;
  readonly purchase_date: string | null;
  readonly notes: string;
}

export async function addCube(
  db: LookaheadDb,
  fields: CubeFields,
  now = new Date(),
): Promise<number> {
  return withStorageErrors(() =>
    db.cubes.add({ ...fields, is_active: true, created_at: now.toISOString() } as Cube),
  );
}

export async function updateCube(
  db: LookaheadDb,
  cubeId: number,
  fields: Partial<CubeFields & Pick<Cube, 'is_active'>>,
): Promise<void> {
  await withStorageErrors(() => db.cubes.update(cubeId, fields));
}

/** A cube's name as lists show it: its brand and model, or its type when it has neither. */
export function cubeName(cube: Pick<Cube, 'brand' | 'model'>): string {
  return [cube.brand, cube.model].filter(Boolean).join(' ');
}

export interface CubeUsage {
  readonly sessions: number;
  readonly solves: number;
  /** The event it has the most sessions in, where its PB and best Ao5 come from. */
  readonly mainEvent: string | null;
  readonly bestSingle: number | null;
  readonly bestAo5: number | null;
}

const min = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.min(a, b);

/**
 * How each cube has been used: its sessions and solves, and its PB single and best Ao5 in its
 * main event (the one with the most sessions), so a 3x3x3 also used for One-Handed doesn't mix
 * the two. The same as the desktop app's _cube_usage. It reads only the sessions' stored stats.
 */
export async function cubeUsage(db: LookaheadDb): Promise<Map<number, CubeUsage>> {
  type Tally = {
    sessions: number;
    solves: number;
    bestSingle: number | null;
    bestAo5: number | null;
  };
  const byCube = new Map<number, Map<string, Tally>>();
  await db.sessions.each((session) => {
    if (session.cube_id === null) return;
    const events = byCube.get(session.cube_id) ?? new Map<string, Tally>();
    byCube.set(session.cube_id, events);
    const eventId = session.event_id ?? '';
    const tally = events.get(eventId) ?? {
      sessions: 0,
      solves: 0,
      bestSingle: null,
      bestAo5: null,
    };
    events.set(eventId, tally);
    tally.sessions += 1;
    tally.solves += session.solve_count;
    tally.bestSingle = min(tally.bestSingle, session.best_single);
    tally.bestAo5 = min(tally.bestAo5, session.best_ao5);
  });

  const usage = new Map<number, CubeUsage>();
  for (const [cubeId, events] of byCube) {
    // Most sessions, then most solves, then the event ID, as the desktop app picks it.
    const [mainEvent, main] = [...events].reduce((best, entry) => {
      const [id, t] = entry;
      const [bestId, b] = best;
      if (t.sessions !== b.sessions) return t.sessions > b.sessions ? entry : best;
      if (t.solves !== b.solves) return t.solves > b.solves ? entry : best;
      return id > bestId ? entry : best;
    });
    let sessions = 0;
    let solves = 0;
    for (const t of events.values()) {
      sessions += t.sessions;
      solves += t.solves;
    }
    usage.set(cubeId, {
      sessions,
      solves,
      mainEvent: mainEvent || null,
      bestSingle: main.bestSingle,
      bestAo5: main.bestAo5,
    });
  }
  return usage;
}
