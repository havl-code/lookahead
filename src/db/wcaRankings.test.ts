import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/db.ts';
import { rankingsFor, rankingsTtlMs } from './wcaRankings.ts';

// The same cases as the desktop app's TestRankingsCache in tests/test_wca.py.

function fakeRankings() {
  const fake = {
    calls: 0,
    answer: { items: [{ best: 500 }], total: 10 } as unknown,
    offline: false,
    fetcher: (async () => {
      fake.calls += 1;
      if (fake.offline) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(fake.answer));
    }) as unknown as typeof fetch,
  };
  return fake;
}

const now = 1_000_000_000;

describe('rankingsFor', () => {
  it('keeps the rankings, so a second look uses them', async () => {
    const db = createTestDb();
    const fake = fakeRankings();
    const first = await rankingsFor(db, '333', now, fake.fetcher);
    expect(first).toMatchObject({ times: [500], total: 10, fetchedAt: now });
    expect(await rankingsFor(db, '333', now + 1, fake.fetcher)).toEqual(first);
    expect(fake.calls).toBe(1);
  });

  it('fetches them again after 24 hours', async () => {
    const db = createTestDb();
    const fake = fakeRankings();
    await rankingsFor(db, '333', now, fake.fetcher);
    await rankingsFor(db, '333', now + rankingsTtlMs - 1, fake.fetcher);
    expect(fake.calls).toBe(1);
    fake.answer = { items: [{ best: 400 }], total: 11 };
    expect(await rankingsFor(db, '333', now + rankingsTtlMs, fake.fetcher)).toMatchObject({
      times: [400],
      total: 11,
    });
    expect(fake.calls).toBe(2);
  });

  it('uses old rankings when new ones cannot be fetched', async () => {
    const db = createTestDb();
    const fake = fakeRankings();
    await rankingsFor(db, '333', now, fake.fetcher);
    fake.offline = true;
    expect(await rankingsFor(db, '333', now + 3 * rankingsTtlMs, fake.fetcher)).toMatchObject({
      times: [500],
      fetchedAt: now,
    });
  });

  it('has none offline with none kept', async () => {
    const fake = fakeRankings();
    fake.offline = true;
    expect(await rankingsFor(createTestDb(), '333', now, fake.fetcher)).toBeNull();
  });

  it('keeps each event apart', async () => {
    const db = createTestDb();
    const fake = fakeRankings();
    await rankingsFor(db, '333', now, fake.fetcher);
    await rankingsFor(db, '222', now, fake.fetcher);
    expect(fake.calls).toBe(2);
    expect(await db.wcaRankings.count()).toBe(2);
  });
});
