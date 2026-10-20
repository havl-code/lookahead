import { describe, expect, it } from 'vitest';
import { eventName } from './events.ts';

describe('events', () => {
  it('names an event, or falls back to its ID', () => {
    expect([eventName('333oh'), eventName('magic'), eventName('constructor')]).toEqual([
      '3x3x3 One-Handed',
      'magic',
      'constructor',
    ]);
  });
});
