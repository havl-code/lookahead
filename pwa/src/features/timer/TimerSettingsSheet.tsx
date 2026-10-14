import { useEffect, useId, useState } from 'react';
import { Sheet } from '../../app/Sheet.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { type TimerSettings, updateTimerSettings } from '../../db/timerSettings.ts';

export function TimerSettingsSheet({
  open,
  onClose,
  settings,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly settings: TimerSettings;
}) {
  const db = useDb();
  const callsId = useId();
  // Shown straight away, then saved, so a switch flips the moment it's tapped.
  const [shown, setShown] = useState(settings);
  useEffect(() => setShown(settings), [settings]);
  const change = (changes: Partial<TimerSettings>) => {
    setShown((current) => ({ ...current, ...changes }));
    void updateTimerSettings(db, changes);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Timer settings">
      <div className="space-y-4">
        <Switch
          label="WCA inspection (15 seconds)"
          checked={shown.inspectionEnabled}
          onChange={(inspectionEnabled) => change({ inspectionEnabled })}
        />
        <div className="flex min-h-11 items-center justify-between gap-3">
          <label htmlFor={callsId}>Sound at 8 and 12 seconds</label>
          <select
            id={callsId}
            value={shown.inspectionCalls}
            onChange={(event) =>
              change({ inspectionCalls: event.target.value as TimerSettings['inspectionCalls'] })
            }
            className="min-h-11 rounded-lg border border-control bg-surface px-3"
          >
            <option value="off">Off</option>
            <option value="beep">Beep</option>
            <option value="voice">Voice</option>
          </select>
        </div>
        <p className="text-muted text-sm">
          Starting after 15 seconds of inspection is a +2, and after 17 seconds a DNF, as in WCA
          competitions. The calls at 8 and 12 seconds always show on screen. The blindfolded events
          have no inspection, so memorisation is part of the time.
        </p>
        <Switch
          label="Hide the time while solving"
          checked={shown.hideTimer}
          onChange={(hideTimer) => change({ hideTimer })}
        />
        <Switch
          label="Hide stats"
          checked={shown.hideStats}
          onChange={(hideStats) => change({ hideStats })}
        />
        <p className="text-muted text-sm">
          These settings travel with your backups, so they're the same in the desktop app.
        </p>
      </div>
    </Sheet>
  );
}

/** An on/off setting that a screen reader announces as a switch. */
function Switch({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      {label}
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-6 shrink-0 accent-accent-ink"
      />
    </label>
  );
}
