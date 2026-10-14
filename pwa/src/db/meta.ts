import type { LookaheadDb } from './database.ts';

export type PersistResult = 'granted' | 'denied' | 'unsupported';

/** This device's own values, kept out of backups. */
export interface Meta {
  /** When a backup was last saved or shared from here, in ms since 1970. */
  lastBackupAt: number | null;
  /** When a backup was last restored here: what it brought is in that backup already. */
  restoredAt: number | null;
  /**
   * Solves imported since the last backup or restore. They keep their own, older, timestamps, so
   * counting by timestamp alone would miss them.
   */
  importedSinceBackup: number;
  /** What the browser said when asked to keep Lookahead's data. */
  persistResult: PersistResult | null;
  /** The event the timer was last on. */
  timerEvent: string;
}

const defaults: Meta = {
  lastBackupAt: null,
  restoredAt: null,
  importedSinceBackup: 0,
  persistResult: null,
  timerEvent: '333',
};

export async function getMeta<K extends keyof Meta>(db: LookaheadDb, key: K): Promise<Meta[K]> {
  const row = await db.meta.get(key);
  return row === undefined ? defaults[key] : (row.value as Meta[K]);
}

export async function setMeta<K extends keyof Meta>(
  db: LookaheadDb,
  key: K,
  value: Meta[K],
): Promise<void> {
  await db.meta.put({ key, value });
}
