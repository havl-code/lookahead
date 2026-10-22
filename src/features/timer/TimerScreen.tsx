import { useLiveQuery } from 'dexie-react-hooks';
import { type PointerEvent, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { enterFullscreen, leaveFullscreen, useFullscreen } from '../../app/fullscreen.ts';
import { SettingsIcon } from '../../app/icons.tsx';
import { useHoldUpdates } from '../../app/updates.ts';
import { useDb, useSolveEditing, useTimerSaving } from '../../db/DbProvider.tsx';
import { useMeta, useTimerSession, useTimerSettings } from '../../db/hooks.ts';
import { setMeta } from '../../db/meta.ts';
import type { Solve } from '../../db/schema.ts';
import { onlyDnf } from '../../db/solves.ts';
import { defaultTimerSettings } from '../../db/timerSettings.ts';
import { eventName } from '../../lib/events.ts';
import { count, formatClock, formatResult } from '../../lib/format.ts';
import { averageSeconds, singleMark, singleSeconds } from '../../lib/stats.ts';
import { localDate } from '../../lib/time.ts';
import { BackupReminder } from '../backup/BackupReminder.tsx';
import { averageText, PenaltyButtons, resultText, timerAverages } from '../solves/presentation.tsx';
import { SolveEditToast } from '../solves/SolveEditToast.tsx';
import { AttemptRecovery } from './AttemptRecovery.tsx';
import {
  type ClockState,
  inspection,
  inspectionPenalty,
  isReady,
  longestLimitMs,
  type Penalty,
} from './clock.ts';
import { SessionMenu, sessionDay } from './SessionMenu.tsx';
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

// The width of the wide layout's Ao5 and Ao12 columns, room for 1:23.45 at the panel's text size.
const averageColumn = 'w-16 shrink-0 text-right';

export function TimerScreen() {
  const db = useDb();
  const editing = useSolveEditing();
  const saving = useTimerSaving();
  const attempts = useSyncExternalStore(saving.subscribe, saving.getAttempts, saving.getAttempts);
  useSyncExternalStore(editing.subscribe, editing.getRevision, editing.getRevision);
  useEffect(() => {
    editing.activate('timer');
    return () => editing.deactivate('timer');
  }, [editing]);
  const editPending = editing.isPending();
  const storedEvent = useMeta('timerEvent');
  const [chosenEvent, setChosenEvent] = useState<string | null>(null);
  const eventId = chosenEvent ?? (storedEvent && hasTimer(storedEvent) ? storedEvent : '333');
  const settings = useTimerSettings() ?? defaultTimerSettings;
  const [today, setToday] = useState(localDate);
  const { sessionId: picked, revision: selectionRevision } = useSyncExternalStore(
    saving.subscribe,
    saving.getSelection,
    saving.getSelection,
  );
  const sessionStart = useSyncExternalStore(
    saving.subscribe,
    saving.getSessionStart,
    saving.getSessionStart,
  );
  const timing = useTimerSession(eventId, today, picked, recentCount);
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
  const activeAttempt = useRef<number | null>(null);
  const latestAttempt = useRef<{ id: number; selection: number } | null>(null);
  const observed = useRef(new Map<number, string>());
  const runShortcut = useRef<(action: TimerShortcut) => void>(() => {});
  const scrambleFor = useRef({ eventId, scramble, sessionId: picked });
  scrambleFor.current = { eventId, scramble, sessionId: picked };
  useWakeLock();

  // Picking a session (or following today again) also lets go of any solve still being saved
  // into the old one, so the shortcuts work on the new session straight away.
  function pick(sessionId: number | null) {
    saving.select(sessionId);
    setShown(null);
  }

  // The new session is selected only if nothing else was chosen while it was being created.
  async function startSession() {
    const now = new Date();
    setToday(localDate(now));
    const started = await saving.startSession(eventId, now);
    if (started.status === 'started' && started.selected) setShown(null);
  }

  // A failed request is reported here, even one that failed while another tab was showing.
  useEffect(() => {
    if (sessionStart !== 'failed') return;
    setToast({ message: "Couldn't start a session. This device may be out of space." });
    saving.reportedSessionFailure();
  }, [saving, sessionStart]);

  useEffect(() => {
    for (const saved of attempts) {
      if (observed.current.get(saved.id) === saved.status) continue;
      observed.current.set(saved.id, saved.status);
      if (saved.status === 'saved') {
        if (
          latestAttempt.current?.id !== saved.id ||
          latestAttempt.current.selection !== saving.getSelection().revision
        )
          continue;
        setShown(saved.solveId ?? null);
        setAnnouncement(
          `${resultText({ time_ms: saved.timeMs, penalty: saved.penalty, dnf: saved.penalty === 'DNF' })}, saved.`,
        );
        setToast(null);
      } else if (saved.status === 'error' || saved.status === 'unavailable') {
        setToast({
          message:
            saved.status === 'unavailable'
              ? "Couldn't save that solve: its session is no longer available."
              : "Couldn't save that solve. This device may be out of space.",
        });
      }
    }
  }, [attempts, saving.getSelection]);

  const clock = useClock({
    onStart: () => {
      const id = saving.capture(scrambleFor.current);
      activeAttempt.current = id;
      latestAttempt.current = { id, selection: saving.getSelection().revision };
      setShown(null);
    },
    onCancel: () => {
      if (activeAttempt.current !== null) saving.cancel(activeAttempt.current);
      activeAttempt.current = null;
    },
    inspect: () => settings.inspectionEnabled && !isBlindfolded(scrambleFor.current.eventId),
    onFinish: (finished) => {
      setCall(null);
      const id = activeAttempt.current;
      activeAttempt.current = null;
      setScramble(generateScramble(scrambleFor.current.eventId));
      setToday(localDate());
      if (id !== null) {
        void saving.finish(id, finished);
      }
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

  // Fullscreen (app/fullscreen.ts) lasts until Escape, Exit fullscreen, or leaving the tab. In
  // the browser's own full screen, the browser takes Escape for itself, so leaving it does what
  // Escape does here: call off an attempt in progress first, as on the desktop, or else leave.
  const fullscreen = useFullscreen();
  const attempt = useRef({ active, cancel: clock.cancel });
  attempt.current = { active, cancel: clock.cancel };
  useEffect(() => {
    const changed = () => {
      if (document.fullscreenElement) return;
      if (attempt.current.active) {
        attempt.current.cancel();
        setCall(null);
      } else leaveFullscreen();
    };
    document.addEventListener('fullscreenchange', changed);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      leaveFullscreen();
    };
  }, []);

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
      } else if (event.key === 'Escape' && ownsKeys(event)) {
        leaveFullscreen();
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
    pick(null);
    setChosenEvent(next);
    void setMeta(db, 'timerEvent', next);
    setScramble(generateScramble(next));
    setShown(null);
  }

  const solves = timing?.solves ?? [];
  const currentAttempt =
    latestAttempt.current?.selection === selectionRevision
      ? saving.getAttempt(latestAttempt.current.id)
      : undefined;
  const resultContext = selectionRevision;
  const reconciled = useLiveQuery(async () => {
    if (currentAttempt?.status !== 'saved') return null;
    return {
      attemptId: currentAttempt.id,
      context: resultContext,
      sessionId: timing?.session.id,
      solve: await saving.reconcile(currentAttempt.id, eventId, timing?.session.id ?? null),
    };
  }, [saving, currentAttempt, resultContext, eventId, timing]);
  const acknowledged =
    reconciled?.attemptId === currentAttempt?.id &&
    reconciled?.context === resultContext &&
    reconciled?.sessionId === timing?.session.id
      ? reconciled
      : undefined;
  const shownSolve = acknowledged?.solve?.id === shown ? acknowledged.solve : undefined;

  async function changePenalty(solve: Solve, penalty: Penalty) {
    const result = await editing.changePenalty(solve.id, solve.solve_number, penalty, 'timer');
    if (result.status === 'unavailable') {
      setOpenSolve((current) => (current === solve.id ? null : current));
    }
    return result;
  }

  async function remove(solve: Solve) {
    const result = await editing.remove('timer', solve.id, solve.solve_number);
    if (result.status !== 'success') {
      if (result.status === 'unavailable')
        setOpenSolve((current) => (current === solve.id ? null : current));
      return result;
    }
    setShown((current) => (current === solve.id ? null : current));
    setOpenSolve((current) => (current === solve.id ? null : current));
    return result;
  }

  // A completed attempt owns shortcuts until reconciled, even if a different row arrives first.
  const latest = currentAttempt ? acknowledged?.solve : solves[0];
  runShortcut.current = (action) => {
    if (active || editing.isPending() || !latest) return;
    if (action === 'delete') void remove(latest);
    else if (
      (latest.dnf ? 'DNF' : latest.penalty === '+2' ? '+2' : 'OK') !== action &&
      !(onlyDnf(latest) && action !== 'DNF')
    )
      void changePenalty(latest, action);
  };

  // The wide layout's panel holds the stats and solves, so without them the column centres.
  const showPanel = !settings.hideStats && !fullscreen;

  return (
    <>
      <h1 className="sr-only">Timer</h1>
      <AttemptRecovery attempts={attempts} />
      <div
        className={`flex flex-1 flex-col gap-4 ${
          showPanel
            ? 'timer-columns lg:grid'
            : fullscreen
              ? ''
              : 'lg:mx-auto lg:w-full lg:max-w-3xl'
        }`}
      >
        {!fullscreen && (
          // In the wide layout the menus and the gear take their places in the columns.
          <div className={`flex items-center gap-3 ${showPanel ? 'lg:contents' : ''}`}>
            <label className="min-w-0 flex-[2] lg:[grid-area:event]">
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
            <SessionMenu
              eventId={eventId}
              today={today}
              current={timing?.session}
              onPick={pick}
              onNew={() => void startSession()}
              starting={sessionStart === 'starting'}
            />
            {/* A gear rather than the word, so both menus have room on a phone. */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              className="flex size-11 shrink-0 lg:[grid-area:settings] items-center justify-center rounded-lg border border-control bg-raised"
            >
              <SettingsIcon className="size-5" />
            </button>
          </div>
        )}

        {!fullscreen && <BackupReminder className="lg:[grid-area:notice]" />}

        <section aria-label="Scramble" className="lg:[grid-area:scramble]">
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
            <button
              type="button"
              onClick={fullscreen ? leaveFullscreen : enterFullscreen}
              aria-keyshortcuts={fullscreen ? 'Escape' : undefined}
              className="min-h-11 rounded-lg px-3 font-medium text-accent-ink"
            >
              {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </button>
          </div>
        </section>

        <div
          {...pointer}
          role="presentation"
          className="touch-pad flex min-h-40 flex-1 flex-col items-center justify-center rounded-2xl lg:@container lg:[grid-area:pad]"
        >
          <Readout
            state={clock.state}
            now={clock.now}
            hideTimer={settings.hideTimer}
            shown={shownSolve}
            large={fullscreen}
          />
          {/* How to start, until today's first solve. */}
          {(timing === null || timing?.session.solve_count === 0) && !shownSolve && !fullscreen && (
            <p className="mt-3 text-center text-muted text-sm">
              {isBlindfolded(eventId) || !settings.inspectionEnabled
                ? 'Hold the time until it turns green, then let go to start.'
                : 'Touch the time to inspect, then hold until it turns green and let go to start.'}
            </p>
          )}
        </div>

        {shownSolve && !fullscreen && (
          <fieldset className="flex flex-wrap items-center justify-center gap-2 lg:[grid-area:solve]">
            <legend className="sr-only">Solve {shownSolve.solve_number}</legend>
            <PenaltyButtons
              solve={shownSolve}
              disabled={editPending}
              onChange={(penalty) => void changePenalty(shownSolve, penalty)}
            />
            <button
              type="button"
              disabled={editPending}
              onClick={() => void remove(shownSolve)}
              className="min-h-11 rounded-lg border border-control px-4 font-medium text-danger-ink"
            >
              Delete
            </button>
          </fieldset>
        )}

        {showPanel && <SessionStats timing={timing} today={today} onOpen={setOpenSolve} />}
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
        onPenalty={changePenalty}
        onNotes={async (solve, notes) => {
          const result = await editing.changeNotes(solve.id, solve.solve_number, notes, 'timer');
          if (result.status === 'unavailable')
            setOpenSolve((current) => (current === solve.id ? null : current));
          return result;
        }}
        onDelete={remove}
        pending={editPending}
      />
      <SolveEditToast
        editing={editing}
        origin="timer"
        toast={toast}
        onDismiss={() => setToast(null)}
      />
    </>
  );
}

/**
 * The time itself: orange while inspecting, red while holding, green when ready, as on a Stackmat.
 */
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
        large
          ? 'text-[clamp(5rem,26vw,13rem)]'
          : // In the wide layout, as large as 1:23.45 fits the touch pad's width, up to 14 rem.
            'text-[clamp(4rem,20vw,8rem)] lg:text-[min(14rem,24cqi)]'
      }`}
    >
      {text}
      {plusTwo && <span className="ml-2 align-top text-[0.3em] text-warning-ink">+2</span>}
    </p>
  );
}

function SessionStats({
  timing,
  today,
  onOpen,
}: {
  readonly timing: ReturnType<typeof useTimerSession>;
  readonly today: string;
  readonly onOpen: (solveId: number) => void;
}) {
  const headingId = useId();
  if (timing === undefined) return null;
  const session = timing?.session;
  const solveCount = session?.solve_count ?? 0;
  const stats: ReadonlyArray<readonly [string, string]> = [
    ['Solves', solveCount.toLocaleString('en-NZ')],
    ['Best', formatResult(singleSeconds(session?.best_single ?? null))],
    ...timerAverages.map(
      ({ label, key, size }) => [label, averageText(session?.[key], size, solveCount)] as const,
    ),
    ['Mean', formatResult(averageSeconds(session?.session_mean ?? null))],
  ];

  return (
    // In the wide layout the panel takes the height the left column leaves it (no height of its
    // own, then all of its grid area), and the list scrolls inside it rather than the page.
    <section
      aria-labelledby={headingId}
      className="space-y-3 lg:flex lg:h-0 lg:min-h-full lg:flex-col lg:[grid-area:panel]"
    >
      <h2 id={headingId} className="font-semibold">
        {session ? sessionDay(session, today) : 'Today'}
      </h2>
      <dl className="grid grid-cols-5 gap-2 text-sm">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {timing && timing.solves.length > 0 ? (
        // In the wide layout the header row scrolls with the rows, so a scroll bar narrows both.
        <div className="lg:min-h-0 lg:overflow-y-auto">
          {/* Each row's name says which average is which, so the header row is for the eye. */}
          <div
            aria-hidden="true"
            className="sticky top-0 hidden gap-3 border border-transparent bg-surface px-3 pb-1 text-muted text-sm lg:flex lg:justify-end"
          >
            {timerAverages.map(({ label }) => (
              <span key={label} className={averageColumn}>
                {label}
              </span>
            ))}
          </div>
          <ol
            aria-label="Latest solves"
            className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap"
          >
            {timing.solves.map((solve) => {
              const mark = singleMark(solve, timing.session);
              const averages = timerAverages.map(({ label, key, size }) => ({
                label,
                text: averageText(solve[key], size, solve.solve_number),
              }));
              return (
                <li key={solve.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(solve.id)}
                    className="relative min-h-11 rounded-lg border border-line bg-raised px-3 tabular-nums lg:flex lg:w-full lg:items-center lg:gap-3"
                  >
                    {/* The name, as one piece of hidden text so that it reads in the same order
                        as the row shows it (WCAG 2.5.3). The averages are in it only in the wide
                        layout, where the row shows them; on the phone it stays as before. */}
                    <span className="sr-only">
                      Solve {solve.solve_number}: {resultText(solve)}
                      {mark && `, ${mark}`}
                      <span className="hidden lg:inline">
                        {averages.map(({ label, text }) => `, ${label} ${text}`).join('')}
                      </span>
                    </span>
                    {/* A wrapped row of results on the phone; in the wide layout, one row each
                        with the solve's number, the result, and the best and worst marked, then
                        the Ao5 and Ao12 at the solve under the header row. */}
                    <span aria-hidden="true" className="hidden text-muted lg:inline">
                      {solve.solve_number}
                    </span>
                    <span aria-hidden="true" className="lg:ml-auto lg:font-semibold">
                      {resultText(solve)}
                    </span>
                    {mark && (
                      <span
                        aria-hidden="true"
                        className={`hidden text-sm lg:inline ${
                          mark === 'best' ? 'text-good-ink' : 'text-danger-ink'
                        }`}
                      >
                        {mark}
                      </span>
                    )}
                    {averages.map(({ label, text }) => (
                      <span
                        key={label}
                        aria-hidden="true"
                        className={`hidden lg:inline ${averageColumn}`}
                      >
                        {text}
                      </span>
                    ))}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="text-muted text-sm">
          {!timing
            ? "No solves yet today. Your first one starts today's session."
            : timing.session.date === today
              ? 'No solves yet today.'
              : 'No solves yet in this session.'}
        </p>
      )}
      {timing && solveCount > timing.solves.length && (
        <p className="text-muted text-sm">
          Showing your latest {timing.solves.length} of {count(solveCount, 'solve', 'solves')}. The
          Sessions tab has them all.
        </p>
      )}
    </section>
  );
}
