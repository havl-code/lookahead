import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/db.ts';
import type { LookaheadDb } from './database.ts';
import { deleteSolve, latestSolves, restoreSolve, saveTimedSolve, setPenalty } from './solves.ts';
import { getTimerSettings, parseTimerSettings, updateTimerSettings } from './timerSettings.ts';

const morning = new Date(2026, 9, 14, 9);
const evening = new Date(2026, 9, 14, 21);
const tomorrow = new Date(2026, 9, 15, 9);

async function time(
  db: LookaheadDb,
  timeMs: number,
  at = morning,
  eventId = '333',
  penalty = 'OK' as const,
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
