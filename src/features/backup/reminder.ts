const dayMs = 86_400_000;

/** How many unbacked solves, or how many days since the last backup, make one due. */
export const reminderThresholds = { solves: 100, days: 7 } as const;

/**
 * A backup is due when there are solves it would miss, and either enough have built up, or the
 * last backup (or, with none yet, the first of those solves) is a week old.
 */
export function backupDue(
  status: {
    readonly lastBackupAt: number | null;
    readonly count: number;
    readonly since: string | null;
  },
  now: number,
): boolean {
  if (status.count === 0) return false;
  if (status.count >= reminderThresholds.solves) return true;
  const since = status.lastBackupAt ?? (status.since ? Date.parse(status.since) : now);
  return now - since >= reminderThresholds.days * dayMs;
}
