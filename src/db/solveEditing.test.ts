import { describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../test/db.ts';
import { holdNextCall } from '../test/gate.ts';
import { SolveEditing } from './solveEditing.ts';
import { saveTimedSolve } from './solves.ts';

function manualClock() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { readonly at: number; readonly callback: () => void }>();
  return {
    now: () => now,
    setTimeout: (callback: () => void, delayMs: number) => {
      const timerId = ++id;
      timers.set(timerId, { at: now + delayMs, callback });
      return timerId;
    },
    clearTimeout: (timer: unknown) => timers.delete(timer as number),
    advance: (duration: number) => {
      now += duration;
      for (const [timerId, timer] of timers) {
        if (timer.at <= now) {
          timers.delete(timerId);
          timer.callback();
        }
      }
    },
  };
}

describe('shared solve editing', () => {
  it('rejects another target while the original edit is pending', async () => {
    const db = createTestDb();
    const { solveId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    const { solveId: nextSolveId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_500, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14, 0, 1),
    );
    const editing = new SolveEditing(db);
    const write = holdNextCall(db.solves, 'update');

    const first = editing.changePenalty(solveId, 1, '+2');
    expect(editing.isPending()).toBe(true);
    await write.reached;
    // A new caller may represent another tab or a newly selected solve.
    expect(await editing.changeNotes(nextSolveId, 2, 'later')).toEqual({ status: 'busy' });
    write.release();
    expect(await first).toEqual({ status: 'success', value: true });
    expect(editing.isPending()).toBe(false);
    expect(await db.solves.get(solveId)).toMatchObject({ penalty: '+2' });
    expect(await db.solves.get(nextSolveId)).toMatchObject({ notes: '' });
  });

  it('validates notes and reports a target that disappeared during the write', async () => {
    const db = createTestDb();
    const { solveId, sessionId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    const editing = new SolveEditing(db);
    expect(await editing.changeNotes(solveId, 1, 'x'.repeat(1001))).toMatchObject({
      status: 'invalid',
    });
    await db.sessions.delete(sessionId);
    expect(await editing.changePenalty(solveId, 1, 'DNF')).toEqual({ status: 'unavailable' });
    expect(editing.getFeedback()).toBe(
      "Couldn't change the penalty on Solve 1: it is no longer available.",
    );
    await db.sessions.add({
      date: '2026-10-14',
      event_id: '333',
      cube_id: null,
      notes: '',
      created_at: '2026-10-14T00:00:00.000Z',
      solve_count: 0,
      best_single: null,
      worst_single: null,
      session_mean: null,
      ao5: null,
      ao12: null,
      best_ao5: null,
      best_ao12: null,
      best_ao50: null,
      best_ao100: null,
    });
    expect(await editing.changeNotes(solveId, 1, 'note')).toEqual({ status: 'unavailable' });
  });

  it('releases the lock after a rejected write', async () => {
    const db = createTestDb();
    const { solveId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    const editing = new SolveEditing(db);
    vi.spyOn(db.solves, 'update').mockRejectedValue(new Error('write failed'));
    expect(await editing.changeNotes(solveId, 1, 'a note')).toEqual({ status: 'error' });
    expect(editing.getFeedback()).toBe("Couldn't save a note on Solve 1. Please try again.");
    expect(editing.isPending()).toBe(false);
  });

  it('keeps deletion and restoration recoverable after rejected writes', async () => {
    const db = createTestDb();
    const { solveId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    const editing = new SolveEditing(db);

    vi.spyOn(db.solves, 'delete').mockRejectedValue(new Error('delete failed'));
    editing.activate('timer');
    expect(await editing.remove('timer', solveId, 1)).toEqual({ status: 'error' });
    expect(editing.getFeedback()).toBe("Couldn't delete Solve 1. Please try again.");
    vi.restoreAllMocks();

    const solve = await db.solves.get(solveId);
    expect(solve).toBeDefined();
    expect((await editing.remove('timer', solveId, 1)).status).toBe('success');
    vi.spyOn(db.solves, 'put').mockRejectedValue(new Error('restore failed'));
    expect(await editing.restore('timer')).toEqual({ status: 'error' });
    expect(editing.getFeedback()).toBe("Couldn't restore Solve 1. Please try again.");
    expect(await db.solves.get(solveId)).toBeUndefined();
  });

  it('reports Undo as unavailable when its session has disappeared', async () => {
    const db = createTestDb();
    const { solveId, sessionId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    const editing = new SolveEditing(db);
    editing.activate('timer');
    const deleted = await editing.remove('timer', solveId, 1);
    expect(deleted.status).toBe('success');
    if (deleted.status !== 'success') return;

    await db.sessions.delete(sessionId);
    expect(await editing.restore('timer')).toEqual({ status: 'unavailable' });
    expect(editing.getFeedback()).toBe("Couldn't restore Solve 1: it is no longer available.");
    expect(await db.solves.get(solveId)).toBeUndefined();
  });

  it('does not offer Undo when the solve disappears before deletion', async () => {
    const db = createTestDb();
    const { solveId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    const editing = new SolveEditing(db);
    editing.activate('sessions');
    await db.solves.delete(solveId);

    expect(await editing.remove('sessions', solveId, 1)).toEqual({ status: 'unavailable' });
    expect(editing.getFeedback('sessions')).toBe(
      "Couldn't delete Solve 1: it is no longer available.",
    );
    expect(editing.getUndo('sessions')).toBeNull();
  });

  it('starts expiry on deletion success and replaces Undo with a later deletion', async () => {
    const db = createTestDb();
    const first = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    const second = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_500, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14, 0, 1),
    );
    const clock = manualClock();
    const editing = new SolveEditing(db, clock);
    editing.activate('timer');

    await editing.remove('timer', first.solveId, 1);
    const originalExpiry = editing.getUndo('timer')?.expiresAt;
    expect(editing.getUndo('timer')?.message).toBe('Solve 1 deleted.');
    clock.advance(3_000);
    expect(editing.getUndo('timer')?.expiresAt).toBe(originalExpiry);
    await editing.remove('timer', second.solveId, 2);
    expect(editing.getUndo('timer')?.solve.id).toBe(second.solveId);
    clock.advance(7_999);
    expect(editing.getUndo('timer')?.solve.id).toBe(second.solveId);
    clock.advance(1);
    expect(editing.getUndo('timer')).toBeNull();
  });

  it('does not transfer a deletion that finishes after leaving its tab', async () => {
    const db = createTestDb();
    const { solveId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    const editing = new SolveEditing(db);
    editing.activate('timer');
    const write = holdNextCall(db.solves, 'delete');

    const deletion = editing.remove('timer', solveId, 1);
    await write.reached;
    editing.deactivate('timer');
    editing.activate('sessions');
    write.release();
    expect((await deletion).status).toBe('success');
    expect(editing.getUndo('timer')).toBeNull();
    expect(editing.getUndo('sessions')).toBeNull();
    expect(await db.solves.get(solveId)).toBeUndefined();
  });

  it('retains recovery while Undo is writing and renews expiry after failure', async () => {
    const db = createTestDb();
    const { solveId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    const clock = manualClock();
    const editing = new SolveEditing(db, clock);
    editing.activate('timer');
    await editing.remove('timer', solveId, 1);
    const expiredAt = editing.getUndo('timer')?.expiresAt;
    const write = holdNextCall(db.solves, 'put');

    const restoration = editing.restore('timer');
    await write.reached;
    expect(editing.getUndo('timer')?.restoring).toBe(true);
    expect(await editing.restore('timer')).toEqual({ status: 'busy' });
    clock.advance(8_000);
    expect(editing.getUndo('timer')?.solve.id).toBe(solveId);
    write.reject(new Error('restore failed'));
    expect(await restoration).toEqual({ status: 'error' });
    expect(editing.getUndo('timer')?.expiresAt).toBeGreaterThan(expiredAt ?? 0);
    expect(editing.getUndo('timer')?.restoring).toBe(false);

    vi.restoreAllMocks();
    expect(await editing.restore('timer')).toMatchObject({ status: 'success' });
    expect(await db.solves.get(solveId)).toBeDefined();
  });
});
