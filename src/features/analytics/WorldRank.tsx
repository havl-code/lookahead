import { useEffect, useState } from 'react';
import { useDb } from '../../db/DbProvider.tsx';
import { type KnownRankings, rankingsFor, rankingsTtlMs } from '../../db/wcaRankings.ts';
import { formatDate, localDate } from '../../lib/time.ts';
import { estimateRank, type RankEstimate } from '../../lib/wcaRank.ts';

/**
 * The event's world single rankings: undefined while they're being fetched, null when there are
 * none (offline, with none kept from before). Tries again when the device comes back online.
 */
function useWorldRankings(eventId: string): KnownRankings | null | undefined {
  const db = useDb();
  const [rankings, setRankings] = useState<KnownRankings | null>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const retry = () => setAttempt((n) => n + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` asks again once online.
  useEffect(() => {
    let current = true;
    void rankingsFor(db, eventId).then((found) => {
      if (current) setRankings(found);
    });
    return () => {
      current = false;
    };
  }, [db, eventId, attempt]);

  return rankings;
}

/** "~1,234" and what it means, as the desktop dashboard words it. */
export function describeRank(estimate: RankEstimate | null): {
  readonly value: string;
  readonly note: string;
} {
  if (estimate?.rank != null) {
    return {
      value: `~${estimate.rank.toLocaleString('en-NZ')}`,
      // Anything under 0.01% (faster than nearly everyone ranked) rounds to 0, so say 0.01%.
      note:
        estimate.percentile === null
          ? 'by best single'
          : `Top ${Math.max(estimate.percentile, 0.01)}% worldwide, by best single`,
    };
  }
  if (estimate?.outsideTop != null) {
    const top = estimate.outsideTop.toLocaleString('en-NZ');
    return { value: `${top}+`, note: `Outside the top ${top}, so no estimate` };
  }
  return { value: '-', note: "Needs the internet once, to fetch the WCA's rankings" };
}

/** Where the best single would rank in the world, from rankings kept on the device. */
export function WorldRank({
  eventId,
  bestMs,
}: {
  readonly eventId: string;
  readonly bestMs: number;
}) {
  const rankings = useWorldRankings(eventId);
  const { value, note } =
    rankings === undefined
      ? { value: '-', note: "Fetching the WCA's rankings" }
      : describeRank(rankings === null ? null : estimateRank(rankings, bestMs));
  // Rankings kept from before, because fetching new ones failed.
  const stale =
    rankings != null && Date.now() - rankings.fetchedAt >= rankingsTtlMs
      ? `, rankings from ${formatDate(localDate(new Date(rankings.fetchedAt)))}`
      : '';

  return (
    <div className="mt-3 border-line border-t pt-3">
      <p className="text-muted text-sm">World rank</p>
      <p className="font-semibold text-3xl tabular-nums">{value}</p>
      <p className="text-muted text-sm">
        {note}
        {stale}
      </p>
    </div>
  );
}
