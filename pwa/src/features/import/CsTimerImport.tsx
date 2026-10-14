import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fieldStyle, primaryButton, secondaryButton } from '../../app/forms.tsx';
import { Sheet } from '../../app/Sheet.tsx';
import { holdUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { StorageFullError } from '../../db/errors.ts';
import { useMeta } from '../../db/hooks.ts';
import { setMeta } from '../../db/meta.ts';
import { events } from '../../lib/events.ts';
import { count, formatResult } from '../../lib/format.ts';
import { requestPersistence } from '../../lib/storage.ts';
import { formatDate } from '../../lib/time.ts';
import type { CsTimerData, PreviewSession } from './cstimer.ts';

// The importer loads the first time it's needed.
const loadImporter = () => import('./cstimer.ts');

interface Choice {
  readonly picked: boolean;
  readonly eventId: string;
}

type State =
  | { readonly step: 'idle' }
  | { readonly step: 'reading' }
  | {
      readonly step: 'picking';
      readonly data: CsTimerData;
      readonly sessions: readonly PreviewSession[];
    }
  | { readonly step: 'importing' }
  | { readonly step: 'done'; readonly message: string };

/** Nothing new to bring in: no solves, or all of them here already. */
const nothingNew = (session: PreviewSession) =>
  session.solve_count === 0 || session.solve_count === session.already_imported;

/** Imports sessions from a CSTimer export, as the desktop app's Import tab does. */
export function CsTimerImport() {
  const db = useDb();
  const timerEvent = useMeta('timerEvent');
  const input = useRef<HTMLInputElement>(null);
  const releaseHold = useRef<(() => void) | null>(null);
  const [state, setState] = useState<State>({ step: 'idle' });
  const [choices, setChoices] = useState<ReadonlyMap<string, Choice>>(new Map());
  const [splitByDay, setSplitByDay] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const release = useCallback(() => {
    releaseHold.current?.();
    releaseHold.current = null;
  }, []);

  useEffect(() => {
    const element = input.current;
    element?.addEventListener('cancel', release);
    return () => {
      element?.removeEventListener('cancel', release);
      release();
    };
  }, [release]);

  function choose() {
    setError(null);
    release();
    releaseHold.current = holdUpdates();
    input.current?.click();
  }

  async function read(file: File) {
    setState({ step: 'reading' });
    try {
      const { previewCsTimer, readCsTimer } = await loadImporter();
      const data = readCsTimer(await file.text());
      const sessions = await previewCsTimer(data, db);
      if (sessions.length === 0) {
        setState({ step: 'idle' });
        setError('This file has no CSTimer sessions in it.');
        return;
      }
      setChoices(
        new Map(
          sessions.map((session) => [
            session.key,
            {
              picked: !nothingNew(session),
              eventId: session.suggested_event ?? timerEvent ?? '333',
            },
          ]),
        ),
      );
      setSplitByDay(true);
      setState({ step: 'picking', data, sessions });
    } catch (caught) {
      setState({ step: 'idle' });
      setError(
        caught instanceof Error && caught.name === 'CsTimerError'
          ? caught.message
          : "That file couldn't be read.",
      );
    } finally {
      release();
    }
  }

  async function runImport(data: CsTimerData, sessions: readonly PreviewSession[]) {
    const picked = sessions.filter((session) => choices.get(session.key)?.picked);
    if (picked.every(nothingNew)) {
      setError("Everything you picked is already in the app, so there's nothing new to import.");
      return;
    }
    setError(null);
    setState({ step: 'importing' });
    const hold = holdUpdates();
    try {
      const { importCsTimer, importMessage } = await loadImporter();
      const result = await importCsTimer(db, data, {
        keys: picked.map((session) => session.key),
        eventId: timerEvent ?? '333',
        splitByDay,
        events: new Map(
          picked.map((session) => [session.key, choices.get(session.key)?.eventId ?? '333']),
        ),
      });
      // Now there's something worth keeping, ask the browser to keep it.
      await setMeta(db, 'persistResult', await requestPersistence());
      setState({ step: 'done', message: importMessage(result) });
    } catch (caught) {
      setState({ step: 'idle' });
      setError(
        caught instanceof StorageFullError
          ? 'This device is out of space, so nothing was imported.'
          : "Couldn't import the sessions. Nothing was changed.",
      );
    } finally {
      hold();
    }
  }

  function update(key: string, change: Partial<Choice>) {
    setChoices((current) => {
      const next = new Map(current);
      const choice = next.get(key);
      if (choice) next.set(key, { ...choice, ...change });
      return next;
    });
  }

  const busy = state.step === 'reading' || state.step === 'importing';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={choose}
        disabled={busy}
        className={`${secondaryButton} w-full`}
      >
        {state.step === 'reading' ? 'Reading the file…' : 'Import from CSTimer'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".txt,.json,text/plain,application/json"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void read(file);
          else release();
        }}
      />
      <p role="status" className="text-sm empty:hidden">
        {state.step === 'done' ? state.message : state.step === 'importing' ? 'Importing…' : null}
      </p>
      {error && state.step !== 'picking' && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}

      <Sheet
        open={state.step === 'picking'}
        onClose={() => {
          setError(null);
          setState({ step: 'idle' });
        }}
        title="Import from CSTimer"
      >
        {state.step === 'picking' && (
          <Picker
            sessions={state.sessions}
            choices={choices}
            splitByDay={splitByDay}
            error={error}
            onChange={update}
            onEveryEvent={(eventId) =>
              setChoices(
                (current) =>
                  new Map([...current].map(([key, choice]) => [key, { ...choice, eventId }])),
              )
            }
            onSplitByDay={setSplitByDay}
            onCancel={() => {
              setError(null);
              setState({ step: 'idle' });
            }}
            onImport={() => void runImport(state.data, state.sessions)}
          />
        )}
      </Sheet>
    </div>
  );
}

function dateRange(session: PreviewSession): string {
  if (!session.first_date || !session.last_date) return '';
  const range =
    session.first_date === session.last_date
      ? formatDate(session.first_date)
      : `${formatDate(session.first_date)} to ${formatDate(session.last_date)}`;
  return session.days > 1 ? `${range} (${session.days} days)` : range;
}

function Picker({
  sessions,
  choices,
  splitByDay,
  error,
  onChange,
  onEveryEvent,
  onSplitByDay,
  onCancel,
  onImport,
}: {
  readonly sessions: readonly PreviewSession[];
  readonly choices: ReadonlyMap<string, Choice>;
  readonly splitByDay: boolean;
  readonly error: string | null;
  readonly onChange: (key: string, change: Partial<Choice>) => void;
  readonly onEveryEvent: (eventId: string) => void;
  readonly onSplitByDay: (split: boolean) => void;
  readonly onCancel: () => void;
  readonly onImport: () => void;
}) {
  const everyEventId = useId();
  const splitId = useId();
  const splitHintId = useId();
  const picked = sessions.filter((session) => choices.get(session.key)?.picked);
  const solves = picked.reduce(
    (sum, session) => sum + session.solve_count - session.already_imported,
    0,
  );

  return (
    <div className="space-y-4">
      <p>Choose the sessions to import, and the event each one is for.</p>
      <div className="space-y-1">
        <label htmlFor={everyEventId} className="block font-medium">
          Set every session's event to
        </label>
        <select
          id={everyEventId}
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) onEveryEvent(event.target.value);
          }}
          className={fieldStyle}
        >
          <option value="" disabled>
            Choose an event
          </option>
          <EventOptions />
        </select>
      </div>

      <ul className="space-y-3">
        {sessions.map((session) => (
          <SessionChoice
            key={session.key}
            session={session}
            choice={choices.get(session.key)}
            onChange={(change) => onChange(session.key, change)}
          />
        ))}
      </ul>

      <div className="space-y-1">
        <div className="flex min-h-11 items-center gap-3">
          <input
            id={splitId}
            type="checkbox"
            checked={splitByDay}
            onChange={(event) => onSplitByDay(event.target.checked)}
            aria-describedby={splitHintId}
            className="size-5 shrink-0 accent-accent"
          />
          <label htmlFor={splitId} className="font-medium">
            Split each CSTimer session into one session a day
          </label>
        </div>
        <p id={splitHintId} className="text-muted text-sm">
          Lookahead keeps a session a day, so this lines your CSTimer history up with the solves you
          time here. Solves already here are skipped, so it's safe to import the same file again.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={picked.length === 0}
          className={primaryButton}
        >
          {picked.length === 0 ? 'Import' : `Import ${count(solves, 'solve', 'solves')}`}
        </button>
      </div>
    </div>
  );
}

function EventOptions() {
  return Object.entries(events).map(([id, name]) => (
    <option key={id} value={id}>
      {name}
    </option>
  ));
}

function SessionChoice({
  session,
  choice,
  onChange,
}: {
  readonly session: PreviewSession;
  readonly choice: Choice | undefined;
  readonly onChange: (change: Partial<Choice>) => void;
}) {
  const id = useId();
  const empty = session.solve_count === 0;
  const allHere = !empty && session.solve_count === session.already_imported;
  const notes: string[] = [];
  if (empty) notes.push('No solves to import');
  else if (session.already_imported)
    notes.push(
      allHere
        ? 'Already in the app'
        : `${count(session.already_imported, 'solve', 'solves')} already in the app`,
    );
  if (session.unreadable)
    notes.push(`${count(session.unreadable, 'row', 'rows')} can't be read and will be left out`);
  const range = dateRange(session);

  return (
    <li className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex items-start gap-3">
        <input
          id={`${id}-pick`}
          type="checkbox"
          checked={choice?.picked ?? false}
          disabled={empty}
          onChange={(event) => onChange({ picked: event.target.checked })}
          aria-describedby={`${id}-about`}
          className="mt-1 size-5 shrink-0 accent-accent"
        />
        <div className="min-w-0">
          <label htmlFor={`${id}-pick`} className="block break-words font-semibold">
            {session.name}
          </label>
          <p id={`${id}-about`} className="text-muted text-sm">
            {!empty && count(session.solve_count, 'solve', 'solves')}
            {range && `, ${range}`}
            {session.best !== null &&
              `. Best ${formatResult(session.best)}, mean ${formatResult(session.mean)}`}
            {!empty && '.'}
            {notes.length > 0 && `${empty ? '' : ' '}${notes.join('. ')}.`}
          </p>
        </div>
      </div>
      {!empty && (
        <div className="flex items-center gap-2 pl-8">
          <label htmlFor={`${id}-event`} className="shrink-0 text-muted text-sm">
            Event
          </label>
          <select
            id={`${id}-event`}
            aria-label={`Event for ${session.name}`}
            value={choice?.eventId ?? '333'}
            onChange={(event) => onChange({ eventId: event.target.value })}
            className={`${fieldStyle} min-w-0`}
          >
            <EventOptions />
          </select>
        </div>
      )}
      {session.suggested_event && (
        <p className="pl-8 text-muted text-sm">Event from its scramble type in CSTimer</p>
      )}
    </li>
  );
}
