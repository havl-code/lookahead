import { describe, expect, it } from 'vitest';
import python from '../../../speedcube/events.py?raw';
import { eventName, events } from './events.ts';

describe('events', () => {
  it("lists the same events as the desktop app's speedcube/events.py", () => {
    const listed = [...python.matchAll(/^\s+'([^']+)': '([^']+)',$/gm)].map((m) => [m[1], m[2]]);
    expect(listed).toEqual(Object.entries(events));
  });

  it('names an event, or falls back to its ID', () => {
    expect([eventName('333oh'), eventName('magic'), eventName('constructor')]).toEqual([
      '3x3x3 One-Handed',
      'magic',
      'constructor',
    ]);
  });
});
