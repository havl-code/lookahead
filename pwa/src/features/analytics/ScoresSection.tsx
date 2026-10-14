import { repoUrl } from '../../app/Preview.tsx';
import { eventName } from '../../lib/events.ts';
import { count, formatResult } from '../../lib/format.ts';
import type { WcaReference } from '../../lib/scores.ts';
import type { ScoredSession } from './data.ts';
import { insights, type Metric, metricCards, metrics, scoreBand, trendOf } from './insights.ts';

const names: Record<Metric, string> = {
  speed: 'Speed',
  consistency: 'Consistency',
  overall: 'Overall',
};

const bandColour = {
  excellent: 'bg-good-ink',
  good: 'bg-[var(--chart-3)]',
  average: 'bg-warning-ink',
  poor: 'bg-danger-ink',
} as const;

const toneColour = {
  positive: 'bg-good-ink',
  negative: 'bg-danger-ink',
  neutral: 'bg-muted',
} as const;

const scoresGuide = `${repoUrl}/blob/main/docs/SCORES.md`;

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * The Speed, Consistency, and Overall scores (the average of the 10 latest sessions, with the
 * change from the 10 before), and the insights, as on the desktop's Analytics tab.
 */
export function ScoresSection({
  eventId,
  sessions,
  reference,
}: {
  readonly eventId: string;
  readonly sessions: readonly ScoredSession[];
  readonly reference: WcaReference;
}) {
  const event = Object.hasOwn(reference.events, eventId) ? reference.events[eventId] : undefined;
  const cards = metricCards(sessions);
  const round = event
    ? event.result === 'best'
      ? `best of ${event.solves_per_round}`
      : event.solves_per_round === 5
        ? 'Ao5'
        : `Mo${event.solves_per_round}`
    : '';
  const latest = (metric: Metric) => sessions.find((s) => s[`${metric}_score`] !== null);

  function detail(metric: Metric): string {
    if (metric === 'speed') {
      const session = latest('speed');
      if (!session) return '';
      const typical =
        session.typical_result === null ? 'DNF' : formatResult(session.typical_result);
      return `Latest session: typical ${round} ${typical}`;
    }
    if (metric === 'consistency') {
      const session = latest('consistency');
      if (!session || session.spread === null) return '';
      return `Latest session: solves vary by about ${(Math.round(session.spread * 1000) / 10).toFixed(1)}%`;
    }
    return '';
  }

  function missing(metric: Metric): string {
    const none = 'No WCA comparison for this event';
    if (!event) return none;
    if (metric === 'speed') return `Needs a full ${round} of solves`;
    if (metric === 'consistency')
      return event.consistency ? `Needs ${reference.min_pairs + 1} solves in a session` : none;
    return event.consistency ? 'Needs both other scores' : none;
  }

  const moreNeeded = 11 - sessions.length;
  const noTrend =
    moreNeeded > 0
      ? `The trend shows after ${count(moreNeeded, 'more session', 'more sessions')}`
      : 'No earlier sessions with this score to compare with';

  return (
    <>
      <section aria-labelledby="scores-heading" className="mt-8">
        <h2 id="scores-heading" className="font-semibold text-lg">
          Scores
        </h2>
        <ul className="mt-3 space-y-3">
          {metrics.map((metric) => {
            const { score, change } = cards[metric];
            const trend = change === null ? null : trendOf(change);
            return (
              <li key={metric} className="rounded-xl border border-line bg-raised p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">{names[metric]}</h3>
                  <p className="font-semibold text-3xl tabular-nums">
                    {score === null ? '-' : score.toFixed(1)}
                    {score !== null && <span className="sr-only"> out of 100</span>}
                  </p>
                </div>
                <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-inset">
                  {score !== null && (
                    <div
                      className={`h-full rounded-full ${bandColour[scoreBand(score)]}`}
                      style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                    />
                  )}
                </div>
                <p className="mt-2 text-sm">
                  {score === null
                    ? missing(metric)
                    : trend === null || change === null
                      ? noTrend
                      : trend === 'better'
                        ? `Up ${change.toFixed(1)} on the 10 sessions before`
                        : trend === 'lower'
                          ? `Down ${Math.abs(change).toFixed(1)} on the 10 sessions before`
                          : 'Steady'}
                </p>
                {score !== null && detail(metric) && (
                  <p className="text-muted text-sm">{detail(metric)}</p>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-muted text-sm">
          {event
            ? `Each score is the percentage of WCA competitors in ${eventName(eventId)} a session beats, using official results from ${longDate(reference.window_start)} to ${longDate(reference.export_date)}, averaged over your 10 latest sessions. `
            : `There isn't enough WCA data to score ${eventName(eventId)}. `}
          <a
            href={scoresGuide}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-ink underline underline-offset-2"
          >
            How the scores work
          </a>
          . {reference.notice}
        </p>
      </section>
      <section aria-labelledby="insights-heading" className="mt-8">
        <h2 id="insights-heading" className="font-semibold text-lg">
          Insights
        </h2>
        <ul className="mt-3 space-y-3">
          {insights(sessions).map((insight) => (
            <li key={insight.text} className="flex gap-3">
              <span
                aria-hidden="true"
                className={`mt-2 size-2 shrink-0 rounded-full ${toneColour[insight.tone]}`}
              />
              <div>
                <p className="font-medium">{insight.text}</p>
                <p className="text-muted text-sm">{insight.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
