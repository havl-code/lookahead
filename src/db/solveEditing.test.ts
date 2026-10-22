import { describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../test/db.ts';
import { SolveEditing } from './solveEditing.ts';
import { saveTimedSolve } from './solves.ts';

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
    const update = db.solves.update.bind(db.solves);
    let finish!: () => void;
    let started!: () => void;
    const hasStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(db.solves, 'update').mockImplementation((async (...args) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
        started();
      });
      return update(...args);
    }) as typeof db.solves.update);

    const first = editing.changePenalty(solveId, 1, '+2');
    expect(editing.isPending()).toBe(true);
    await hasStarted;
    // A new caller may represent another tab or a newly selected solve.
    expect(await editing.changeNotes(nextSolveId, 2, 'later')).toEqual({ status: 'busy' });
    finish();
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
    expect(await editing.remove(solveId, 1)).toEqual({ status: 'error' });
    expect(editing.getFeedback()).toBe("Couldn't delete Solve 1. Please try again.");
    vi.restoreAllMocks();

    const solve = await db.solves.get(solveId);
    expect(solve).toBeDefined();
    vi.spyOn(db.solves, 'put').mockRejectedValue(new Error('restore failed'));
    expect(await editing.restore(solve as NonNullable<typeof solve>)).toEqual({ status: 'error' });
    expect(editing.getFeedback()).toBe("Couldn't restore Solve 1. Please try again.");
    expect(await db.solves.get(solveId)).toMatchObject({ time_ms: 12_340 });
  });

  it('reports Undo as unavailable when its session has disappeared', async () => {
    const db = createTestDb();
    const { solveId, sessionId } = await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 12_340, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14),
    );
    const editing = new SolveEditing(db);
    const deleted = await editing.remove(solveId, 1);
    expect(deleted.status).toBe('success');
    if (deleted.status !== 'success') return;

    await db.sessions.delete(sessionId);
    expect(await editing.restore(deleted.value)).toEqual({ status: 'unavailable' });
    expect(editing.getFeedback()).toBe("Couldn't restore Solve 1: it is no longer available.");
    expect(await db.solves.get(solveId)).toBeUndefined();
  });
});
