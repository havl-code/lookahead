import type { Penalty } from './clock.ts';

export type TimerShortcut = Penalty | 'delete';

type Key = Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>;

const penaltyKeys: Readonly<Record<string, Penalty>> = {
  Digit1: 'OK',
  Digit2: '+2',
  Digit3: 'DNF',
  Numpad1: 'OK',
  Numpad2: '+2',
  Numpad3: 'DNF',
};

/**
 * The shortcuts for the latest solve, as in csTimer and the desktop app: Ctrl+1 to Ctrl+3 make it
 * OK, +2, or DNF, and Ctrl+Z deletes it. Many browsers keep Ctrl and a number for switching tabs,
 * so Alt works with the numbers too (Option on a Mac, and Cmd+Z there).
 */
export function timerShortcut(event: Key): TimerShortcut | null {
  if (event.shiftKey) return null;
  if (event.ctrlKey || event.altKey) {
    const penalty = penaltyKeys[event.code];
    if (penalty) return penalty;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'z')
    return 'delete';
  return null;
}
