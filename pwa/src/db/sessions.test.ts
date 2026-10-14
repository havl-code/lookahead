import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/db.ts';
import { addCube, cubeUsage, updateCube } from './cubes.ts';
import { addSession, deleteSession, updateSession } from './sessions.ts';
import {
  addSolve,
  latestSolves,
  onlyDnf,
  saveTimedSolve,
  sessionSolves,
  setPenalty,
  setSolveNotes,
} from './solves.ts';
import { clearWcaPerson, getWcaPerson, setWcaPerson } from './user.ts';

const at = new Date(2026, 9, 14, 9);
const cube = { cube_type: '333', brand: 'GAN', model: '14', purchase_date: null, notes: '' };

describe('sessions added by hand', () => {
  it('starts empty, on the day given, with no stats', async () => {
    const db = createTestDb();
    const id = await addSession(
      db,
      { eventId: '444', date: '2026-10-01', cubeId: null, notes: 'Club' },
      at,
    );
    expect(await db.sessions.get(id)).toMatchObject({
      date: '2026-10-01',
      event_id: '444',
      notes: 'Club',
      solve_count: 0,
      best_single: null,
      created_at: at.toISOString(),
    });
  });

  it('changes only what is given, and keeps the stats', async () => {
    const db = createTestDb();
    const id = await addSession(db, {
      eventId: '333',
      date: '2026-10-01',
      cubeId: null,
      notes: '',
    });
    await addSolve(db, id, { timeMs: 12_000, penalty: 'OK', scramble: '', notes: '' });
    await updateSession(db, id, { notes: 'Morning', cube_id: 3 });
    expect(await db.sessions.get(id)).toMatchObject({
      date: '2026-10-01',
      notes: 'Morning',
      cube_id: 3,
      best_single: 12_000,
    });
  });

  it('deletes a session with its solves, and nothing else', async () => {
    const db = createTestDb();
    const keep = await addSession(db, {
      eventId: '333',
      date: '2026-10-01',
      cubeId: null,
      notes: '',
    });
    const gone = await addSession(db, {
      eventId: '333',
      date: '2026-10-02',
      cubeId: null,
      notes: '',
    });
    for (const id of [keep, gone, gone])
      await addSolve(db, id, { timeMs: 10_000, penalty: 'OK', scramble: '', notes: '' });
    await deleteSession(db, gone);
    expect(await db.sessions.get(gone)).toBeUndefined();
    expect((await db.solves.toArray()).map((solve) => solve.session_id)).toEqual([keep]);
  });
});

describe('solves added by hand', () => {
  it('go on the end, numbered, with their penalty, scramble, and note', async () => {
    const db = createTestDb();
    const id = await addSession(db, {
      eventId: '333',
      date: '2026-10-01',
      cubeId: null,
      notes: '',
    });
    await addSolve(db, id, { timeMs: 11_000, penalty: '+2', scramble: 'R U', notes: 'Lucky' }, at);
    await addSolve(db, id, { timeMs: 0, penalty: 'DNF', scramble: '', notes: '' }, at);
    const solves = (await latestSolves(db, id, 10)).reverse();
    expect(solves.map((s) => [s.solve_number, s.time_ms, s.penalty, s.dnf])).toEqual([
      [1, 11_000, '+2', false],
      [2, 0, 'DNF', true],
    ]);
    expect(solves[0]).toMatchObject({
      scramble: 'R U',
      notes: 'Lucky',
      timestamp: at.toISOString(),
    });
    expect(await db.sessions.get(id)).toMatchObject({ solve_count: 2, best_single: 13_000 });
  });

  it('keep a solve with no time a DNF, as the desktop app does (Regulation A4d2)', async () => {
    const db = createTestDb();
    const id = await addSession(db, {
      eventId: '333',
      date: '2026-10-01',
      cubeId: null,
      notes: '',
    });
    const solveId = await addSolve(db, id, { timeMs: 0, penalty: 'DNF', scramble: '', notes: '' });
    const solve = await db.solves.get(solveId);
    expect(solve && onlyDnf(solve)).toBe(true);
    await setPenalty(db, solveId, 'OK');
    expect(await db.solves.get(solveId)).toMatchObject({ penalty: 'DNF', dnf: true });
  });

  it('take notes without changing the stats', async () => {
    const db = createTestDb();
    const { solveId, sessionId } = await saveTimedSolve(db, {
      eventId: '333',
      timeMs: 9_000,
      penalty: 'OK',
      scramble: '',
    });
    await setSolveNotes(db, solveId, 'PLL skip');
    expect(await db.solves.get(solveId)).toMatchObject({ notes: 'PLL skip' });
    expect(await db.sessions.get(sessionId)).toMatchObject({ best_single: 9_000 });
  });
});

describe('sessionSolves', () => {
  it('sorts as the desktop solves table does, with DNFs slowest', async () => {
    const db = createTestDb();
    const id = await addSession(db, {
      eventId: '333',
      date: '2026-10-01',
      cubeId: null,
      notes: '',
    });
    const typed = [
      [12_000, 'OK'],
      [11_000, 'DNF'],
      [10_500, '+2'],
      [11_000, 'OK'],
      [9_000, 'DNF'],
    ] as const;
    for (const [timeMs, penalty] of typed)
      await addSolve(db, id, { timeMs, penalty, scramble: '', notes: '' });
    const numbers = async (sort: 'number' | 'fastest' | 'slowest', limit = 10) =>
      (await sessionSolves(db, id, sort, limit)).map((solve) => solve.solve_number);
    expect(await numbers('number')).toEqual([5, 4, 3, 2, 1]);
    expect(await numbers('fastest')).toEqual([4, 1, 3, 2, 5]);
    expect(await numbers('slowest')).toEqual([2, 5, 3, 1, 4]);
    expect(await numbers('fastest', 2)).toEqual([4, 1]);
  });
});

describe('cubes', () => {
  it("tally each cube's use, with bests from its main event", async () => {
    const db = createTestDb();
    const cubeId = await addCube(db, cube, at);
    const other = await addCube(db, { ...cube, brand: 'MoYu' });
    for (const [eventId, date, times] of [
      ['333', '2026-10-01', [12_000, 11_000, 13_000, 12_500, 11_500]],
      ['333', '2026-10-02', [10_000]],
      ['333oh', '2026-10-03', [8_000]],
    ] as const) {
      const id = await addSession(db, { eventId, date, cubeId, notes: '' });
      for (const timeMs of times)
        await addSolve(db, id, { timeMs, penalty: 'OK', scramble: '', notes: '' });
    }
    const usage = await cubeUsage(db);
    expect(usage.get(cubeId)).toEqual({
      sessions: 3,
      solves: 7,
      mainEvent: '333',
      bestSingle: 10_000,
      bestAo5: 12_000,
    });
    expect(usage.has(other)).toBe(false);
  });

  it('are retired, not deleted', async () => {
    const db = createTestDb();
    const cubeId = await addCube(db, cube, at);
    expect(await db.cubes.get(cubeId)).toMatchObject({
      is_active: true,
      created_at: at.toISOString(),
    });
    await updateCube(db, cubeId, { is_active: false });
    expect(await db.cubes.get(cubeId)).toMatchObject({ is_active: false, brand: 'GAN' });
  });
});

describe('the WCA ID', () => {
  it("lives in the 'user' settings row, as the desktop app keeps it", async () => {
    const db = createTestDb();
    expect(await getWcaPerson(db)).toBeNull();
    await setWcaPerson(db, { wcaId: '2003POCH01', name: 'Test Person' });
    expect(await db.settings.get('user')).toEqual({
      id: 'user',
      wca_id: '2003POCH01',
      wca_name: 'Test Person',
      value: null,
    });
    expect(await getWcaPerson(db)).toEqual({ wcaId: '2003POCH01', name: 'Test Person' });
    await clearWcaPerson(db);
    expect(await getWcaPerson(db)).toBeNull();
  });
});
