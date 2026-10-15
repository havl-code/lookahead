import { fetchRankings, type Rankings, rankingsPath } from '../lib/wcaRank.ts';
import type { CachedRankings, LookaheadDb } from './database.ts';

/** Rankings are fetched again once they're a day old, as on the desktop. */
export const rankingsTtlMs = 24 * 60 * 60 * 1000;

export interface KnownRankings extends Rankings {
  readonly fetchedAt: number;
}

/**
 * An event's world single rankings, as the desktop app's _get_cached_json gets them: from the
 * cache while it's under a day old, else fetched and cached. When fetching fails, rankings cached
 * earlier beat nothing. Null when there are none either way.
 */
export async function rankingsFor(
  db: LookaheadDb,
  eventId: string,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<KnownRankings | null> {
  const path = rankingsPath(eventId);
  const cached = await db.wcaRankings.get(path);
  if (cached && now - cached.fetchedAt < rankingsTtlMs) return cached;

  const fetched = await fetchRankings(eventId, fetcher);
  if (fetched === null) return cached ?? null;
  const row: CachedRankings = { path, ...fetched, fetchedAt: now };
  try {
    await db.wcaRankings.put(row);
  } catch {
    // A full device still gets the rank, just not offline.
  }
  return row;
}
