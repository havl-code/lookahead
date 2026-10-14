import { describe, expect, it } from 'vitest';
import {
  type ClockEvent,
  type ClockState,
  inspectionPenalty,
  isReady,
  maxSolveMs,
  step,
} from './clock.ts';

/** Runs events from idle, and returns the last state and every attempt that finished. */
function run(events: readonly ClockEvent[]) {
  let state: ClockState = { phase: 'idle' };
  const finished = [];
  for (const event of events) {
    const next = step(state, event);
    state = next.state;
    if (next.finished) finished.push(next.finished);
  }
  return { state, finished };
}

const press = (at: number, inspect = false): ClockEvent => ({ type: 'press', at, inspect });
const release = (at: number): ClockEvent => ({ type: 'release', at });
const tick = (at: number): ClockEvent => ({ type: 'tick', at });

describe('without inspection', () => {
  it('starts when let go after a 300 ms hold, and stops on the next press', () => {
    expect(run([press(0), release(300), press(12_645.9)]).finished).toEqual([
      { timeMs: 12_345, penalty: 'OK' },
    ]);
  });

  it('does nothing when let go too soon', () => {
    expect(run([press(0), release(299)]).state).toEqual({ phase: 'idle' });
  });

  it('is ready only once the hold has lasted 300 ms', () => {
    const { state } = run([press(1000)]);
    expect([isReady(state, 1299), isReady(state, 1300)]).toEqual([false, true]);
  });

  it('stops by itself at 2 hours, as a DNF', () => {
    expect(run([press(0), release(300), tick(300 + maxSolveMs)]).finished).toEqual([
      { timeMs: maxSolveMs, penalty: 'DNF' },
    ]);
  });
});

describe('with inspection', () => {
  it('inspects on the first press, then starts after a hold', () => {
    const { state, finished } = run([
      press(0, true),
      release(100),
      press(5000),
      release(5300),
      press(15_300),
    ]);
    expect(finished).toEqual([{ timeMs: 10_000, penalty: 'OK' }]);
    expect(state).toEqual({ phase: 'idle' });
  });

  it('gives a +2 for starting at 15 seconds or later (A4d1)', () => {
    expect(
      run([press(0, true), release(10), press(14_700), release(15_000), press(25_000)]).finished,
    ).toEqual([{ timeMs: 10_000, penalty: '+2' }]);
  });

  it('is a DNF with no time at 17 seconds (A4d2)', () => {
    expect(run([press(0, true), release(10), tick(16_999)]).finished).toEqual([]);
    expect(run([press(0, true), release(10), tick(17_000)]).finished).toEqual([
      { timeMs: 0, penalty: 'DNF' },
    ]);
  });

  it('keeps inspecting when a hold is let go too soon', () => {
    expect(run([press(0, true), release(10), press(3000), release(3100)]).state).toEqual({
      phase: 'inspecting',
      since: 0,
      holdingSince: null,
    });
  });

  it.each([
    [14_999, 'OK'],
    [15_000, '+2'],
    [16_999, '+2'],
    [17_000, 'DNF'],
  ] as const)('after %s ms of inspection, starting is %s', (elapsed, penalty) => {
    expect(inspectionPenalty(elapsed)).toBe(penalty);
  });
});

describe('cancelling', () => {
  it.each([
    ['a hold', [press(0)]],
    ['inspection', [press(0, true)]],
    ['a running solve', [press(0), release(300)]],
  ])('calls off %s without saving anything', (_, events) => {
    expect(run([...events, { type: 'cancel' }])).toEqual({
      state: { phase: 'idle' },
      finished: [],
    });
  });
});
