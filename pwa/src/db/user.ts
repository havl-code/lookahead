import type { LookaheadDb } from './database.ts';
import { withStorageErrors } from './errors.ts';

/**
 * The person's WCA ID and name, in the settings row 'user' as the desktop app keeps them, so they
 * travel with backups both ways.
 */
export interface WcaPerson {
  readonly wcaId: string;
  readonly name: string;
}

export async function getWcaPerson(db: LookaheadDb): Promise<WcaPerson | null> {
  const row = await db.settings.get('user');
  return row?.wca_id ? { wcaId: row.wca_id, name: row.wca_name ?? '' } : null;
}

export async function setWcaPerson(db: LookaheadDb, person: WcaPerson): Promise<void> {
  await withStorageErrors(() =>
    db.settings.put({ id: 'user', wca_id: person.wcaId, wca_name: person.name, value: null }),
  );
}

export async function clearWcaPerson(db: LookaheadDb): Promise<void> {
  await db.settings.delete('user');
}
