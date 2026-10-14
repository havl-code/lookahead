import { describe, expect, it } from 'vitest';
import { backupDue } from './reminder.ts';

const now = Date.parse('2026-10-14T09:00:00Z');
const daysAgo = (days: number) => now - days * 86_400_000;

describe('backupDue', () => {
  it.each([
    ['nothing to back up', { lastBackupAt: daysAgo(30), count: 0, since: null }, false],
    [
      'a few solves since a recent backup',
      { lastBackupAt: daysAgo(2), count: 20, since: null },
      false,
    ],
    [
      '100 solves since the last backup',
      { lastBackupAt: daysAgo(1), count: 100, since: null },
      true,
    ],
    ['a week since the last backup', { lastBackupAt: daysAgo(7), count: 1, since: null }, true],
    [
      'no backup yet, first solve today',
      { lastBackupAt: null, count: 5, since: new Date(daysAgo(0)).toISOString() },
      false,
    ],
    [
      'no backup yet, first solve a week ago',
      { lastBackupAt: null, count: 5, since: new Date(daysAgo(8)).toISOString() },
      true,
    ],
  ])('%s: %s', (_, status, due) => {
    expect(backupDue(status, now)).toBe(due);
  });
});
