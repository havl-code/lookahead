import { round2, wcaSingleMs } from './stats.ts';

/*
 * Where a best single would rank in the world, the same as the desktop app's
 * speedcube/wca.py. The WCA has no rankings API, so the rankings come from the community-run
 * "Unofficial WCA Public API" (https://wca-rest-api.robiningelbrecht.be/), which republishes the
 * official results export as static JSON on GitHub each day. raw.githubusercontent.com allows any
 * website to ask (Access-Control-Allow-Origin: *), so this works straight from the phone.
 */

// It moved from the `master` branch and `/api` path to the `v1` branch in 2025. If rankings ever
// stop loading, check https://wca-rest-api.robiningelbrecht.be/ for the current base path.
export const rankingsBase =
  'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/refs/heads/v1';
const timeoutMs = 10_000;

/**
 * Events with timed single rankings. Multi-Blind is ranked by points and Fewest Moves by moves,
 * so neither is here. The same as the desktop app's WCA_RANKED_EVENTS.
 */
export const rankedEvents: ReadonlySet<string> = new Set([
  '222',
  '333',
  '444',
  '555',
  '666',
  '777',
  '333oh',
  '333bf',
  '444bf',
  '555bf',
  'pyram',
  'skewb',
  'minx',
  'sq1',
  'clock',
]);

/** One event's world single rankings: the fastest listed (up to 1,000), and everyone ranked. */
export interface Rankings {
  /** The listed bests in centiseconds, fastest first. */
  readonly times: readonly number[];
  /** How many people are ranked in all, or null when the answer didn't say. */
  readonly total: number | null;
}

export interface RankEstimate {
  /** The world rank, or null outside the listed times. */
  readonly rank: number | null;
  /** The rank as a share of everyone ranked, rounded to 2 places, or null. */
  readonly percentile: number | null;
  /** Outside the listed times: how many are listed. Otherwise null. */
  readonly outsideTop: number | null;
}

export function rankingsPath(eventId: string): string {
  return `rank/world/single/${eventId}.json`;
}

/** The rankings in an answer from the API, as get_rankings reads them. */
export function readRankings(data: unknown): Rankings {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return { times: [], total: null };
  const { items, total } = data as { items?: unknown; total?: unknown };
  // The ranked time is in centiseconds in `best`, for singles and averages alike.
  const times = (Array.isArray(items) ? items : [])
    .map((item) => (item as { best?: unknown } | null)?.best)
    .filter((best): best is number => typeof best === 'number' && best > 0)
    .sort((a, b) => a - b);
  return { times, total: typeof total === 'number' && total > 0 ? total : null };
}

/** The rankings for an event, or null when they couldn't be fetched or read. */
export async function fetchRankings(
  eventId: string,
  fetcher: typeof fetch = fetch,
): Promise<Rankings | null> {
  try {
    const response = await fetcher(`${rankingsBase}/${rankingsPath(eventId)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return readRankings(await response.json());
  } catch {
    return null;
  }
}

/** The first index whose time is at least `target`, as Python's bisect_left. */
function firstAtLeast(times: readonly number[], target: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((times[middle] as number) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Where a best single (in ms, with any +2) would rank, as estimate_rank works it out. Within the
 * listed times the rank is exact: one more than the number of people strictly faster, so ties
 * share a rank, as in WCA rankings. Beyond the last listed time there's nothing sound to estimate
 * from, so the answer is only that it's outside them. Null without any rankings.
 */
export function estimateRank(rankings: Rankings, bestMs: number): RankEstimate | null {
  const { times, total } = rankings;
  if (times.length === 0) return null;
  // As the WCA records it (Regulations 9f1 and 9f2), in centiseconds like the rankings.
  const best = wcaSingleMs(bestMs) / 10;
  const faster = firstAtLeast(times, best);
  // Within the listed times, or the list is everyone ranked (so slower than all of them is a
  // real rank).
  if (faster < times.length || (total !== null && total <= times.length)) {
    const rank = faster + 1;
    const percentile = total === null ? null : round2(Math.min(100, (rank / total) * 100));
    return { rank, percentile, outsideTop: null };
  }
  return { rank: null, percentile: null, outsideTop: times.length };
}
