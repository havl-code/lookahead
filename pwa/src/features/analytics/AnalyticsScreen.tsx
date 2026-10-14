import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { fieldStyle } from '../../app/forms.tsx';
import { detailHref, tabHref } from '../../app/router.ts';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { useMeta, useSessionEvents, useWcaPerson } from '../../db/hooks.ts';
import { eventName } from '../../lib/events.ts';
import { count, formatResult } from '../../lib/format.ts';
import { averageSeconds, singleSeconds } from '../../lib/stats.ts';
import { formatDate } from '../../lib/time.ts';
import { wcaReference } from '../../lib/wcaReference.ts';
import { Charts } from './Charts.tsx';
import { chartData, eventOverview, eventSessions, type Overview, scoredSessions } from './data.ts';
import { ScoresSection } from './ScoresSection.tsx';

/** The greeting the desktop app gives, by the time of day. */
export function timeOfDay(hour = new Date().getHours()): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
}

export function AnalyticsScreen() {
  const events = useSessionEvents();
  const timerEvent = useMeta('timerEvent');
  const person = useWcaPerson();
  const [chosen, setChosen] = useState<string | null>(null);
  const eventSelectId = useId();
  if (events === undefined || timerEvent === undefined) return null;

  // The event chosen here, or the timer's, or 3x3x3, or the first with sessions.
  const eventId =
    [chosen, timerEvent, '333'].find((id) => id !== null && events.includes(id)) ??
    events[0] ??
    null;

  return (
    <>
      <ScreenHeader title="Analytics">
        {eventId !== null && (
          <div className="flex items-center gap-2">
            <label htmlFor={eventSelectId} className="sr-only">
              Event
            </label>
            <select
              id={eventSelectId}
              value={eventId}
              onChange={(event) => setChosen(event.target.value)}
              className={`${fieldStyle} w-auto bg-raised font-semibold`}
            >
              {events.map((id) => (
                <option key={id} value={id}>
                  {eventName(id)}
                </option>
              ))}
            </select>
          </div>
        )}
      </ScreenHeader>
      {person?.name && (
        <p className="mt-1 text-muted">
          {timeOfDay()}, {person.name}.
        </p>
      )}
      {eventId === null ? (
        <p className="mt-6 text-muted">
          Nothing to analyse yet. Time some solves on the{' '}
          <a
            href={tabHref('timer')}
            className="font-medium text-accent-ink underline underline-offset-2"
          >
            Timer
          </a>{' '}
          tab, or restore a backup on the More tab, and your progress shows here.
        </p>
      ) : (
        <EventAnalytics key={eventId} eventId={eventId} />
      )}
    </>
  );
}

function EventAnalytics({ eventId }: { readonly eventId: string }) {
  const db = useDb();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const chartsForId = useId();
  const overview = useLiveQuery(() => eventOverview(db, eventId), [db, eventId]);
  const scored = useLiveQuery(() => scoredSessions(db, eventId, wcaReference), [db, eventId]);
  const sessions = useLiveQuery(() => eventSessions(db, eventId), [db, eventId]);
  const charts = useLiveQuery(() => chartData(db, eventId, sessionId), [db, eventId, sessionId]);

  return (
    <>
      {overview && <OverviewCard overview={overview} />}
      {scored && <ScoresSection eventId={eventId} sessions={scored} reference={wcaReference} />}
      <section aria-labelledby="charts-heading" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="charts-heading" className="font-semibold text-lg">
            Charts
          </h2>
          <div className="flex min-w-0 items-center gap-2">
            <label htmlFor={chartsForId} className="shrink-0 text-muted text-sm">
              Charts for
            </label>
            <select
              id={chartsForId}
              value={sessionId ?? ''}
              onChange={(event) =>
                setSessionId(event.target.value ? Number(event.target.value) : null)
              }
              className={`${fieldStyle} w-auto min-w-0 bg-raised`}
            >
              <option value="">All sessions</option>
              {sessions?.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.date ? formatDate(session.date) : 'No date'} (
                  {count(session.solve_count, 'solve', 'solves')})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          {charts && <Charts data={charts} wholeEvent={sessionId === null} />}
        </div>
      </section>
    </>
  );
}

function OverviewCard({ overview }: { readonly overview: Overview }) {
  const sizes = [5, 12, 50, 100] as const;
  return (
    <section
      aria-labelledby="overview-heading"
      className="mt-4 rounded-xl border border-line bg-raised p-4"
    >
      <h2 id="overview-heading" className="sr-only">
        Your bests
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-muted text-sm">Best single</p>
          <p className="font-semibold text-5xl tabular-nums tracking-tight">
            {formatResult(singleSeconds(overview.best?.ms ?? null))}
          </p>
          {overview.best && (
            <a
              href={detailHref('sessions', String(overview.best.sessionId))}
              className="inline-flex min-h-11 items-center text-accent-ink text-sm underline underline-offset-2"
            >
              {overview.best.date ? formatDate(overview.best.date) : 'Its session'}
            </a>
          )}
        </div>
        <div>
          <p className="text-muted text-sm">Average</p>
          <p className="font-semibold text-3xl tabular-nums">
            {formatResult(averageSeconds(overview.average))}
          </p>
          <p className="text-muted text-sm">of every solve</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 border-line border-t pt-3">
        {sizes.map((size) => {
          const best = overview.bestAverages[size];
          return (
            <div key={size}>
              <dt className="text-muted text-sm">Best Ao{size}</dt>
              <dd className="font-semibold tabular-nums">
                {best ? (
                  <a
                    href={detailHref('sessions', String(best.sessionId))}
                    aria-label={`Best Ao${size} ${formatResult(averageSeconds(best.value))}${best.date ? `, ${formatDate(best.date)}` : ''}`}
                    className="inline-flex min-h-11 items-center underline decoration-line underline-offset-4"
                  >
                    {formatResult(averageSeconds(best.value))}
                  </a>
                ) : (
                  <span className="inline-flex min-h-11 items-center">-</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-1 text-muted text-sm">
        {count(overview.solves, 'solve', 'solves')} in{' '}
        {count(overview.sessions, 'session', 'sessions')}
      </p>
    </section>
  );
}
