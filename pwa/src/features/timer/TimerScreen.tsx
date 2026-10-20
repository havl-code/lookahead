import { type PointerEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Toast } from '../../app/Toast.tsx';
import { useHoldUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { useMeta, useTimerSettings, useTodaysSolves } from '../../db/hooks.ts';
import { getMeta, setMeta } from '../../db/meta.ts';
import type { Solve } from '../../db/schema.ts';
import {
  deleteSolve,
  onlyDnf,
  restoreSolve,
  saveTimedSolve,
  setPenalty,
  setSolveNotes,
} from '../../db/solves.ts';
import { defaultTimerSettings } from '../../db/timerSettings.ts';
import { eventName } from '../../lib/events.ts';
import { count, formatClock, formatResult } from '../../lib/format.ts';
import { averageSeconds, singleSeconds } from '../../lib/stats.ts';
import { requestPersistence } from '../../lib/storage.ts';
import { localDate } from '../../lib/time.ts';
import { BackupReminder } from '../backup/BackupReminder.tsx';
import {
  type ClockState,
  type Finished,
  inspection,
  inspectionPenalty,
  isReady,
  longestLimitMs,
  type Penalty,
} from './clock.ts';
import { SolveSheet } from './SolveSheet.tsx';
import {
  generateScramble,
  hasTimer,
  isBlindfolded,
  isLongScramble,
  timerEvents,
} from './scramble.ts';
import { type TimerShortcut, timerShortcut } from './shortcuts.ts';
import { beep, speak, unlockSound } from './sounds.ts';
import { TimerSettingsSheet } from './TimerSettingsSheet.tsx';
import { useClock } from './useClock.ts';
import { useWakeLock } from './useWakeLock.ts';

const recentCount = 12;

/** A solve's result as the timer shows it: 12.34, 14.34 (+2), or DNF. */
export function resultText(solve: Pick<Solve, 'time_ms' | 'penalty' | 'dnf'>): string {
  if (solve.dnf) return 'DNF';
  if (solve.penalty === '+2')
    return `${formatClock(singleSeconds(solve.time_ms + 2000) ?? 0)} (+2)`;
  return formatClock(singleSeconds(solve.time_ms) ?? 0);
}

/** A solve's penalty, as its buttons show it: a DNF however it's stored, then +2, then OK. */
function penaltyOf(solve: Pick<Solve, 'penalty' | 'dnf'>): Penalty {
  return solve.dnf ? 'DNF' : solve.penalty === '+2' ? '+2' : 'OK';
}

export function TimerScreen() {
  const db = useDb();
  const storedEvent = useMeta('timerEvent');
  const eventId = storedEvent && hasTimer(storedEvent) ? storedEvent : '333';
  const settings = useTimerSettings() ?? defaultTimerSettings;
  const [today, setToday] = useState(localDate);
  const todays = useTodaysSolves(eventId, today, recentCount);
  const [scramble, setScramble] = useState(() => generateScramble(eventId));
  const [call, setCall] = useState<string | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [toast, setToast] = useState<{
    message: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openSolve, setOpenSolve] = useState<number | null>(null);
  // A solve being saved ('saving'), or the id of one saved but not yet in the list.
  const pending = useRef<'saving' | number | null>(null);
  const runShortcut = useRef<(action: TimerShortcut) => void>(() => {});
  const scrambleFor = useRef({ eventId, scramble });
  scrambleFor.current = { eventId, scramble };
  useWakeLock();

  const save = useCallback(
    async (finished: Finished, attempt: { eventId: string; scramble: string }) => {
      pending.current = 'saving';
      try {
        const { solveId } = await saveTimedSolve(db, { ...attempt, ...finished });
        pending.current = solveId;
        setShown(solveId);
        setAnnouncement(
          `${resultText({ time_ms: finished.timeMs, penalty: finished.penalty, dnf: finished.penalty === 'DNF' })}, saved.`,
        );
        // Now there's something worth keeping, ask the browser to keep it, once.
        if ((await getMeta(db, 'persistResult')) === null)
          await setMeta(db, 'persistResult', await requestPersistence());
      } catch {
        if (pending.current === 'saving') pending.current = null;
        setToast({
          message: "Couldn't save that solve. This device may be out of space.",
          action: { label: 'Retry', onClick: () => void save(finished, attempt) },
        });
      }
    },
    [db],
  );

  const clock = useClock({
    inspect: () => settings.inspectionEnabled && !isBlindfolded(scrambleFor.current.eventId),
    onFinish: (finished) => {
      setCall(null);
      const attempt = scrambleFor.current;
      setScramble(generateScramble(attempt.eventId));
      setToday(localDate());
      void save(finished, attempt);
    },
    onReady: () => navigator.vibrate?.(15),
    onCall: (seconds) => {
      const text = `${seconds} seconds`;
      setCall(text);
      if (settings.inspectionCalls === 'voice' && speak(text)) return;
      if (settings.inspectionCalls !== 'off') beep();
    },
  });
  const active = clock.state.phase !== 'idle';
  useHoldUpdates(active);

  // The space bar works as the touch pad does, even with a button focused (Enter still presses
  // it), and Escape calls off an attempt in progress. The shortcuts (shortcuts.ts) change or
  // delete the latest solve. All of them leave typing and open sheets alone.
  const { press, release, cancel } = clock;
  useEffect(() => {
    const ownsKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      return !(
        document.querySelector('dialog[open]') ||
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      );
    };
    const down = (event: KeyboardEvent) => {
      const action = timerShortcut(event);
      if (action && ownsKeys(event)) {
        event.preventDefault();
        runShortcut.current(action);
      } else if (event.key === 'Escape' && clock.state.phase !== 'idle') {
        event.preventDefault();
        cancel();
        setCall(null);
      } else if (event.key === ' ' && (ownsKeys(event) || clock.state.phase !== 'idle')) {
        event.preventDefault();
        if (!event.repeat) {
          unlockSound();
          press();
        }
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === ' ' && (ownsKeys(event) || clock.state.phase !== 'idle')) {
        event.preventDefault();
        release();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [press, release, cancel, clock.state.phase]);

  // Touch: hold until the time turns green, let go to start, and touch anywhere to stop. Only
  // fingers and pens count, so a mouse click can't start anything by surprise.
  const pointer = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' || !event.isPrimary) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Nothing to capture; the hold still works.
      }
      unlockSound();
      press();
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' || !event.isPrimary) return;
      release();
    },
    // The system took the touch back (for a gesture, say): call off a hold, but not a solve.
    onPointerCancel: () => {
      if (clock.state.phase === 'holding') cancel();
      else if (clock.state.phase === 'inspecting') release();
    },
    // A long press would otherwise open the browser's menu.
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  };

  function chooseEvent(next: string) {
    if (typeof pending.current === 'number') pending.current = null;
    void setMeta(db, 'timerEvent', next);
    setScramble(generateScramble(next));
    setShown(null);
  }

  const solves = todays?.solves ?? [];
  const shownSolve = solves.find((solve) => solve.id === shown);

  async function changePenalty(solve: Solve, penalty: Penalty) {
    await setPenalty(db, solve.id, penalty);
  }

  async function remove(solve: Solve) {
    const deleted = await deleteSolve(db, solve.id);
    if (shown === solve.id) setShown(null);
    if (deleted) {
      setToast({
        message: `Solve ${deleted.solve_number} deleted.`,
        action: {
          label: 'Undo',
          onClick: () => {
            setToast(null);
            void restoreSolve(db, deleted);
          },
        },
      });
    }
  }

  // The shortcuts wait while a solve is being timed or saved, and until it shows in the list, so
  // they can't change the wrong one.
  const latest = solves[0];
  if (typeof pending.current === 'number' && latest?.id === pending.current) pending.current = null;
  runShortcut.current = (action) => {
    if (active || pending.current !== null || !latest) return;
    if (action === 'delete') void remove(latest);
    else if (penaltyOf(latest) !== action && !(onlyDnf(latest) && action !== 'DNF'))
      void changePenalty(latest, action);
  };

  return (
    <>
      <h1 className="sr-only">Timer</h1>
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-3">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Event</span>
            <select
              value={eventId}
              onChange={(event) => chooseEvent(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-control bg-raised px-3 font-semibold text-lg"
            >
              {timerEvents.map((id) => (
                <option key={id} value={id}>
                  {eventName(id)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="min-h-11 rounded-lg border border-control bg-raised px-4 font-medium"
          >
            Settings
          </button>
        </div>

        <BackupReminder />

        <section aria-label="Scramble">
          <p
            className={`whitespace-pre-line break-words font-medium leading-relaxed tracking-wide ${
              isLongScramble(eventId) ? 'text-base' : 'text-lg'
            }`}
          >
            {scramble}
          </p>
          <div className="-ml-3 mt-1 flex gap-1">
            <button
              type="button"
              onClick={() => setScramble(generateScramble(eventId))}
              className="min-h-11 rounded-lg px-3 font-medium text-accent-ink"
            >
              New scramble
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(scramble).catch(() => {})}
              className="min-h-11 rounded-lg px-3 font-medium text-accent-ink"
            >
              Copy
            </button>
          </div>
        </section>

        <div
          {...pointer}
          role="presentation"
          className="touch-pad flex min-h-40 flex-1 flex-col items-center justify-center rounded-2xl"
        >
          <Readout
            state={clock.state}
            now={clock.now}
            hideTimer={settings.hideTimer}
            shown={shownSolve}
          />
          {/* How to start, until today's first solve. */}
          {todays === null && !shownSolve && (
            <p className="mt-3 text-center text-muted text-sm">
              {isBlindfolded(eventId) || !settings.inspectionEnabled
                ? 'Hold the time until it turns green, then let go to start.'
                : 'Touch the time to inspect, then hold until it turns green and let go to start.'}
            </p>
          )}
        </div>

        {shownSolve && (
          <fieldset className="flex flex-wrap items-center justify-center gap-2">
            <legend className="sr-only">Solve {shownSolve.solve_number}</legend>
            <PenaltyButtons
              solve={shownSolve}
              onChange={(penalty) => void changePenalty(shownSolve, penalty)}
            />
            <button
              type="button"
              onClick={() => void remove(shownSolve)}
              className="min-h-11 rounded-lg border border-control px-4 font-medium text-danger-ink"
            >
              Delete
            </button>
          </fieldset>
        )}

        {!settings.hideStats && <SessionStats todays={todays} onOpen={setOpenSolve} />}
      </div>

      {active && (
        <div
          {...pointer}
          role="presentation"
          className="touch-pad focus-in fixed inset-0 z-40 flex flex-col items-center justify-center bg-surface px-4"
        >
          <Readout state={clock.state} now={clock.now} hideTimer={settings.hideTimer} large />
          <p className="mt-4 min-h-7 text-center font-medium text-lg text-muted">{call}</p>
          {clock.state.phase === 'running' && clock.now - clock.state.since >= longestLimitMs && (
            <p className="mt-2 max-w-sm text-center text-muted text-sm">
              Past 60 minutes, the WCA's longest time limit. The timer keeps going until 2 hours.
            </p>
          )}
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
      <TimerSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
      />
      <SolveSheet
        solve={solves.find((solve) => solve.id === openSolve) ?? null}
        onClose={() => setOpenSolve(null)}
        onPenalty={(solve, penalty) => void changePenalty(solve, penalty)}
        onNotes={(solve, notes) => setSolveNotes(db, solve.id, notes)}
        onDelete={(solve) => {
          setOpenSolve(null);
          void remove(solve);
        }}
      />
      {toast && (
        <Toast message={toast.message} action={toast.action} onDismiss={() => setToast(null)} />
      )}
    </>
  );
}

/** The time itself: orange while inspecting, red while holding, green when ready, as on a Stackmat. */
function Readout({
  state,
  now,
  hideTimer,
  shown,
  large = false,
}: {
  readonly state: ClockState;
  readonly now: number;
  readonly hideTimer: boolean;
  readonly shown?: Solve | undefined;
  readonly large?: boolean;
}) {
  let text = '0.00';
  let colour = 'text-ink';
  let plusTwo = false;
  if (state.phase === 'inspecting') {
    const elapsed = now - state.since;
    const penalty = inspectionPenalty(elapsed);
    text = hideTimer
      ? 'inspect'
      : penalty === '+2'
        ? '+2'
        : String(Math.ceil((inspection.plusTwoAtMs - elapsed) / 1000));
    colour =
      state.holdingSince !== null
        ? isReady(state, now)
          ? 'text-good-ink'
          : 'text-danger-ink'
        : penalty === '+2'
          ? 'text-warning-ink'
          : 'text-accent-ink';
  } else if (state.phase === 'holding') {
    colour = isReady(state, now) ? 'text-good-ink' : 'text-danger-ink';
  } else if (state.phase === 'running') {
    text = hideTimer ? 'solve' : formatClock(singleSeconds(Math.floor(now - state.since)) ?? 0);
  } else if (shown) {
    text = shown.dnf
      ? 'DNF'
      : formatClock(singleSeconds(shown.time_ms + (shown.penalty === '+2' ? 2000 : 0)) ?? 0);
    plusTwo = !shown.dnf && shown.penalty === '+2';
  }

  return (
    <p
      className={`font-semibold tabular-nums leading-none tracking-tight ${colour} ${
        large ? 'text-[clamp(5rem,26vw,13rem)]' : 'text-[clamp(4rem,20vw,8rem)]'
      }`}
    >
      {text}
      {plusTwo && <span className="ml-2 align-top text-[0.3em] text-warning-ink">+2</span>}
    </p>
  );
}

export function PenaltyButtons({
  solve,
  onChange,
}: {
  readonly solve: Solve;
  readonly onChange: (penalty: Penalty) => void;
}) {
  const current = penaltyOf(solve);
  // A solve that never started has no time, so it can only be a DNF.
  const fixed = onlyDnf(solve);
  return (
    <div className="flex overflow-hidden rounded-lg border border-control">
      {(['OK', '+2', 'DNF'] as const).map((penalty) => (
        <button
          key={penalty}
          type="button"
          aria-pressed={current === penalty}
          disabled={fixed && penalty !== 'DNF'}
          onClick={() => current !== penalty && onChange(penalty)}
          className={`min-h-11 min-w-14 px-3 font-semibold disabled:text-muted disabled:opacity-60 ${
            current === penalty ? 'bg-accent text-on-accent' : 'bg-raised'
          }`}
        >
          {penalty}
        </button>
      ))}
    </div>
  );
}

function SessionStats({
  todays,
  onOpen,
}: {
  readonly todays: ReturnType<typeof useTodaysSolves>;
  readonly onOpen: (solveId: number) => void;
}) {
  const headingId = useId();
  if (todays === undefined) return null;
  const session = todays?.session;
  const solveCount = session?.solve_count ?? 0;
  const average = (value: number | null | undefined, size: number) =>
    value == null && solveCount >= size ? 'DNF' : formatResult(averageSeconds(value ?? null));
  const stats: ReadonlyArray<readonly [string, string]> = [
    ['Solves', solveCount.toLocaleString('en-NZ')],
    ['Best', formatResult(singleSeconds(session?.best_single ?? null))],
    ['Ao5', average(session?.ao5, 5)],
    ['Ao12', average(session?.ao12, 12)],
    ['Mean', formatResult(averageSeconds(session?.session_mean ?? null))],
  ];

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="font-semibold">
        Today
      </h2>
      <dl className="grid grid-cols-5 gap-2 text-sm">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {todays && todays.solves.length > 0 ? (
        <ol aria-label="Latest solves" className="flex flex-wrap gap-2">
          {todays.solves.map((solve) => (
            <li key={solve.id}>
              <button
                type="button"
                onClick={() => onOpen(solve.id)}
                aria-label={`Solve ${solve.solve_number}: ${resultText(solve)}`}
                className="min-h-11 rounded-lg border border-line bg-raised px-3 tabular-nums"
              >
                {resultText(solve)}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted text-sm">
          No solves yet today. Your first one starts today's session.
        </p>
      )}
      {todays && solveCount > todays.solves.length && (
        <p className="text-muted text-sm">
          Showing your latest {todays.solves.length} of {count(solveCount, 'solve', 'solves')}. The
          Sessions tab has them all.
        </p>
      )}
    </section>
  );
}
