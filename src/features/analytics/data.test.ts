import { describe, expect, it } from 'vitest';
import type { LookaheadDb } from '../../db/database.ts';
import { addSession } from '../../db/sessions.ts';
import { addSolve } from '../../db/solves.ts';
import golden from '../../lib/golden/scores.json' with { type: 'json' };
import type { WcaReference } from '../../lib/scores.ts';
import { createTestDb } from '../../test/db.ts';
import { timeOfDay } from './AnalyticsScreen.tsx';
import {
  chartData,
  distribution,
  eventOverview,
  pbDetails,
  rolling,
  scoredSessions,
} from './data.ts';
import { insights, metricCards, scoreBand, trendOf } from './insights.ts';

const reference = golden.reference as WcaReference;

async function session(
  db: LookaheadDb,
  date: string,
  times: readonly (number | 'DNF')[],
  eventId = '333',
) {
  const id = await addSession(db, { eventId, date, cubeId: null, notes: '' });
  for (const time of times)
    await addSolve(db, id, {
      timeMs: time === 'DNF' ? 0 : time,
      penalty: time === 'DNF' ? 'DNF' : 'OK',
      scramble: '',
      notes: '',
    });
  return id;
}

describe('eventOverview', () => {
  it("gives the event's bests and totals, as the desktop dashboard does", async () => {
    const db = createTestDb();
    const first = await session(db, '2026-10-01', [12_345, 11_000, 'DNF', 13_000, 12_000]);
    const second = await session(
      db,
      '2026-10-02',
      [10_999, 14_000, 12_500, 11_500, 12_250, 13_000],
    );
    await session(db, '2026-10-02', [3_000, 2_000], '222');
    const overview = await eventOverview(db, '333');
    expect(overview).toMatchObject({
      sessions: 2,
      solves: 11,
      best: { ms: 10_999, sessionId: second, date: '2026-10-02' },
      bestAverages: {
        5: { value: 12_083.333333333334, sessionId: second },
        12: null,
      },
    });
    expect(first).not.toBe(second);
    // The mean of every completed solve, as the WCA records singles (12.34, not 12.345)
    const singles = [
      12_340, 11_000, 13_000, 12_000, 10_990, 14_000, 12_500, 11_500, 12_250, 13_000,
    ];
    expect(overview.average).toBeCloseTo(singles.reduce((a, b) => a + b) / singles.length, 9);
  });

  it('keeps the earlier session when two have the same best', async () => {
    const db = createTestDb();
    const earlier = await session(db, '2026-10-01', [10_000]);
    await session(db, '2026-10-05', [10_000]);
    expect((await eventOverview(db, '333')).best?.sessionId).toBe(earlier);
  });

  it('is empty for an event with nothing', async () => {
    expect(await eventOverview(createTestDb(), '444')).toMatchObject({
      sessions: 0,
      solves: 0,
      best: null,
      average: null,
    });
  });
});

describe('pbDetails', () => {
  it("gives the best single's scramble, counting a +2, and the earlier solve on a tie", async () => {
    const db = createTestDb();
    const id = await addSession(db, {
      eventId: '333',
      date: '2026-10-01',
      cubeId: null,
      notes: '',
    });
    const solves = [
      [12_000, 'OK', 'R U'],
      [9_000, '+2', 'L D'],
      [10_000, 'OK', 'F2'],
      [10_000, 'OK', 'B'],
    ] as const;
    for (const [timeMs, penalty, scramble] of solves)
      await addSolve(db, id, { timeMs, penalty, scramble, notes: '' });
    expect(await pbDetails(db, id, 'single')).toEqual({ kind: 'single', scramble: 'F2' });
  });

  it("lists a best average's solves, marking the dropped ones, as the desktop does", async () => {
    const db = createTestDb();
    const id = await session(db, '2026-10-01', [
      12_000,
      15_000,
      'DNF',
      11_000,
      13_000,
      12_000,
      14_000,
    ]);
    expect(await pbDetails(db, id, 5)).toEqual({
      kind: 5,
      solves: [
        { solveNumber: 3, ms: null, counted: false },
        { solveNumber: 4, ms: 11_000, counted: false },
        { solveNumber: 5, ms: 13_000, counted: true },
        { solveNumber: 6, ms: 12_000, counted: true },
        { solveNumber: 7, ms: 14_000, counted: true },
      ],
    });
  });
});

describe('scores and insights', () => {
  it('scores the latest sessions first, and averages the 10 latest against the 10 before', async () => {
    const db = createTestDb();
    for (let day = 1; day <= 22; day++) {
      const typical = 24_000 - day * 800;
      await session(
        db,
        `2026-10-${String(day).padStart(2, '0')}`,
        Array.from({ length: 25 }, (_, i) => Math.round(typical * (1 + ((i * 37) % 7) * 0.01))),
      );
    }
    const scored = await scoredSessions(db, '333', reference);
    expect(scored).toHaveLength(22);
    expect(scored[0]?.session.date).toBe('2026-10-22');
    const cards = metricCards(scored);
    expect(cards.speed.score).not.toBeNull();
    expect(cards.speed.change).toBeGreaterThan(2);
    expect(insights(scored).map((insight) => insight.text)).toContain('Strong improvement trend');
  });

  it('asks for more sessions, with the right plural', () => {
    expect(insights([]).map((insight) => insight.detail)).toContain(
      '10 more sessions will make these trends more reliable.',
    );
  });

  it('bands scores and trends as the desktop does', () => {
    expect([90, 70, 45, 10].map(scoreBand)).toEqual(['excellent', 'good', 'average', 'poor']);
    expect([2.5, -2.5, 1].map(trendOf)).toEqual(['better', 'lower', 'steady']);
    expect([6, 13, 18, 23, 2].map(timeOfDay)).toEqual([
      'Good morning',
      'Good afternoon',
      'Good evening',
      'Good night',
      'Good night',
    ]);
  });
});

describe('chart data', () => {
  it('needs 12 results for the rolling averages, and 5 for the spread', () => {
    expect(rolling(new Array(11).fill(10_000))).toBeNull();
    expect(rolling(new Array(12).fill(10_000))?.ao12.at(-1)).toBe(10_000);
    expect(distribution([10_000, 11_000, null, 12_000, 13_000], true)).toEqual([]);
    expect(distribution([10_000, 11_000, 12_000, 13_000, 14_000], true)).toEqual([
      10, 11, 12, 13, 14,
    ]);
  });

  it('charts a whole event, or one session with its running mean', async () => {
    const db = createTestDb();
    await session(db, '2026-10-01', [12_000, 13_000, 11_000, 12_500, 12_000]);
    const second = await session(db, '2026-10-02', [10_000, 'DNF', 11_000, 12_000, 11_500, 10_500]);
    const whole = await chartData(db, '333', null);
    expect(whole.progress).toHaveLength(2);
    expect(whole.distribution).toHaveLength(10);
    expect(whole.consistency?.map((box) => box.date)).toEqual(['2026-10-01', '2026-10-02']);
    const one = await chartData(db, '333', second);
    expect(one.consistency).toBeNull();
    expect(one.progress.map((point) => ('mean' in point ? point.mean : null))).toEqual([
      10_000, 10_000, 10_500, 11_000, 11_125, 11_000,
    ]);
  });
});
