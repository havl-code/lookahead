import { describe, expect, it } from 'vitest';
import type { Penalty } from '../features/timer/clock.ts';
import { createTestDb } from '../test/db.ts';
import type { LookaheadDb } from './database.ts';
import {
  deleteSolve,
  latestSolves,
  restoreSolve,
  saveTimedSolve,
  setPenalty,
  solvesWithAverages,
  startTimerSession,
} from './solves.ts';
import { getTimerSettings, parseTimerSettings, updateTimerSettings } from './timerSettings.ts';

const morning = new Date(2026, 9, 14, 9);
const evening = new Date(2026, 9, 14, 21);
const tomorrow = new Date(2026, 9, 15, 9);

async function time(
  db: LookaheadDb,
  timeMs: number,
  at = morning,
  eventId = '333',
  penalty: Penalty = 'OK',
) {
  return saveTimedSolve(db, { eventId, timeMs, penalty, scramble: "R U R' U'" }, at);
}

const numbers = async (db: LookaheadDb, sessionId: number) =>
  (await latestSolves(db, sessionId, 100)).map((s) => [s.solve_number, s.time_ms]).reverse();

describe('saving timed solves', () => {
  it('keeps a session a day for each event, numbered from 1', async () => {
    const db = createTestDb();
    const first = await time(db, 12_000);
    const second = await time(db, 11_000, evening);
    const other = await time(db, 3_000, evening, '222');
    const next = await time(db, 10_000, tomorrow);
    expect(second.sessionId).toBe(first.sessionId);
    expect(new Set([first.sessionId, other.sessionId, next.sessionId]).size).toBe(3);
    expect(await numbers(db, first.sessionId)).toEqual([
      [1, 12_000],
      [2, 11_000],
    ]);
    expect(await db.sessions.get(first.sessionId)).toMatchObject({
      date: '2026-10-14',
      event_id: '333',
      notes: 'Live timer session',
      solve_count: 2,
      best_single: 11_000,
    });
  });

  it("keeps the cube from the event's latest session", async () => {
    const db = createTestDb();
    const { sessionId } = await time(db, 12_000);
    await db.sessions.update(sessionId, { cube_id: 4 });
    const next = await time(db, 12_000, tomorrow);
    expect((await db.sessions.get(next.sessionId))?.cube_id).toBe(4);
  });

  it('stores the time without the +2, and counts the +2 in the stats', async () => {
    const db = createTestDb();
    const { solveId, sessionId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 10_000, penalty: '+2', scramble: '' },
      morning,
    );
    expect(await db.solves.get(solveId)).toMatchObject({
      time_ms: 10_000,
      penalty: '+2',
      dnf: false,
    });
    expect((await db.sessions.get(sessionId))?.best_single).toBe(12_000);
  });
});

describe('timing into a chosen session', () => {
  it("saves into the session picked on the timer, or today's if it's gone", async () => {
    const db = createTestDb();
    const { sessionId: earlier } = await time(db, 10_000, morning);
    const { sessionId: today } = await time(db, 11_000, tomorrow);
    const picked = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_000, penalty: 'OK', scramble: '', sessionId: earlier },
      tomorrow,
    );
    expect(picked).toMatchObject({ sessionId: earlier });
    expect((await db.sessions.get(earlier))?.solve_count).toBe(2);

    await db.sessions.delete(earlier);
    await db.solves.where('session_id').equals(earlier).delete();
    const fallback = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 13_000, penalty: 'OK', scramble: '', sessionId: earlier },
      tomorrow,
    );
    expect(fallback.sessionId).toBe(today);
  });
});

describe('starting a new session on the timer', () => {
  it('adds another session for today with the latest cube, and times into it', async () => {
    const db = createTestDb();
    const { sessionId: first } = await time(db, 10_000, morning);
    await db.sessions.update(first, { cube_id: 7 });
    const second = await startTimerSession(db, '333', evening);
    expect(second).not.toBe(first);
    expect(await db.sessions.get(second)).toMatchObject({
      date: '2026-10-14',
      cube_id: 7,
      solve_count: 0,
    });
    expect((await time(db, 11_000, evening)).sessionId).toBe(second);
  });
});

describe('changing solves', () => {
  it('changes a penalty and the stats with it', async () => {
    const db = createTestDb();
    const { solveId, sessionId } = await time(db, 9_000);
    await time(db, 12_000);
    await setPenalty(db, solveId, 'DNF');
    expect(await db.solves.get(solveId)).toMatchObject({ penalty: 'DNF', dnf: true });
    expect((await db.sessions.get(sessionId))?.best_single).toBe(12_000);
  });

  it('closes the gap when deleting, and puts a solve back where it was', async () => {
    const db = createTestDb();
    const ids = [];
    for (const ms of [10_000, 11_000, 12_000]) ids.push((await time(db, ms)).solveId);
    const sessionId = (await db.solves.get(ids[0] as number))?.session_id as number;

    const deleted = await deleteSolve(db, ids[1] as number);
    expect(await numbers(db, sessionId)).toEqual([
      [1, 10_000],
      [2, 12_000],
    ]);
    expect((await db.sessions.get(sessionId))?.solve_count).toBe(2);

    await restoreSolve(db, deleted as NonNullable<typeof deleted>);
    expect(await numbers(db, sessionId)).toEqual([
      [1, 10_000],
      [2, 11_000],
      [3, 12_000],
    ]);
    expect(await db.solves.get(ids[1] as number)).toMatchObject({
      solve_number: 2,
      time_ms: 11_000,
    });
    expect((await db.sessions.get(sessionId))?.solve_count).toBe(3);
  });

  it('puts a solve back at the end if its session has fewer solves now', async () => {
    const db = createTestDb();
    const a = await time(db, 10_000);
    const b = await time(db, 11_000);
    const deleted = await deleteSolve(db, b.solveId);
    await deleteSolve(db, a.solveId);
    await restoreSolve(db, deleted as NonNullable<typeof deleted>);
    expect(await numbers(db, a.sessionId)).toEqual([[1, 11_000]]);
  });
});

/** Times a day's solves in order, a time in ms or a DNF each. Returns their session and ids. */
async function timeAll(db: LookaheadDb, results: readonly (number | 'DNF')[], at = morning) {
  const ids: number[] = [];
  let sessionId = 0;
  for (const result of results) {
    const dnf = result === 'DNF';
    const saved = await time(db, dnf ? 10_000 : result, at, '333', dnf ? 'DNF' : 'OK');
    ids.push(saved.solveId);
    sessionId = saved.sessionId;
  }
  return { sessionId, ids };
}

/** Solves 1 to `count`, each a tenth of a second slower than the one before, from 10.10. */
const steadily = (count: number) => Array.from({ length: count }, (_, i) => 10_000 + (i + 1) * 100);

/** Each solve's number with the Ao5 and Ao12 at it, oldest first. */
const averages = async (db: LookaheadDb, sessionId: number, limit: number, endAt?: number) =>
  (await solvesWithAverages(db, sessionId, limit, endAt))
    .map((s) => [s.solve_number, s.ao5, s.ao12])
    .reverse();

describe('the Ao5 and Ao12 at each solve', () => {
  it('has none until the window fills', async () => {
    const db = createTestDb();
    const { sessionId } = await timeAll(db, [10_000, 11_000, 12_000, 13_000, 14_000]);
    expect(await averages(db, sessionId, 12)).toEqual([
      [1, null, null],
      [2, null, null],
      [3, null, null],
      [4, null, null],
      [5, 12_000, null],
    ]);
  });

  it('drops one DNF as the worst result, and makes two a DNF (9f8, 9f9)', async () => {
    const db = createTestDb();
    const { sessionId } = await timeAll(db, [10_000, 11_000, 'DNF', 12_000, 13_000, 'DNF']);
    // The Ao5 at solve 5 drops the 10 and the DNF; at solve 6 there are two DNFs.
    expect(await averages(db, sessionId, 2)).toEqual([
      [5, 12_000, null],
      [6, null, null],
    ]);
  });

  it('gives the oldest of the latest 12 its Ao12, from the 11 solves before it', async () => {
    const db = createTestDb();
    const { sessionId } = await timeAll(db, steadily(30));
    const latest = await averages(db, sessionId, 12);
    expect(latest).toHaveLength(12);
    // The Ao5 at solve 19 is the mean of solves 16 to 18, and its Ao12 the mean of 9 to 18.
    expect(latest[0]).toEqual([19, 11_700, 11_350]);
    expect(latest[11]).toEqual([30, 12_800, 12_450]);
  });

  it('ends at a given solve, as its sheet shows it', async () => {
    const db = createTestDb();
    const { sessionId } = await timeAll(db, steadily(30));
    expect(await averages(db, sessionId, 1, 19)).toEqual([[19, 11_700, 11_350]]);
    expect(await averages(db, sessionId, 1, 3)).toEqual([[3, null, null]]);
  });

  it("never counts another session's solves", async () => {
    const db = createTestDb();
    await timeAll(db, steadily(12));
    const { sessionId } = await timeAll(db, [10_000, 11_000, 12_000, 13_000], tomorrow);
    expect(await averages(db, sessionId, 12)).toEqual([
      [1, null, null],
      [2, null, null],
      [3, null, null],
      [4, null, null],
    ]);
  });

  it("matches the session's own Ao5 and Ao12 at its latest solve", async () => {
    const db = createTestDb();
    const { sessionId, ids } = await timeAll(db, [...steadily(10), 'DNF', 9_000, 15_000, 12_340]);
    await setPenalty(db, ids[12] as number, '+2');
    const [latest] = await solvesWithAverages(db, sessionId, 12);
    const session = await db.sessions.get(sessionId);
    expect(session?.ao5).toEqual(expect.any(Number));
    expect(session?.ao12).toEqual(expect.any(Number));
    expect([latest?.ao5, latest?.ao12]).toEqual([session?.ao5, session?.ao12]);
  });

  it('changes the averages after a solve when its penalty changes, or it goes', async () => {
    const db = createTestDb();
    const { sessionId, ids } = await timeAll(db, [10_000, 13_000, 16_000, 19_000, 22_000, 25_000]);
    expect(await averages(db, sessionId, 2)).toEqual([
      [5, 16_000, null],
      [6, 19_000, null],
    ]);

    // A DNF for solve 3 is dropped as the worst, so the 16 no longer counts and the 22 or 25 does.
    await setPenalty(db, ids[2] as number, 'DNF');
    expect(await averages(db, sessionId, 2)).toEqual([
      [5, 18_000, null],
      [6, 22_000, null],
    ]);

    const deleted = await deleteSolve(db, ids[0] as number);
    expect(await averages(db, sessionId, 2)).toEqual([
      [4, null, null],
      [5, 22_000, null],
    ]);

    await restoreSolve(db, deleted as NonNullable<typeof deleted>);
    expect(await averages(db, sessionId, 2)).toEqual([
      [5, 18_000, null],
      [6, 22_000, null],
    ]);
  });
});

describe('timer settings', () => {
  it('starts from the defaults, and keeps changes', async () => {
    const db = createTestDb();
    expect(await getTimerSettings(db)).toEqual({
      inspectionEnabled: true,
      inspectionCalls: 'off',
      hideTimer: false,
      hideStats: false,
    });
    await updateTimerSettings(db, { inspectionCalls: 'voice' });
    await updateTimerSettings(db, { hideStats: true });
    expect(await getTimerSettings(db)).toMatchObject({ inspectionCalls: 'voice', hideStats: true });
    // Stored the desktop app's way, so they travel with backups.
    expect(JSON.parse((await db.settings.get('timer'))?.value ?? '')).toMatchObject({
      inspectionCalls: 'voice',
    });
  });

  it('ignores stored values of the wrong kind', () => {
    expect(
      parseTimerSettings('{"hideTimer": "yes", "inspectionCalls": "loud", "hideStats": true}'),
    ).toMatchObject({
      hideTimer: false,
      inspectionCalls: 'off',
      hideStats: true,
    });
    expect(parseTimerSettings('not JSON').inspectionEnabled).toBe(true);
  });
});
