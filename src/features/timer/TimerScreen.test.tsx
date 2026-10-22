import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DbProvider } from '../../db/DbProvider.tsx';
import { startTimerSession } from '../../db/solves.ts';
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
