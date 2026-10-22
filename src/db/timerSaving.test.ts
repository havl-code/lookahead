import { describe, expect, it, vi } from 'vitest';
import { importCsTimer } from '../features/import/cstimer.ts';
import { createTestDb } from '../test/db.ts';
import { SolveEditing } from './solveEditing.ts';
import {
  addSolve,
  sessionSolvesWithAverages,
  solvesWithAverages,
  startTimerSession,
} from './solves.ts';
import { TimerSaving } from './timerSaving.ts';

const context = { eventId: '333', scramble: "R U R'", sessionId: null };
const finished = { timeMs: 12_340, penalty: 'OK' as const };
const completion = new Date(2026, 9, 23, 0, 1);

describe('independent timed saves', () => {
  it('captures context at start and completion time at finish, saving only once', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const choice = { ...context };
    const id = saving.capture(choice);
    choice.eventId = '222';
    const first = saving.finish(id, finished, completion);
    await saving.finish(id, { timeMs: 1, penalty: 'DNF' }, new Date());
    await first;
    await saving.retry(id);
    const attempt = saving.getAttempt(id);
    expect(attempt).toMatchObject({
      eventId: '333',
      scramble: "R U R'",
      status: 'saved',
      timeMs: 12_340,
      timestamp: completion.toISOString(),
      day: '2026-10-23',
      order: 1,
    });
    expect(await db.solves.toArray()).toMatchObject([
      {
        id: attempt?.solveId,
        session_id: attempt?.destinationId,
        time_ms: 12_340,
        timestamp: completion.toISOString(),
        solve_number: 1,
      },
    ]);
    expect(await db.sessions.toArray()).toMatchObject([
      {
        date: '2026-10-23',
        event_id: '333',
        solve_count: 1,
        best_single: 12_340,
      },
    ]);
  });
});

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('save recovery', () => {
  it('requires a replacement from the original event and retains it across another deletion', async () => {
    const db = createTestDb();
    const original = await startTimerSession(db, '333', completion);
    const replacement = await startTimerSession(db, '333', completion);
    const wrongEvent = await startTimerSession(db, '222', completion);
    const saving = new TimerSaving(db);
    const id = saving.capture({ ...context, sessionId: original });
    await db.sessions.delete(original);
    await saving.finish(id, finished, completion);
    await saving.retry(id, wrongEvent);
    expect(saving.getAttempt(id)).toMatchObject({
      status: 'unavailable',
      destinationId: original,
    });
    expect(await db.solves.count()).toBe(0);
    const add = vi.spyOn(db.solves, 'add').mockRejectedValueOnce(new Error('full'));
    await saving.retry(id, replacement);
    expect(saving.getAttempt(id)).toMatchObject({
      status: 'error',
      destinationId: replacement,
      eventId: '333',
      scramble: "R U R'",
      timeMs: 12_340,
      penalty: 'OK',
      timestamp: completion.toISOString(),
      day: '2026-10-23',
      order: 1,
    });
    add.mockRestore();
    await db.sessions.delete(replacement);
    await saving.retry(id);
    expect(saving.getAttempt(id)?.status).toBe('unavailable');
    expect(await db.solves.count()).toBe(0);
    const finalDestination = await startTimerSession(db, '333', completion);
    await saving.retry(id, finalDestination);
    expect(await db.solves.toArray()).toMatchObject([
      {
        session_id: finalDestination,
        time_ms: 12_340,
        penalty: 'OK',
        scramble: "R U R'",
        timestamp: completion.toISOString(),
      },
    ]);
  });

  it('discards only a failed attempt and refuses to discard a pending or saved write', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const add = vi.spyOn(db.solves, 'add').mockRejectedValue(new Error('full'));
    const a = saving.capture(context);
    const b = saving.capture(context);
    await saving.finish(a, finished, completion);
    await saving.finish(b, finished, completion);
    saving.discard(a);
    expect(saving.getAttempts().map((attempt) => attempt.id)).toEqual([b]);
    add.mockRestore();
    const gate = deferred();
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementationOnce(((...args: unknown[]) =>
      gate.promise.then(() => Reflect.apply(transaction, db, args))) as typeof db.transaction);
    const retry = saving.retry(b);
    saving.discard(b);
    expect(saving.getAttempt(b)?.status).toBe('saving');
    gate.resolve();
    await retry;
    saving.discard(b);
    expect(saving.getAttempt(b)?.status).toBe('saved');
    expect(await db.solves.count()).toBe(1);
  });

  it('retains separate failures and guards repeated Retry while another attempt saves', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const add = vi.spyOn(db.solves, 'add').mockRejectedValue(new Error('full'));
    const a = saving.capture(context);
    const b = saving.capture({ ...context, eventId: '222' });
    await saving.finish(a, finished, completion);
    await saving.finish(b, { timeMs: 3_000, penalty: '+2' }, completion);
    expect(saving.getAttempts().map((attempt) => attempt.status)).toEqual(['error', 'error']);
    expect(await db.sessions.count()).toBe(0);
    add.mockRestore();

    const gate = deferred();
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementationOnce(((...args: unknown[]) =>
      gate.promise.then(() => Reflect.apply(transaction, db, args))) as typeof db.transaction);
    const retry = saving.retry(a);
    await saving.retry(a);
    expect(saving.getAttempt(a)?.status).toBe('saving');
    await saving.retry(b);
    expect(saving.getAttempt(b)?.status).toBe('saved');
    expect(saving.getAttempt(a)?.status).toBe('saving');
    gate.resolve();
    await retry;
    await saving.retry(a);
    expect(await db.solves.count()).toBe(2);
    expect(saving.getAttempt(a)).toMatchObject({ status: 'saved', timeMs: 12_340 });
    expect(saving.getAttempt(b)).toMatchObject({ status: 'saved', timeMs: 3_000 });
  });

  it('retains a resolved daily destination across a failed write and a later new session', async () => {
    const db = createTestDb();
    const original = await startTimerSession(db, '333', completion);
    await db.sessions.update(original, { cube_id: 7 });
    const saving = new TimerSaving(db);
    const id = saving.capture(context);
    const add = vi.spyOn(db.solves, 'add').mockRejectedValueOnce(new Error('full'));
    await saving.finish(id, finished, completion);
    expect(saving.getAttempt(id)?.destinationId).toBe(original);
    add.mockRestore();
    await startTimerSession(db, '333', completion);
    await saving.retry(id);
    expect(saving.getAttempt(id)).toMatchObject({ status: 'saved', destinationId: original });
    expect(await db.solves.toArray()).toMatchObject([
      {
        session_id: original,
        timestamp: completion.toISOString(),
      },
    ]);
    expect(await db.sessions.get(original)).toMatchObject({ cube_id: 7, solve_count: 1 });
  });

  it('reports a deleted explicit destination as unavailable without redirecting it', async () => {
    const db = createTestDb();
    const original = await startTimerSession(db, '333', new Date(2026, 9, 20));
    const saving = new TimerSaving(db);
    const id = saving.capture({ ...context, sessionId: original });
    await db.sessions.delete(original);
    await startTimerSession(db, '333', completion);
    await saving.finish(id, finished, completion);
    await saving.retry(id);
    expect(saving.getAttempt(id)).toMatchObject({ status: 'unavailable', destinationId: original });
    expect(await db.solves.count()).toBe(0);
    expect(await db.sessions.count()).toBe(1);
  });

  it('keeps an explicitly selected older session and inherits the cube for a new daily session', async () => {
    const db = createTestDb();
    const original = await startTimerSession(db, '333', new Date(2026, 9, 20));
    await db.sessions.update(original, { cube_id: 7 });
    const saving = new TimerSaving(db);
    const explicit = saving.capture({ ...context, sessionId: original });
    await saving.finish(explicit, finished, completion);
    const daily = saving.capture(context);
    await saving.finish(daily, finished, completion);
    expect(saving.getAttempt(explicit)?.destinationId).toBe(original);
    expect(saving.getAttempt(daily)?.destinationId).not.toBe(original);
    expect(await db.sessions.get(saving.getAttempt(daily)?.destinationId as number)).toMatchObject({
      date: '2026-10-23',
      cube_id: 7,
      solve_count: 1,
    });
  });

  it('keeps a committed solve successful when persistence metadata rejects', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const failed = deferred();
    vi.spyOn(db.meta, 'put').mockImplementation(() => {
      failed.resolve();
      return Promise.reject(new Error('metadata failed')) as ReturnType<typeof db.meta.put>;
    });
    const id = saving.capture(context);
    await saving.finish(id, finished, completion);
    await failed.promise;
    await saving.retry(id);
    expect(saving.getAttempt(id)?.status).toBe('saved');
    expect(await db.solves.count()).toBe(1);
  });

  it('does not save a cancelled attempt', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const id = saving.capture(context);
    saving.cancel(id);
    await saving.finish(id, finished, completion);
    expect(saving.getAttempts()).toEqual([]);
    expect(await db.solves.count()).toBe(0);
  });
});

describe('completion dates and atomic writes', () => {
  it('retains the completion day and timestamp when Retry runs on a later day', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 9, 22, 23, 59));
      const id = saving.capture(context);
      vi.setSystemTime(completion);
      const add = vi.spyOn(db.solves, 'add').mockRejectedValueOnce(new Error('full'));
      await saving.finish(id, finished);
      add.mockRestore();
      vi.setSystemTime(new Date(2026, 9, 25, 9));
      await saving.retry(id);
      expect(await db.sessions.toArray()).toMatchObject([{ date: '2026-10-23' }]);
      expect(await db.solves.toArray()).toMatchObject([{ timestamp: completion.toISOString() }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rolls back daily creation and insertion when updating statistics rejects', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const update = vi.spyOn(db.sessions, 'update').mockRejectedValueOnce(new Error('full'));
    const id = saving.capture(context);
    await saving.finish(id, finished, completion);
    expect(saving.getAttempt(id)?.status).toBe('error');
    expect(await db.solves.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
    update.mockRestore();
    await saving.retry(id);
    expect(await db.sessions.toArray()).toMatchObject([{ solve_count: 1, best_single: 12_340 }]);
    expect(await db.solves.count()).toBe(1);
  });

  it('retains independent outcomes when an older pending save rejects after a newer success', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const gate = deferred();
    vi.spyOn(db, 'transaction').mockImplementationOnce(
      (() => gate.promise) as unknown as typeof db.transaction,
    );
    const first = saving.capture(context);
    const older = saving.finish(first, finished, completion);
    const second = saving.capture(context);
    await saving.finish(second, { timeMs: 10_000, penalty: 'OK' }, completion);
    gate.reject(new Error('full'));
    await older;
    expect(saving.getAttempt(first)?.status).toBe('error');
    expect(saving.getAttempt(second)?.status).toBe('saved');
    expect(await db.solves.toArray()).toMatchObject([{ time_ms: 10_000 }]);
  });
});

describe('original attempt order', () => {
  it('inserts recovered A before B and refreshes their worked averages', async () => {
    const db = createTestDb();
    const sessionId = await startTimerSession(db, '333', completion);
    for (const timeMs of [10_000, 11_000, 12_000, 13_000]) {
      await addSolve(db, sessionId, { timeMs, penalty: 'OK', scramble: '', notes: '' });
    }
    const saving = new TimerSaving(db);
    const a = saving.capture({ ...context, sessionId });
    const add = vi.spyOn(db.solves, 'add').mockRejectedValueOnce(new Error('full'));
    await saving.finish(a, { timeMs: 14_000, penalty: 'OK' }, completion);
    add.mockRestore();
    const b = saving.capture({ ...context, sessionId });
    await saving.finish(b, { timeMs: 30_000, penalty: 'OK' }, completion);
    await saving.retry(a);
    const rows = await solvesWithAverages(db, sessionId, 2);
    expect(rows).toMatchObject([
      { id: saving.getAttempt(b)?.solveId, solve_number: 6, time_ms: 30_000, ao5: 13_000 },
      { id: saving.getAttempt(a)?.solveId, solve_number: 5, time_ms: 14_000, ao5: 12_000 },
    ]);
    expect(await db.sessions.get(sessionId)).toMatchObject({
      solve_count: 6,
      ao5: 13_000,
      best_ao5: 12_000,
      session_mean: 15_000,
    });
  });
});

it('orders multiple failures with equal timestamps around unrelated solves without sorting them', async () => {
  const db = createTestDb();
  const sessionId = await startTimerSession(db, '333', completion);
  const manual = (timeMs: number, date: Date) =>
    addSolve(db, sessionId, { timeMs, penalty: 'OK', scramble: '', notes: '' }, date);
  const historical = await manual(10_000, new Date('2030-01-01'));
  const saving = new TimerSaving(db);
  const a = saving.capture({ ...context, sessionId });
  const b = saving.capture({ ...context, sessionId });
  const add = vi.spyOn(db.solves, 'add').mockRejectedValue(new Error('full'));
  await saving.finish(a, { timeMs: 11_000, penalty: 'OK' }, completion);
  await saving.finish(b, { timeMs: 12_000, penalty: '+2' }, completion);
  add.mockRestore();
  const between = await manual(13_000, new Date('2000-01-01'));
  const c = saving.capture({ ...context, sessionId });
  await saving.finish(c, { timeMs: 30_000, penalty: 'OK' }, completion);
  const after = await manual(40_000, new Date('1990-01-01'));
  await saving.retry(b);
  await saving.retry(a);
  expect((await solvesWithAverages(db, sessionId, 10)).reverse()).toMatchObject([
    { id: historical, solve_number: 1 },
    { id: between, solve_number: 2 },
    { id: saving.getAttempt(a)?.solveId, solve_number: 3, time_ms: 11_000 },
    { id: saving.getAttempt(b)?.solveId, solve_number: 4, time_ms: 12_000, penalty: '+2' },
    { id: saving.getAttempt(c)?.solveId, solve_number: 5 },
    { id: after, solve_number: 6 },
  ]);
  for (const id of [a, b, c]) {
    expect(await db.solves.get(saving.getAttempt(id)?.solveId as number)).toMatchObject({
      timestamp: completion.toISOString(),
    });
  }
});

it('preserves order when pending saves commit in reverse order', async () => {
  const db = createTestDb();
  const sessionId = await startTimerSession(db, '333', completion);
  const saving = new TimerSaving(db);
  const gate = deferred();
  const transaction = db.transaction.bind(db);
  vi.spyOn(db, 'transaction').mockImplementationOnce(((...args: unknown[]) =>
    gate.promise.then(() => Reflect.apply(transaction, db, args))) as typeof db.transaction);
  const a = saving.capture({ ...context, sessionId });
  const pending = saving.finish(a, { timeMs: 10_000, penalty: 'OK' }, completion);
  const b = saving.capture({ ...context, sessionId });
  await saving.finish(b, { timeMs: 20_000, penalty: 'OK' }, completion);
  gate.resolve();
  await pending;
  expect((await solvesWithAverages(db, sessionId, 10)).reverse()).toMatchObject([
    { id: saving.getAttempt(a)?.solveId, solve_number: 1, time_ms: 10_000 },
    { id: saving.getAttempt(b)?.solveId, solve_number: 2, time_ms: 20_000 },
  ]);
});

it('rolls back renumbering and statistics on failed recovery and supports later edits and Undo', async () => {
  const db = createTestDb();
  const sessionId = await startTimerSession(db, '333', completion);
  for (const timeMs of [10_000, 11_000, 12_000, 13_000]) {
    await addSolve(db, sessionId, { timeMs, penalty: 'OK', scramble: '', notes: '' });
  }
  const saving = new TimerSaving(db);
  const a = saving.capture({ ...context, sessionId });
  const add = vi.spyOn(db.solves, 'add').mockRejectedValueOnce(new Error('full'));
  await saving.finish(a, { timeMs: 14_000, penalty: 'OK' }, completion);
  add.mockRestore();
  const b = saving.capture({ ...context, sessionId });
  await saving.finish(b, { timeMs: 30_000, penalty: 'OK' }, completion);
  const before = await solvesWithAverages(db, sessionId, 10);
  const stats = await db.sessions.get(sessionId);
  const update = vi.spyOn(db.sessions, 'update').mockRejectedValueOnce(new Error('full'));
  await saving.retry(a);
  expect(saving.getAttempt(a)?.status).toBe('error');
  expect(await solvesWithAverages(db, sessionId, 10)).toEqual(before);
  expect(await db.sessions.get(sessionId)).toEqual(stats);
  update.mockRestore();
  await saving.retry(a);
  const editing = new SolveEditing(db);
  editing.activate('timer');
  const aId = saving.getAttempt(a)?.solveId as number;
  await editing.changePenalty(aId, 5, '+2');
  expect(await sessionSolvesWithAverages(db, sessionId, 'fastest', 5)).toMatchObject([
    { solve_number: 1, ao5: null },
    { solve_number: 2, ao5: null },
    { solve_number: 3, ao5: null },
    { solve_number: 4, ao5: null },
    { id: aId, solve_number: 5, ao5: 12_000 },
  ]);
  expect(await sessionSolvesWithAverages(db, sessionId, 'slowest', 1)).toMatchObject([
    { id: saving.getAttempt(b)?.solveId, solve_number: 6, ao5: 13666.666666666666 },
  ]);
  await editing.remove('timer', aId, 5);
  expect(await solvesWithAverages(db, sessionId, 1)).toMatchObject([
    { id: saving.getAttempt(b)?.solveId, solve_number: 5, ao5: 12_000 },
  ]);
  await editing.restore('timer');
  expect(await solvesWithAverages(db, sessionId, 2)).toMatchObject([
    { id: saving.getAttempt(b)?.solveId, solve_number: 6, ao5: 13666.666666666666 },
    { id: aId, solve_number: 5, time_ms: 14_000, penalty: '+2', ao5: 12_000 },
  ]);
  editing.deactivate('timer');
});

it('recovers into an imported session without sorting imported timestamps or other destinations', async () => {
  const db = createTestDb();
  await importCsTimer(
    db,
    {
      session1: [
        [[0, 10_000], 'R', 'later date first', 1_800_000_000],
        [[0, 11_000], 'U', 'earlier date second', 1_700_000_000],
      ],
    },
    { keys: ['session1'], eventId: '333', splitByDay: false },
  );
  const sessionId = (await db.sessions.toArray())[0]?.id as number;
  const imported = await solvesWithAverages(db, sessionId, 10);
  const other = await startTimerSession(db, '333', completion);
  const saving = new TimerSaving(db);
  const a = saving.capture({ ...context, sessionId });
  const add = vi.spyOn(db.solves, 'add').mockRejectedValueOnce(new Error('full'));
  await saving.finish(a, finished, completion);
  add.mockRestore();
  const b = saving.capture({ ...context, sessionId: other });
  await saving.finish(b, { timeMs: 30_000, penalty: 'OK' }, completion);
  await saving.retry(a);
  expect(await solvesWithAverages(db, sessionId, 10)).toEqual([
    expect.objectContaining({ solve_number: 3, time_ms: 12_340 }),
    ...imported,
  ]);
  expect(await solvesWithAverages(db, other, 10)).toMatchObject([
    { solve_number: 1, time_ms: 30_000 },
  ]);
});

describe('saved result reconciliation', () => {
  it('acknowledges an identity below the newest row and settles deletion and context changes', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const id = saving.capture(context);
    await saving.finish(id, finished, completion);
    const saved = saving.getAttempt(id);
    if (saved?.destinationId == null || saved.solveId === undefined)
      throw new Error('Expected a committed attempt');
    const sessionId = saved.destinationId;
    await addSolve(db, sessionId, { timeMs: 3_000, penalty: 'OK', scramble: '', notes: '' });
    const list = await solvesWithAverages(db, sessionId, 12);
    expect(list[0]?.time_ms).toBe(3_000);
    expect((await saving.reconcile(id, '333', sessionId))?.id).toBe(saved.solveId);
    expect(await saving.reconcile(id, '222', sessionId)).toBeNull();
    expect(await saving.reconcile(id, '333', null)).toBeNull();
    await db.solves.delete(saved.solveId);
    expect((await saving.reconcile(id, '333', sessionId))?.time_ms).toBe(3_000);
    await db.solves.clear();
    expect(await saving.reconcile(id, '333', sessionId)).toBeNull();
  });
});
