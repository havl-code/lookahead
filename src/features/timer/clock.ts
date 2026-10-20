/*
 * The timer's states, as a pure function of presses, releases, and the time, so it can be tested
 * without a screen or a clock. The screen feeds it events and draws whatever state comes back.
 *
 * WCA inspection (Regulations A3 and A4): the competitor has 15 seconds to inspect and start the
 * solve. Starting at 15.00 seconds or later but before 17.00 is a +2 (A4d1, which says exactly
 * 15.00 is a +2), and 17.00 or later is a DNF (A4d2). Inspection is timed until the timer starts
 * (A3b5). The judge calls "8 SECONDS" and "12 SECONDS" (A3b3 and A3b4).
 */

export const inspection = {
  plusTwoAtMs: 15_000,
  dnfAtMs: 17_000,
  callsAtMs: [8_000, 12_000],
} as const;
/** How long the time has to be held before letting go starts the solve. */
export const holdMs = 300;
/** The longest solve kept; the timer stops itself there and the attempt is a DNF (A1a4). */
export const maxSolveMs = 2 * 60 * 60 * 1000;
/** The WCA's longest time limit (for Multi-Blind), past which the timer says it's still going. */
export const longestLimitMs = 60 * 60 * 1000;

export type Penalty = 'OK' | '+2' | 'DNF';

/** The penalty for starting a solve after `elapsedMs` of inspection. */
export function inspectionPenalty(elapsedMs: number): Penalty {
  if (elapsedMs >= inspection.dnfAtMs) return 'DNF';
  if (elapsedMs >= inspection.plusTwoAtMs) return '+2';
  return 'OK';
}

export type ClockState =
  | { readonly phase: 'idle' }
  /** Inspecting; `holdingSince` is when a press began, if the time is being held. */
  | { readonly phase: 'inspecting'; readonly since: number; readonly holdingSince: number | null }
  /** Holding before a solve with no inspection. */
  | { readonly phase: 'holding'; readonly since: number }
  | { readonly phase: 'running'; readonly since: number; readonly penalty: Penalty };

/** A finished attempt, for the screen to save. A DNF from inspection or the time limit has 0 ms. */
export interface Finished {
  readonly timeMs: number;
  readonly penalty: Penalty;
}

export type ClockEvent =
  | { readonly type: 'press'; readonly at: number; readonly inspect: boolean }
  | { readonly type: 'release'; readonly at: number }
  | { readonly type: 'tick'; readonly at: number }
  | { readonly type: 'cancel' };

export interface Step {
  readonly state: ClockState;
  readonly finished?: Finished;
}

const idle: ClockState = { phase: 'idle' };

/** Whether a press has been held long enough that letting go starts the solve. */
export function isReady(state: ClockState, at: number): boolean {
  const since =
    state.phase === 'holding'
      ? state.since
      : state.phase === 'inspecting'
        ? state.holdingSince
        : null;
  return since !== null && at - since >= holdMs;
}

export function step(state: ClockState, event: ClockEvent): Step {
  if (event.type === 'cancel') return { state: idle };
  switch (state.phase) {
    case 'idle':
      if (event.type !== 'press') return { state };
      return {
        state: event.inspect
          ? { phase: 'inspecting', since: event.at, holdingSince: null }
          : { phase: 'holding', since: event.at },
      };
    case 'holding':
      if (event.type === 'release') {
        return {
          state: isReady(state, event.at)
            ? { phase: 'running', since: event.at, penalty: 'OK' }
            : idle,
        };
      }
      return { state };
    case 'inspecting': {
      // Seventeen seconds without starting: the attempt is a DNF, with no time (A4d2)
      if (inspectionPenalty(event.at - state.since) === 'DNF') {
        return { state: idle, finished: { timeMs: 0, penalty: 'DNF' } };
      }
      if (event.type === 'press') return { state: { ...state, holdingSince: event.at } };
      if (event.type === 'release') {
        if (!isReady(state, event.at)) return { state: { ...state, holdingSince: null } };
        // Starting the timer ends inspection (A3b5)
        return {
          state: {
            phase: 'running',
            since: event.at,
            penalty: inspectionPenalty(event.at - state.since),
          },
        };
      }
      return { state };
    }
    case 'running': {
      const elapsed = event.at - state.since;
      if (elapsed >= maxSolveMs)
        return { state: idle, finished: { timeMs: maxSolveMs, penalty: 'DNF' } };
      // Whole milliseconds, cut off rather than rounded, so the time saved can never show a
      // hundredth more than the one on screen
      if (event.type === 'press')
        return { state: idle, finished: { timeMs: Math.floor(elapsed), penalty: state.penalty } };
      return { state };
    }
  }
}
