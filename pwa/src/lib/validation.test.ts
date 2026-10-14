import { describe, expect, it } from 'vitest';
import { isoDate, solveTimeMs, text, wcaId } from './validation.ts';

const value = <T>(checked: { ok: boolean; value?: T; error?: string }) =>
  checked.ok ? checked.value : checked.error;

describe('solveTimeMs', () => {
  it.each([
    ['12.34', 12_340],
    [' 9.876 ', 9_876],
    ['12,5', 12_500],
    ['.5', 500],
    ['1:23.45', 83_450],
    ['1:02:03', 3_723_000],
    ['59', 59_000],
  ])('reads %s', (typed, ms) => {
    expect(value(solveTimeMs(typed))).toBe(ms);
  });

  it.each([
    ['', 'A time is required.'],
    ['abc', 'Write the time in seconds, such as 12.34, or as 1:23.45.'],
    ['1:2:3:4', 'Write the time in seconds, such as 12.34, or as 1:23.45.'],
    ['-3', 'Write the time in seconds, such as 12.34, or as 1:23.45.'],
    ['1:60', 'Minutes and seconds go up to 59, such as 1:59.99.'],
    ['1:60:00', 'Minutes and seconds go up to 59, such as 1:59.99.'],
    ['0', 'A time must be more than 0 seconds.'],
    ['2:00:01', 'A solve can be at most 2 hours long.'],
  ])('refuses %j', (typed, error) => {
    expect(value(solveTimeMs(typed))).toBe(error);
  });

  it('lets a DNF have no time, as a solve that never started', () => {
    expect(value(solveTimeMs('', true))).toBe(0);
    expect(value(solveTimeMs('0', true))).toBe(0);
  });

  it('allows exactly 2 hours, the same limit as the desktop app', () => {
    expect(value(solveTimeMs('2:00:00'))).toBe(7_200_000);
  });
});

describe('text, isoDate, and wcaId', () => {
  it('trims text and holds it to its limit', () => {
    expect(value(text('  hi  ', 'Notes', 5))).toBe('hi');
    expect(value(text('toolong', 'Notes', 5))).toBe('Notes can be at most 5 characters.');
    expect(value(text(' ', 'The cube type', 5, true))).toBe('The cube type is required.');
  });

  it('takes real dates, and no future ones when told today', () => {
    expect(value(isoDate('2026-10-14', 'Date', { today: '2026-10-14' }))).toBe('2026-10-14');
    expect(value(isoDate('', 'Date'))).toBeNull();
    expect(value(isoDate('', 'Date', { required: true }))).toBe('Date is required.');
    expect(value(isoDate('2026-02-30', 'Date'))).toBe('Date is not a real date.');
    expect(value(isoDate('14/10/2026', 'Date'))).toBe('Date must be a date written as YYYY-MM-DD.');
    expect(value(isoDate('2026-10-15', 'Date', { today: '2026-10-14' }))).toBe(
      "Date can't be in the future.",
    );
  });

  it('puts a WCA ID in capitals and checks its shape', () => {
    expect(value(wcaId(' 2003poch01 '))).toBe('2003POCH01');
    expect(value(wcaId('2003POCH1'))).toBe(
      'A WCA ID is four digits, four letters, and two digits, such as 2003POCH01.',
    );
    expect(value(wcaId(''))).toBe('Type your WCA ID.');
  });
});
