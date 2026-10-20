import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ClockEvent,
  type ClockState,
  type Finished,
  inspection,
  isReady,
  step,
} from './clock.ts';

interface Handlers {
  /** Whether the next attempt starts with inspection. */
  readonly inspect: () => boolean;
  readonly onFinish: (finished: Finished) => void;
  /** The hold has lasted long enough that letting go will start the solve. */
  readonly onReady?: () => void;
  /** A judge's call during inspection, at 8 and 12 seconds. */
  readonly onCall?: (seconds: number) => void;
}

/**
 * Runs the timer's states (clock.ts) against the device's steady clock. While an attempt is under
 * way it redraws every frame, which also checks the hold, the inspection calls and limits, and the
 * two hour limit. performance.now() can't jump when the device's clock changes mid-solve.
 */
export function useClock(handlers: Handlers) {
  const [state, setState] = useState<ClockState>({ phase: 'idle' });
  const [now, setNow] = useState(() => performance.now());
  const current = useRef(state);
  const latest = useRef(handlers);
  latest.current = handlers;
  const callsMade = useRef(new Set<number>());
  const wasReady = useRef(false);

  const apply = useCallback((event: ClockEvent) => {
    const before = current.current;
    const { state: after, finished } = step(before, event);
    if (after.phase === 'inspecting' && before.phase !== 'inspecting')
      callsMade.current = new Set();
    if (after.phase !== before.phase || event.type !== 'tick') wasReady.current = false;
    current.current = after;
    setState(after);
    if (finished) latest.current.onFinish(finished);
  }, []);

  useEffect(() => {
    if (state.phase === 'idle') return;
    let frame = requestAnimationFrame(function loop() {
      const at = performance.now();
      apply({ type: 'tick', at });
      const ticked = current.current;
      if (ticked.phase === 'inspecting') {
        for (const call of inspection.callsAtMs) {
          if (at - ticked.since >= call && !callsMade.current.has(call)) {
            callsMade.current.add(call);
            latest.current.onCall?.(call / 1000);
          }
        }
      }
      const ready = isReady(ticked, at);
      if (ready && !wasReady.current) latest.current.onReady?.();
      wasReady.current = ready;
      setNow(at);
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [state.phase, apply]);

  const press = useCallback(() => {
    const at = performance.now();
    setNow(at);
    apply({ type: 'press', at, inspect: latest.current.inspect() });
  }, [apply]);
  const release = useCallback(() => apply({ type: 'release', at: performance.now() }), [apply]);
  const cancel = useCallback(() => apply({ type: 'cancel' }), [apply]);

  return { state, now, press, release, cancel };
}
