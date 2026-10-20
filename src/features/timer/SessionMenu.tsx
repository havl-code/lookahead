import { useSessions } from '../../db/hooks.ts';
import type { Session } from '../../db/schema.ts';
import { count } from '../../lib/format.ts';
import { formatDate } from '../../lib/time.ts';

const newSession = 'new';

/** A session's day as the timer names it: Today, or its date. */
export function sessionDay(session: Pick<Session, 'date'>, today: string): string {
  if (session.date === today) return 'Today';
  return session.date ? formatDate(session.date) : 'No date';
}

/**
 * The menu of the event's sessions the timer can time into, newest first, as on the desktop
 * timer, with "+ New session" to start another one for today. Until today's first solve, it says
 * that one starts then.
 */
export function SessionMenu({
  eventId,
  today,
  current,
  onPick,
  onNew,
}: {
  readonly eventId: string;
  readonly today: string;
  readonly current: Session | null | undefined;
  readonly onPick: (sessionId: number) => void;
  readonly onNew: () => void;
}) {
  const sessions = useSessions(Number.POSITIVE_INFINITY, eventId)?.sessions ?? [];
  return (
    <label className="min-w-0 flex-[3] lg:[grid-area:session]">
      <span className="sr-only">Session</span>
      <select
        value={current?.id ?? ''}
        onChange={(event) =>
          event.target.value === newSession ? onNew() : onPick(Number(event.target.value))
        }
        className="min-h-11 w-full rounded-lg border border-control bg-raised px-3"
      >
        <option value={newSession}>+ New session</option>
        {!current && (
          <option value="" disabled>
            Today's session starts with your first solve
          </option>
        )}
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {sessionDay(session, today)} ({count(session.solve_count, 'solve', 'solves')})
          </option>
        ))}
      </select>
    </label>
  );
}
