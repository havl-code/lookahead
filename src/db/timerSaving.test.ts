import { describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../test/db.ts';
import { startTimerSession } from './solves.ts';
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
