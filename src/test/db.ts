import { LookaheadDb } from '../db/database.ts';

/** A fresh, empty database of its own, so tests never share data. */
export function createTestDb(): LookaheadDb {
  return new LookaheadDb(`test-${crypto.randomUUID()}`);
}
