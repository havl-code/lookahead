import type { LookaheadDb } from './database.ts';
import { withStorageErrors } from './errors.ts';

/**
 * The timer settings, kept as JSON in the settings row 'timer', as the desktop app keeps them, so
 * they travel with backups both ways.
 */
export interface TimerSettings {
  inspectionEnabled: boolean;
  /** A sound at 8 and 12 seconds of inspection. */
  inspectionCalls: 'off' | 'beep' | 'voice';
  hideTimer: boolean;
  hideStats: boolean;
}

export const defaultTimerSettings: Readonly<TimerSettings> = {
  inspectionEnabled: true,
  inspectionCalls: 'off',
  hideTimer: false,
  hideStats: false,
};

/** The stored settings, keeping only values of the right kind, over the defaults. */
export function parseTimerSettings(value: string | null | undefined): TimerSettings {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (parsed && typeof parsed === 'object') stored = parsed as Record<string, unknown>;
  } catch {
    // Unreadable settings fall back to the defaults.
  }
  const settings = { ...defaultTimerSettings };
  for (const key of ['inspectionEnabled', 'hideTimer', 'hideStats'] as const) {
    if (typeof stored[key] === 'boolean') settings[key] = stored[key];
  }
  if (
    stored.inspectionCalls === 'off' ||
    stored.inspectionCalls === 'beep' ||
    stored.inspectionCalls === 'voice'
  ) {
    settings.inspectionCalls = stored.inspectionCalls;
  }
  return settings;
}

export async function getTimerSettings(db: LookaheadDb): Promise<TimerSettings> {
  return parseTimerSettings((await db.settings.get('timer'))?.value);
}

export async function updateTimerSettings(
  db: LookaheadDb,
  changes: Partial<TimerSettings>,
): Promise<void> {
  await withStorageErrors(() =>
    db.transaction('rw', db.settings, async () => {
      const settings = { ...(await getTimerSettings(db)), ...changes };
      await db.settings.put({
        id: 'timer',
        wca_id: null,
        wca_name: null,
        value: JSON.stringify(settings),
      });
    }),
  );
}
