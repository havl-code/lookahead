import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DbProvider } from '../../db/DbProvider.tsx';
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
  it('retains failed attempts across tab changes and retries once', async () => {
    const { db, start, stop } = await setup();
    const add = vi.spyOn(db.solves, 'add').mockRejectedValue(new Error('full'));
    start();
    stop(12_340);
    await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(screen.getByRole('button', { name: 'Change tab' }));
    add.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Change tab' }));
    const retry = await screen.findByRole('button', { name: 'Retry' });
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
