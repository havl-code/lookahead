import { describe, expect, it } from 'vitest';
import { count, formatClock, formatResult } from './format.ts';

describe('formatClock', () => {
  it.each([
    [9.5, '9.50'],
    [12.34, '12.34'],
    [59.99, '59.99'],
    [60, '1:00.00'],
    [83.45, '1:23.45'],
    [599.99, '9:59.99'],
    [600, '10:00'],
    [612, '10:12'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
  ])('writes %s seconds as %s', (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });

  it('shows a dash when there is no result', () => {
    expect(formatResult(null)).toBe('-');
  });
});

describe('count', () => {
  it('picks the word and groups thousands', () => {
    expect([count(1, 'solve', 'solves'), count(12345, 'solve', 'solves')]).toEqual([
      '1 solve',
      '12,345 solves',
    ]);
  });
});
