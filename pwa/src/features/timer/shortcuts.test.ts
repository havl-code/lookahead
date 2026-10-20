import { describe, expect, it } from 'vitest';
import { timerShortcut } from './shortcuts.ts';

const key = (code: string, key: string, modifiers: Partial<Record<string, boolean>> = {}) => ({
  code,
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('timerShortcut', () => {
  it('makes the latest solve OK, +2, or DNF with Ctrl or Alt and 1 to 3, as the desktop does', () => {
    expect(timerShortcut(key('Digit1', '1', { ctrlKey: true }))).toBe('OK');
    expect(timerShortcut(key('Digit2', '2', { altKey: true }))).toBe('+2');
    // Option and a number types a symbol on a Mac, so the key's place counts, not its letter.
    expect(timerShortcut(key('Digit3', '£', { altKey: true }))).toBe('DNF');
    expect(timerShortcut(key('Numpad2', '2', { ctrlKey: true }))).toBe('+2');
  });

  it('deletes it with Ctrl+Z, or Cmd+Z on a Mac', () => {
    expect(timerShortcut(key('KeyZ', 'z', { ctrlKey: true }))).toBe('delete');
    expect(timerShortcut(key('KeyZ', 'z', { metaKey: true }))).toBe('delete');
  });

  it('leaves other keys alone, and anything with Shift', () => {
    expect(timerShortcut(key('Digit2', '2'))).toBeNull();
    expect(timerShortcut(key('Digit4', '4', { ctrlKey: true }))).toBeNull();
    expect(timerShortcut(key('Digit2', '@', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(timerShortcut(key('KeyZ', 'Z', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(timerShortcut(key('KeyZ', 'Ω', { altKey: true }))).toBeNull();
    expect(timerShortcut(key('KeyZ', 'z', { ctrlKey: true, altKey: true }))).toBeNull();
  });
});
