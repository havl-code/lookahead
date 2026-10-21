import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, useId, useState } from 'react';
import { fieldStyle } from '../../app/forms.tsx';
import { tabHref, useDetail } from '../../app/router.ts';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { useMeta, useSessionEvents, useWcaPerson } from '../../db/hooks.ts';
import { eventName } from '../../lib/events.ts';
import { count, formatResult } from '../../lib/format.ts';
import { averageSeconds, averageSizes, singleSeconds } from '../../lib/stats.ts';
import { formatDate } from '../../lib/time.ts';
import { rankedEvents } from '../../lib/wcaRank.ts';
import { wcaReference } from '../../lib/wcaReference.ts';
import { Charts } from './Charts.tsx';
import { chartData, eventOverview, eventSessions, type Overview, scoredSessions } from './data.ts';
import { type Pb, PbSheet } from './PbSheet.tsx';
import { ScoresSection } from './ScoresSection.tsx';
import { WorldRank } from './WorldRank.tsx';

/** The greeting the desktop app gives, by the time of day. */
export function timeOfDay(hour = new Date().getHours()): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
}

// The doc is about 10 KB, so it loads the first time it's opened (the Suspense around each tab
// waits for it), and the service worker keeps it for offline use.
const ScoresGuide = lazy(() =>
  import('./ScoresGuide.tsx').then((m) => ({ default: m.ScoresGuide })),
);

/** The Analytics tab, or How the scores work (#/analytics/scores). */
export function AnalyticsScreen() {
  if (useDetail() === 'scores') return <ScoresGuide />;
  return <EventsAnalytics />;
}

function EventsAnalytics() {
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
      {overview && <OverviewCard eventId={eventId} overview={overview} />}
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

/** A part of the overview, as a card of its own in the wide layout. */
const wideCard = 'lg:rounded-xl lg:border lg:border-line lg:bg-raised lg:p-4';

function OverviewCard({
  eventId,
  overview,
}: {
  readonly eventId: string;
  readonly overview: Overview;
}) {
  const [pb, setPb] = useState<Pb | null>(null);
  const bestSingle = overview.best && {
    kind: 'single' as const,
    text: formatResult(singleSeconds(overview.best.ms)),
    sessionId: overview.best.sessionId,
    date: overview.best.date,
  };
  const rankedBest = overview.best && rankedEvents.has(eventId) ? overview.best : null;
  return (
    // One card on the phone. In the wide layout its parts become two rows of cards, as on the
    // 3.x desktop app's dashboard: Best single, World rank, Average, Solves, and Sessions; then
    // the best averages. Average, Solves, and Sessions move after the world rank with `order`;
    // none of them can be focused, so the focus order is the same in both layouts.
    <section
      aria-labelledby="overview-heading"
      className={`mt-4 rounded-xl border border-line bg-raised p-4 lg:grid lg:gap-4 lg:border-0 lg:bg-transparent lg:p-0 ${rankedBest ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
    >
      <h2 id="overview-heading" className="sr-only">
        Your bests
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:contents">
        <div className={wideCard}>
          <p className="text-muted text-sm">Best single</p>
          {bestSingle ? (
            <>
              <button
                type="button"
                onClick={() => setPb(bestSingle)}
                aria-label={`Best single ${bestSingle.text}, details`}
                className="font-semibold text-5xl tabular-nums tracking-tight underline decoration-line underline-offset-8 lg:text-3xl lg:underline-offset-4"
              >
                {bestSingle.text}
              </button>
              <p className="text-muted text-sm">
                {bestSingle.date ? formatDate(bestSingle.date) : 'No date'}
              </p>
            </>
          ) : (
            <p className="font-semibold text-5xl tabular-nums tracking-tight lg:text-3xl">-</p>
          )}
        </div>
        <div className={`${wideCard} lg:order-1`}>
          <p className="text-muted text-sm">Average</p>
          <p className="font-semibold text-3xl tabular-nums">
            {formatResult(averageSeconds(overview.average))}
          </p>
          <p className="text-muted text-sm">of every solve</p>
        </div>
      </div>
      {rankedBest && (
        <WorldRank eventId={eventId} bestMs={rankedBest.ms} className={`${wideCard} lg:mt-0`} />
      )}
      <dl className="mt-3 grid grid-cols-4 gap-2 border-line border-t pt-3 lg:order-2 lg:col-span-full lg:mt-0 lg:gap-4 lg:border-t-0 lg:pt-0">
        {averageSizes.map((size) => {
          const best = overview.bestAverages[size];
          const text = best && formatResult(averageSeconds(best.value));
          return (
            <div key={size} className={wideCard}>
              <dt className="text-muted text-sm">Best Ao{size}</dt>
              <dd className="font-semibold tabular-nums lg:text-3xl">
                {best && text ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPb({ kind: size, text, sessionId: best.sessionId, date: best.date })
                    }
                    aria-label={`Best Ao${size} ${text}${best.date ? `, ${formatDate(best.date)}` : ''}, details`}
                    className="inline-flex min-h-11 items-center underline decoration-line underline-offset-4"
                  >
                    {text}
                  </button>
                ) : (
                  <span className="inline-flex min-h-11 items-center">-</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-1 text-muted text-sm lg:hidden">
        {count(overview.solves, 'solve', 'solves')} in{' '}
        {count(overview.sessions, 'session', 'sessions')}
      </p>
      {/* The sentence above, as two cards in the wide layout. */}
      {(
        [
          ['Solves', overview.solves],
          ['Sessions', overview.sessions],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className={`hidden lg:order-1 lg:block ${wideCard}`}>
          <p className="text-muted text-sm">{label}</p>
          <p className="font-semibold text-3xl tabular-nums">{value.toLocaleString('en-NZ')}</p>
        </div>
      ))}
      <PbSheet pb={pb} onClose={() => setPb(null)} />
    </section>
  );
}
