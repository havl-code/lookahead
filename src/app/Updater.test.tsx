import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbProvider, useTimerSaving } from '../db/DbProvider.tsx';
import type { LookaheadDb } from '../db/database.ts';
import type { TimerSaving } from '../db/timerSaving.ts';
import { createTestDb } from '../test/db.ts';
import { Updater } from './Updater.tsx';
import { holdUpdates } from './updates.ts';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  updateServiceWorker: vi.fn(async (_reload?: boolean) => {}),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

let saving: TimerSaving;
let db: LookaheadDb;

function Saving() {
  saving = useTimerSaving();
  return null;
}

/** The updater inside a fresh database's provider, with its saving module in `saving`. */
function renderUpdater() {
  db = createTestDb();
  return render(
    <DbProvider db={db}>
      <Saving />
      <Updater />
    </DbProvider>,
  );
}

beforeEach(() => {
  sw.needRefresh = true;
  sw.updateServiceWorker.mockClear();
  sessionStorage.clear();
});

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

describe('Updater', () => {
  it('installs a waiting version when the app is hidden', () => {
    renderUpdater();
    expect(screen.getByRole('status').textContent).toContain('installs next time you leave');

    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('waits while work is in progress, then installs on the next hide', () => {
    renderUpdater();
    const release = holdUpdates();
    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();

    release();
    act(() => setVisibility('visible'));
    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).toHaveBeenCalledOnce();
  });

  it('installs straight away from Update now, and says so after the reload', () => {
    const { unmount } = renderUpdater();
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
    unmount();

    sw.needRefresh = false;
    renderUpdater();
    expect(screen.getByRole('status').textContent).toBe('Lookahead has been updated.');
  });

  it('does nothing when there is no new version', () => {
    sw.needRefresh = false;
    renderUpdater();
    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('disables Update now and waits on hiding while a timed attempt is unsaved', async () => {
    renderUpdater();
    const add = vi.spyOn(db.solves, 'add').mockRejectedValue(new Error('full'));
    const id = saving.capture({ eventId: '333', scramble: '', sessionId: null });
    await act(() => saving.finish(id, { timeMs: 9_000, penalty: 'OK' }));
    const update = screen.getByRole('button', { name: 'Update now' });
    expect(update).toHaveProperty('disabled', true);
    fireEvent.click(update);
    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();

    add.mockRestore();
    act(() => setVisibility('visible'));
    await act(() => saving.retry(id));
    expect(update).toHaveProperty('disabled', false);
    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).toHaveBeenCalledOnce();
  });

  it('disables Update now while a timed attempt is still saving', async () => {
    renderUpdater();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementationOnce(((...args: unknown[]) =>
      gate.then(() => Reflect.apply(transaction, db, args))) as typeof db.transaction);
    const id = saving.capture({ eventId: '333', scramble: '', sessionId: null });
    let finishing!: Promise<void>;
    act(() => {
      finishing = saving.finish(id, { timeMs: 9_000, penalty: 'OK' });
    });
    const update = screen.getByRole('button', { name: 'Update now' });
    expect(update).toHaveProperty('disabled', true);
    act(() => setVisibility('hidden'));
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();

    act(() => setVisibility('visible'));
    await act(async () => {
      release();
      await finishing;
    });
    expect(update).toHaveProperty('disabled', false);
    fireEvent.click(update);
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
