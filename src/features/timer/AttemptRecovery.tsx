import { useState } from 'react';
import { Sheet } from '../../app/Sheet.tsx';
import { useTimerSaving } from '../../db/DbProvider.tsx';
import { useSessions } from '../../db/hooks.ts';
import type { TimedAttempt } from '../../db/timerSaving.ts';
import { eventName } from '../../lib/events.ts';
import { count } from '../../lib/format.ts';
import { formatDate, formatMoment } from '../../lib/time.ts';
import { resultText } from '../solves/presentation.tsx';

export function AttemptRecovery({ attempts }: { readonly attempts: readonly TimedAttempt[] }) {
  const [open, setOpen] = useState(false);
  const recovery = attempts.filter((attempt) => attempt.recoverable && attempt.status !== 'saved');
  return (
    <>
      {recovery.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-4 min-h-11 rounded-lg border border-control bg-raised px-4 py-2 text-accent-ink"
        >
          Recover {count(recovery.length, 'unsaved attempt', 'unsaved attempts')}
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Unsaved attempts">
        <p className="text-muted text-sm">
          Keep this app open until you save or discard these attempts.
        </p>
        {recovery.length === 0 ? (
          <p role="status">No unsaved attempts.</p>
        ) : (
          <ul className="space-y-4">
            {recovery.map((attempt) => (
              <RecoveryEntry key={attempt.id} attempt={attempt} />
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}

function RecoveryEntry({ attempt }: { readonly attempt: TimedAttempt }) {
  const saving = useTimerSaving();
  const sessions = useSessions(Number.POSITIVE_INFINITY, attempt.eventId)?.sessions;
  const destination = sessions?.find((session) => session.id === attempt.destinationId);
  const missing = attempt.destinationId !== null && sessions !== undefined && !destination;
  const [replacement, setReplacement] = useState('');
  const pending = attempt.status === 'saving';
  const label = `${resultText({
    time_ms: attempt.timeMs,
    penalty: attempt.penalty,
    dnf: attempt.penalty === 'DNF',
  })}, ${eventName(attempt.eventId)}, ${formatMoment(attempt.timestamp)}`;
  return (
    <li aria-label={label} className="space-y-2 rounded-xl border border-line p-3">
      <p className="font-semibold">{label}</p>
      <p className="text-muted text-sm">
        Destination:{' '}
        {missing
          ? 'Session unavailable'
          : destination
            ? `${destination.date ? formatDate(destination.date) : 'No date'} (session ${destination.id})`
            : attempt.destinationId === null
              ? `Daily session for ${formatDate(attempt.day)}`
              : 'Loading session…'}
      </p>
      {missing && (
        <label className="block">
          Replacement session
          <select
            value={replacement}
            disabled={pending}
            onChange={(event) => setReplacement(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-control bg-raised px-3"
          >
            <option value="">Choose a session</option>
            {sessions?.map((session) => (
              <option key={session.id} value={session.id}>
                {session.date ? formatDate(session.date) : 'No date'} (session {session.id},{' '}
                {count(session.solve_count, 'solve', 'solves')})
              </option>
            ))}
          </select>
        </label>
      )}
      <p role="status" className="text-sm">
        {pending
          ? 'Saving…'
          : missing || attempt.status === 'unavailable'
            ? 'Choose an available session for this event, then Retry.'
            : "Couldn't save this attempt. Retry when storage is available, or discard it."}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || sessions === undefined || (missing && !replacement)}
          onClick={() => void saving.retry(attempt.id, missing ? Number(replacement) : undefined)}
          className="min-h-11 rounded-lg border border-control px-4 font-medium text-accent-ink disabled:opacity-50"
        >
          Retry
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => saving.discard(attempt.id)}
          className="min-h-11 rounded-lg border border-control px-4 font-medium text-danger-ink disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </li>
  );
}
