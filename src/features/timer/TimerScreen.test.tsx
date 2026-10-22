import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DbProvider } from '../../db/DbProvider.tsx';
import * as hooks from '../../db/hooks.ts';
import { addSolve, startTimerSession } from '../../db/solves.ts';
import { updateTimerSettings } from '../../db/timerSettings.ts';
import { createTestDb } from '../../test/db.ts';
import { TimerScreen } from './TimerScreen.tsx';

async function setup() {
  const db = createTestDb();
  await updateTimerSettings(db, { inspectionEnabled: false });
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  function Harness() {
    const [timer, setTimer] = useState(true);
    return (
      <DbProvider db={db}>
        <button type="button" onClick={() => setTimer(!timer)}>
          Change tab
        </button>
        {timer && <TimerScreen />}
      </DbProvider>
    );
  }
  render(<Harness />);
  await screen.findByRole('combobox', { name: 'Event' });
  await waitFor(() =>
    expect(
      screen.getByText('Hold the time until it turns green, then let go to start.'),
    ).toBeDefined(),
  );
  return {
    db,
    start() {
      fireEvent.keyDown(document.body, { key: ' ' });
      now += 350;
      fireEvent.keyUp(document.body, { key: ' ' });
    },
    stop(duration: number) {
      now += duration;
      fireEvent.keyDown(document.body, { key: ' ' });
      fireEvent.keyUp(document.body, { key: ' ' });
    },
  };
}

describe('Timer save controls', () => {
  it('keeps shortcuts on the displayed attempt when another solve becomes the newest row', async () => {
    const { db, start, stop } = await setup();
    start();
    stop(12_340);
    await screen.findByRole('group', { name: 'Solve 1' });
    const [saved] = await db.solves.toArray();
    if (!saved) throw new Error('Expected the timed solve');
    await addSolve(db, saved.session_id, {
      timeMs: 3_000,
      penalty: 'OK',
      scramble: '',
      notes: '',
    });
    await screen.findByRole('button', { name: /^Solve 2: 3.00/ });
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    await screen.findByRole('button', { name: /^Solve 1: 14.34/ });
    expect((await db.solves.get(saved.id))?.penalty).toBe('+2');
    expect((await db.solves.toArray())[1]?.penalty).toBe('OK');
  });

  it('holds shortcuts off an older solve until a failed latest attempt is discarded', async () => {
    const { db, start, stop } = await setup();
    start();
    stop(12_340);
    await screen.findByRole('group', { name: 'Solve 1' });
    const add = vi.spyOn(db.solves, 'add').mockRejectedValueOnce(new Error('full'));
    start();
    stop(3_000);
    const recover = await screen.findByRole('button', { name: 'Recover 1 unsaved attempt' });
    add.mockRestore();
    // A delete that reached Solve 1 would leave nothing for the later +2 to change.
    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true });
    fireEvent.click(recover);
    const sheet = screen.getByRole('dialog', { name: 'Unsaved attempts' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Discard' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    await screen.findByRole('button', { name: /^Solve 1: 14.34/ });
    expect(await db.solves.count()).toBe(1);
  });

  it('reconciles delayed list observations without editing the previously displayed solve', async () => {
    const useTimerSession = hooks.useTimerSession;
    let held: ReturnType<typeof useTimerSession>;
    let freeze = false;
    vi.spyOn(hooks, 'useTimerSession').mockImplementation((...args) => {
      const observed = useTimerSession(...args);
      if (!freeze) held = observed;
      return held;
    });
    const { db, start, stop } = await setup();
    start();
    stop(12_340);
    await screen.findByRole('group', { name: 'Solve 1' });
    freeze = true;
    const get = db.solves.get.bind(db.solves);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reading = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.spyOn(db.solves, 'get').mockImplementationOnce(((key: number) => {
      entered();
      return gate.then(() => get(key));
    }) as typeof db.solves.get);
    start();
    stop(3_000);
    await screen.findByText('3.00, saved.');
    await act(async () => {
      await reading;
    });
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    expect((await db.solves.toArray()).map((solve) => solve.penalty)).toEqual(['OK', 'OK']);
    start();
    stop(5_000);
    await screen.findByRole('group', { name: 'Solve 3' });
    await act(async () => {
      release();
      await gate;
    });
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    await waitFor(async () =>
      expect((await db.solves.toArray()).map((solve) => solve.penalty)).toEqual(['OK', 'OK', '+2']),
    );
    freeze = false;
    fireEvent.click(screen.getByRole('button', { name: 'New scramble' }));
    await screen.findByRole('button', { name: /^Solve 3: 7.00/ });
  });

  it('observes edits and deletion even while the list still contains the committed row', async () => {
    const useTimerSession = hooks.useTimerSession;
    let held: ReturnType<typeof useTimerSession>;
    let freeze = false;
    vi.spyOn(hooks, 'useTimerSession').mockImplementation((...args) => {
      const observed = useTimerSession(...args);
      if (!freeze) held = observed;
      return held;
    });
    const { db, start, stop } = await setup();
    start();
    stop(12_340);
    await screen.findByRole('group', { name: 'Solve 1' });
    start();
    stop(3_000);
    await screen.findByRole('group', { name: 'Solve 2' });
    freeze = true;
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    await waitFor(async () => expect((await db.solves.toArray())[1]?.penalty).toBe('+2'));
    fireEvent.keyDown(document.body, { key: '1', code: 'Digit1', altKey: true });
    await waitFor(async () => expect((await db.solves.toArray())[1]?.penalty).toBe('OK'));
    const [, latest] = await db.solves.toArray();
    if (!latest) throw new Error('Expected the latest solve');
    await db.solves.delete(latest.id);
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Solve 2' })).toBeNull());
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    await waitFor(async () =>
      expect((await db.solves.toArray()).map((solve) => solve.penalty)).toEqual(['+2']),
    );
  });

  it('releases a deleted result and allows shortcuts on the surviving current list', async () => {
    const { db, start, stop } = await setup();
    start();
    stop(12_340);
    await screen.findByRole('group', { name: 'Solve 1' });
    start();
    stop(3_000);
    await screen.findByRole('group', { name: 'Solve 2' });
    const [, latest] = await db.solves.toArray();
    if (!latest) throw new Error('Expected the latest timed solve');
    await db.solves.delete(latest.id);
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Solve 2' })).toBeNull());
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    await screen.findByRole('button', { name: /^Solve 1: 14.34/ });
  });

  it('does not edit a stale list while a new session selection is loading', async () => {
    const { db, start, stop } = await setup();
    start();
    stop(12_340);
    await screen.findByRole('group', { name: 'Solve 1' });
    const [saved] = await db.solves.toArray();
    if (!saved) throw new Error('Expected the timed solve');
    const other = await startTimerSession(db, '333');
    const menu = screen.getByRole('combobox', { name: 'Session' });
    await waitFor(() => expect(menu.querySelector(`option[value="${other}"]`)).not.toBeNull());
    fireEvent.change(menu, { target: { value: String(saved.session_id) } });
    await screen.findByRole('button', { name: /^Solve 1: 12.34/ });
    fireEvent.change(menu, { target: { value: String(other) } });
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    await screen.findByText('No solves yet today.');
    expect((await db.solves.get(saved.id))?.penalty).toBe('OK');
    fireEvent.change(menu, { target: { value: String(saved.session_id) } });
    await screen.findByRole('button', { name: /^Solve 1: 12.34/ });
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    await screen.findByRole('button', { name: /^Solve 1: 14.34/ });
    fireEvent.change(screen.getByRole('combobox', { name: 'Event' }), { target: { value: '333' } });
  });

  it('changes event ownership immediately while its preference write is pending', async () => {
    const { db, start, stop } = await setup();
    start();
    stop(12_340);
    await screen.findByRole('group', { name: 'Solve 1' });
    const put = db.meta.put.bind(db.meta);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(db.meta, 'put').mockImplementationOnce(((row: { key: string; value: unknown }) =>
      gate.then(() => put(row))) as typeof db.meta.put);
    fireEvent.change(screen.getByRole('combobox', { name: 'Event' }), { target: { value: '222' } });
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Event' }) as HTMLSelectElement).value).toBe(
        '222',
      ),
    );
    expect((await db.solves.toArray()).map((solve) => solve.penalty)).toEqual(['OK']);
  });

  it('keeps save and edit guards independent while newer attempts finish', async () => {
    const { db, start, stop } = await setup();
    start();
    stop(12_340);
    await screen.findByRole('group', { name: 'Solve 1' });
    const transaction = db.transaction.bind(db);
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    vi.spyOn(db, 'transaction').mockImplementationOnce(((...args: unknown[]) =>
      saveGate.then(() => Reflect.apply(transaction, db, args))) as typeof db.transaction);
    start();
    stop(3_000);
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    expect((await db.solves.toArray()).map((solve) => solve.penalty)).toEqual(['OK']);
    start();
    fireEvent.keyDown(document.body, { key: '3', code: 'Digit3', altKey: true });
    stop(5_000);
    await screen.findByRole('group', { name: 'Solve 2' });
    let releaseEdit!: () => void;
    const editGate = new Promise<void>((resolve) => {
      releaseEdit = resolve;
    });
    vi.spyOn(db, 'transaction').mockImplementationOnce(((...args: unknown[]) =>
      editGate.then(() => Reflect.apply(transaction, db, args))) as typeof db.transaction);
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await act(async () => {
      releaseSave();
      await saveGate;
    });
    await screen.findByRole('button', { name: /^Solve 3: 5.00/ });
    fireEvent.keyDown(document.body, { key: '3', code: 'Digit3', altKey: true });
    await act(async () => {
      releaseEdit();
      await editGate;
    });
    await screen.findByRole('button', { name: /^Solve 3: 7.00/ });
    expect((await db.solves.toArray()).map((solve) => [solve.time_ms, solve.penalty])).toEqual([
      [12_340, 'OK'],
      [5_000, '+2'],
      [3_000, 'OK'],
    ]);
    fireEvent.keyDown(document.body, { key: '3', code: 'Digit3', altKey: true });
    await screen.findByRole('button', { name: /^Solve 3: DNF/ });
  });

  it('keeps several failures after closing the sheet and guards an older Retry during navigation', async () => {
    const { db, start, stop } = await setup();
    const add = vi.spyOn(db.solves, 'add').mockRejectedValue(new Error('full'));
    start();
    stop(12_340);
    await screen.findByRole('button', { name: 'Recover 1 unsaved attempt' });
    start();
    stop(5_000);
    fireEvent.click(await screen.findByRole('button', { name: 'Recover 2 unsaved attempts' }));
    let sheet = screen.getByRole('dialog', { name: 'Unsaved attempts' });
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Unsaved attempts' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Recover 2 unsaved attempts' }));
    sheet = screen.getByRole('dialog', { name: 'Unsaved attempts' });
    let older = within(sheet).getByRole('listitem', { name: /^12.34, 3x3x3,/ });
    await waitFor(() =>
      expect(
        (within(older).getByRole('button', { name: 'Retry' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(within(older).getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(within(older).getByRole('status').textContent).toContain("Couldn't save"),
    );
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(2);
    const newer = within(sheet).getByRole('listitem', { name: /^5.00, 3x3x3,/ });
    fireEvent.click(within(newer).getByRole('button', { name: 'Discard' }));
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(1);
    add.mockRestore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementationOnce(((...args: unknown[]) =>
      gate.then(() => Reflect.apply(transaction, db, args))) as typeof db.transaction);
    older = within(sheet).getByRole('listitem');
    const retry = within(older).getByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    fireEvent.click(within(older).getByRole('button', { name: 'Discard' }));
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    expect(within(older).getByRole('status').textContent).toBe('Saving…');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    start();
    stop(3_000);
    await screen.findByText('3.00, saved.');
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(async () => expect(await db.solves.count()).toBe(2));
    expect(screen.getByText('3.00, saved.')).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'Unsaved attempts' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Recover/ })).toBeNull();
    await screen.findByRole('group', { name: 'Solve 2' });
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true });
    await screen.findByRole('button', { name: /^Solve 2: 5.00/ });
    expect((await db.solves.toArray()).map((solve) => [solve.time_ms, solve.penalty])).toEqual([
      [3_000, '+2'],
      [12_340, 'OK'],
    ]);
  });

  it('shows a deleted destination and offers only explicit replacements for its original event', async () => {
    const { db, start, stop } = await setup();
    const original = await startTimerSession(db, '333');
    const replacement = await startTimerSession(db, '333');
    const wrong = await startTimerSession(db, '222');
    await waitFor(() =>
      expect(
        screen
          .getByRole('combobox', { name: 'Session' })
          .querySelector(`option[value="${original}"]`),
      ).not.toBeNull(),
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Session' }), {
      target: { value: String(original) },
    });
    start();
    await db.sessions.delete(original);
    stop(12_340);
    fireEvent.click(await screen.findByRole('button', { name: 'Recover 1 unsaved attempt' }));
    const sheet = screen.getByRole('dialog', { name: 'Unsaved attempts' });
    await within(sheet).findByText('Destination: Session unavailable');
    const choices = within(sheet).getByRole('combobox', { name: 'Replacement session' });
    expect(choices.querySelector(`option[value="${replacement}"]`)).not.toBeNull();
    expect(choices.querySelector(`option[value="${wrong}"]`)).toBeNull();
    expect(
      (within(sheet).getByRole('button', { name: 'Retry' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(choices, { target: { value: String(replacement) } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Retry' }));
    await within(sheet).findByText('No unsaved attempts.');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Event' }), { target: { value: '222' } });
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Event' }) as HTMLSelectElement).value).toBe(
        '222',
      ),
    );

    expect(await db.solves.toArray()).toMatchObject([{ session_id: replacement, time_ms: 12_340 }]);
  });

  it('retains failed attempts across tab changes and retries once', async () => {
    const { db, start, stop } = await setup();
    const add = vi.spyOn(db.solves, 'add').mockRejectedValue(new Error('full'));
    start();
    stop(12_340);
    fireEvent.click(await screen.findByRole('button', { name: 'Recover 1 unsaved attempt' }));
    await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(screen.getByRole('button', { name: 'Change tab' }));
    add.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Change tab' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recover 1 unsaved attempt' }));
    const retry = await screen.findByRole('button', { name: 'Retry' });
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(async () => expect(await db.solves.count()).toBe(1));
    expect(await db.solves.toArray()).toMatchObject([{ time_ms: 12_340 }]);
  });

  it('keeps a delayed save in its captured context and leaves a newer result showing', async () => {
    const { db, start, stop } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementationOnce(((...args: unknown[]) =>
      gate.then(() => Reflect.apply(transaction, db, args))) as typeof db.transaction);
    start();
    const originalScramble = screen.getByRole('region', { name: 'Scramble' }).textContent;
    fireEvent.click(screen.getByRole('button', { name: 'New scramble' }));
    stop(12_340);
    fireEvent.change(screen.getByRole('combobox', { name: 'Event' }), { target: { value: '222' } });
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Event' }) as HTMLSelectElement).value).toBe(
        '222',
      ),
    );
    start();
    stop(3_000);
    await screen.findByText('3.00, saved.');
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(async () => expect(await db.solves.count()).toBe(2));
    expect(screen.getByText('3.00, saved.')).toBeDefined();
    expect((screen.getByRole('combobox', { name: 'Event' }) as HTMLSelectElement).value).toBe(
      '222',
    );
    const earlier = (await db.solves.toArray()).find((solve) => solve.time_ms === 12_340);
    expect(earlier).toBeDefined();
    expect(originalScramble).toContain(earlier?.scramble);
    expect((await db.sessions.get(earlier?.session_id as number))?.event_id).toBe('333');
  });

  it('cancels without saving', async () => {
    const { db, start } = await setup();
    start();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(await db.solves.count()).toBe(0);
    expect(screen.queryByText(/saved\./)).toBeNull();
  });
});
