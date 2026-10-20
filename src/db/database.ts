import Dexie, { type EntityTable } from 'dexie';
import type { Rankings } from '../lib/wcaRank.ts';
import type { Cube, Session, SettingRow, Solve } from './schema.ts';

/** Values that belong to this device and never go in a backup, such as when it last made one. */
export interface MetaRow {
  readonly key: string;
  readonly value: unknown;
}

/** Everything that was here just before a restore replaced it, so the restore can be undone. */
export interface SafetyCopy {
  id?: number;
  made_at: string;
  /** A backup of what was here, in the backup file format. */
  backup: unknown;
}

/** WCA rankings fetched on this device, kept for offline use. Never in a backup. */
export interface CachedRankings extends Rankings {
  /** The rankings' path in the API, such as rank/world/single/333.json. */
  readonly path: string;
  /** When they were fetched, in ms since 1970. */
  readonly fetchedAt: number;
}

export class LookaheadDb extends Dexie {
  // `declare` keeps these as types only, so class fields do not overwrite the tables Dexie creates.
  declare cubes: EntityTable<Cube, 'id'>;
  declare sessions: EntityTable<Session, 'id'>;
  declare solves: EntityTable<Solve, 'id'>;
  declare settings: EntityTable<SettingRow, 'id'>;
  declare meta: EntityTable<MetaRow, 'key'>;
  declare safetyCopies: EntityTable<SafetyCopy, 'id'>;
  declare wcaRankings: EntityTable<CachedRankings, 'path'>;

  constructor(name = 'lookahead') {
    super(name);

    // Never edit a published version. Add a new version with an upgrade function instead.
    this.version(1).stores({
      cubes: '++id',
      sessions: '++id, date, [event_id+date], cube_id',
      solves: '++id, [session_id+solve_number], timestamp',
      settings: 'id',
      meta: 'key',
      safetyCopies: '++id, made_at',
    });
    this.version(2).stores({ wcaRankings: 'path' });
  }
}
