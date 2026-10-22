import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimerSaving } from '../db/timerSaving.ts';
import { createTestDb } from '../test/db.ts';
import { holdNextCall } from '../test/gate.ts';
import { holdUpdates, updatesHeld, useHoldUpdates } from './updates.ts';

afterEach(() => {
  document.body.replaceChildren();
});

describe('updatesHeld', () => {
  it('is free when nothing is in progress', () => {
    expect(updatesHeld()).toBe(false);
  });

  it('holds until every hold is released, even if one is released twice', () => {
    const first = holdUpdates();
    const second = holdUpdates();
    first();
    first();
    expect(updatesHeld()).toBe(true);
    second();
    expect(updatesHeld()).toBe(false);
  });

  it('holds while a hook says so, and lets go on unmount', () => {
    const { rerender, unmount } = renderHook(({ active }) => useHoldUpdates(active), {
      initialProps: { active: true },
    });
    expect(updatesHeld()).toBe(true);
    rerender({ active: false });
    expect(updatesHeld()).toBe(false);
    rerender({ active: true });
    unmount();
    expect(updatesHeld()).toBe(false);
  });

  it('holds while a sheet is open', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    expect(updatesHeld()).toBe(true);
  });

  it('holds while a text field has focus, but not a radio button', () => {
    const text = document.createElement('input');
    const radio = document.createElement('input');
    radio.type = 'radio';
    document.body.append(text, radio);
    text.focus();
    expect(updatesHeld()).toBe(true);
    radio.focus();
    expect(updatesHeld()).toBe(false);
  });
});

describe('timed attempts', () => {
  const context = { eventId: '333', scramble: "R U R'", sessionId: null };
  const finished = { timeMs: 12_340, penalty: 'OK' as const };

  it('hold updates while a delayed write is pending, and let go once it saves', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const save = holdNextCall(db, 'transaction');
    const id = saving.capture(context);
    expect(saving.hasUnsavedAttempts()).toBe(false);
    const finishing = saving.finish(id, finished);
    expect(saving.hasUnsavedAttempts()).toBe(true);
    expect(updatesHeld()).toBe(true);
    save.release();
    await finishing;
    expect(saving.hasUnsavedAttempts()).toBe(false);
    expect(updatesHeld()).toBe(false);
  });

  it('keep holding until the last failed attempt is saved or discarded', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const add = vi.spyOn(db.solves, 'add').mockRejectedValue(new Error('full'));
    const [a, b, c] = [saving.capture(context), saving.capture(context), saving.capture(context)];
    for (const id of [a, b, c]) await saving.finish(id, finished);
    expect(saving.getAttempts().map((attempt) => attempt.status)).toEqual([
      'error',
      'error',
      'error',
    ]);

    await saving.retry(a);
    expect(saving.getAttempt(a)?.status).toBe('error');
    expect(updatesHeld()).toBe(true);

    saving.discard(a);
    expect(updatesHeld()).toBe(true);
    add.mockRestore();
    await saving.retry(b);
    expect(saving.getAttempt(b)?.status).toBe('saved');
    expect(saving.hasUnsavedAttempts()).toBe(true);
    expect(updatesHeld()).toBe(true);

    saving.discard(c);
    expect(saving.hasUnsavedAttempts()).toBe(false);
    expect(updatesHeld()).toBe(false);
  });

  it('release only their own holds, leaving active timing and other work held', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const timing = holdUpdates();
    const id = saving.capture(context);
    await saving.finish(id, finished);
    expect(saving.getAttempt(id)?.status).toBe('saved');
    expect(updatesHeld()).toBe(true);
    timing();
    expect(updatesHeld()).toBe(false);
  });

  it('do not hold updates when only persistence bookkeeping fails after a save', async () => {
    const db = createTestDb();
    const saving = new TimerSaving(db);
    const put = vi.spyOn(db.meta, 'put').mockRejectedValue(new Error('metadata failed'));
    const id = saving.capture(context);
    await saving.finish(id, finished);
    await vi.waitFor(() => expect(put).toHaveBeenCalled());
    expect(saving.getAttempt(id)?.status).toBe('saved');
    expect(saving.hasUnsavedAttempts()).toBe(false);
    expect(updatesHeld()).toBe(false);
  });
});
