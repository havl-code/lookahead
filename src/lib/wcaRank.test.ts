import { describe, expect, it } from 'vitest';
import { estimateRank, fetchRankings, rankingsBase, readRankings } from './wcaRank.ts';

// The same cases as the desktop app's tests/test_wca.py.

const ranking = (timesCs: readonly number[], total: number | null) =>
  readRankings({ items: timesCs.map((best) => ({ best })), total });

describe('readRankings', () => {
  it('keeps the listed times, fastest first, and the total', () => {
    expect(readRankings({ items: [{ best: 700 }, { best: 500 }], total: 10 })).toEqual({
      times: [500, 700],
      total: 10,
    });
  });

  it('leaves out rows without a time', () => {
    expect(
      readRankings({ items: [{ best: 500 }, { best: 0 }, {}, null, { best: 700 }], total: 1000 })
        .times,
    ).toEqual([500, 700]);
  });

  it.each([[['not', 'a', 'ranking']], [null], ['text'], [{}]])(
    'reads an unexpected answer as no rankings (%#)',
    (data) => {
      expect(readRankings(data)).toEqual({ times: [], total: null });
    },
  );

  it('has no total when the answer gives none', () => {
    expect(readRankings({ items: [{ best: 500 }] })).toEqual({ times: [500], total: null });
  });
});

describe('estimateRank', () => {
  it('gives the rank and percentile within the listed times', () => {
    expect(estimateRank(ranking([500, 600, 700, 800], 1000), 6_500)).toEqual({
      rank: 3,
      percentile: 0.3,
      outsideTop: null,
    });
  });

  it('lets ties share a rank', () => {
    expect(estimateRank(ranking([500, 600, 600, 800], 1000), 6_000)?.rank).toBe(2);
  });

  it('counts a time equal to the last listed one as inside', () => {
    expect(estimateRank(ranking([500, 600, 700, 800], 1000), 8_000)?.rank).toBe(4);
  });

  it('gives no guess for a time slower than every listed one', () => {
    expect(estimateRank(ranking([500, 600, 700, 800], 1000), 9_000)).toEqual({
      rank: null,
      percentile: null,
      outsideTop: 4,
    });
  });

  it('gives last place when the list is everyone ranked', () => {
    expect(estimateRank(ranking([500, 600], 2), 9_000)).toEqual({
      rank: 3,
      percentile: 100,
      outsideTop: null,
    });
  });

  it('has no percentile without a total', () => {
    expect(estimateRank(ranking([500, 700], null), 6_000)).toEqual({
      rank: 2,
      percentile: null,
      outsideTop: null,
    });
  });

  it('compares the single as the WCA records it, truncated to the hundredth', () => {
    // 6.009 is recorded as 6.00 (Regulation 9f1), which ties with 6.00.
    expect(estimateRank(ranking([500, 600, 700], 1000), 6_009)?.rank).toBe(2);
  });

  it('rounds the percentile to 2 places', () => {
    expect(estimateRank(ranking([500, 600, 700], 288_110), 6_500)?.percentile).toBe(0);
    expect(estimateRank(ranking([500, 600, 700], 300), 6_500)?.percentile).toBe(1);
    expect(estimateRank(ranking([500, 600, 700], 7), 6_500)?.percentile).toBe(42.86);
  });

  it('has nothing to say without rankings', () => {
    expect(estimateRank(ranking([], 1000), 6_000)).toBeNull();
  });
});

describe('fetchRankings', () => {
  it('asks for the world single rankings of the event', async () => {
    let asked = '';
    const fetcher = (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify({ items: [{ best: 251 }], total: 288_110 }));
    }) as unknown as typeof fetch;
    await expect(fetchRankings('333', fetcher)).resolves.toEqual({
      times: [251],
      total: 288_110,
    });
    expect(asked).toBe(`${rankingsBase}/rank/world/single/333.json`);
  });

  it.each([
    (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch,
    (async () => new Response('not json')) as unknown as typeof fetch,
    (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch,
  ])('gives null when it fails (%#)', async (fetcher) => {
    await expect(fetchRankings('333', fetcher)).resolves.toBeNull();
  });
});
