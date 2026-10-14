import { count } from '../../lib/format.ts';
import type { ScoredSession } from './data.ts';

/*
 * The score cards and insights, the same as the desktop app's web/js/analytics.js: each card is
 * the average over the 10 latest sessions, compared with the 10 before them.
 */

export type Metric = 'speed' | 'consistency' | 'overall';
export const metrics: readonly Metric[] = ['speed', 'consistency', 'overall'];

const key = (metric: Metric) => `${metric}_score` as const;

/** The average of a score over some sessions, leaving out those without one (null if none). */
export function averageScore(sessions: readonly ScoredSession[], metric: Metric): number | null {
  const values = sessions
    .map((session) => session[key(metric)])
    .filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export interface MetricCard {
  readonly score: number | null;
  /** The change from the 10 sessions before, or null with nothing to compare with. */
  readonly change: number | null;
}

export function metricCards(sessions: readonly ScoredSession[]): Record<Metric, MetricCard> {
  const recent = sessions.slice(0, 10);
  const older = sessions.slice(10, 20);
  const card = (metric: Metric): MetricCard => {
    const score = averageScore(recent, metric);
    const before = averageScore(older, metric);
    return { score, change: score !== null && before !== null ? score - before : null };
  };
  return { speed: card('speed'), consistency: card('consistency'), overall: card('overall') };
}

/** How a score's bar is coloured, from red (needs work) to green (excellent). */
export function scoreBand(score: number): 'excellent' | 'good' | 'average' | 'poor' {
  return score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'average' : 'poor';
}

/** A change of more than 2 points counts as better or lower; anything less is steady. */
export function trendOf(change: number): 'better' | 'lower' | 'steady' {
  return change > 2 ? 'better' : change < -2 ? 'lower' : 'steady';
}

export interface Insight {
  readonly tone: 'positive' | 'negative' | 'neutral';
  readonly text: string;
  readonly detail: string;
}

export function insights(sessions: readonly ScoredSession[]): Insight[] {
  const found: Insight[] = [];
  const recent = sessions.slice(0, 10);
  const older = sessions.slice(10, 20);
  const recentOverall = averageScore(recent, 'overall');
  const olderOverall = averageScore(older, 'overall');
  const improvement =
    recentOverall !== null && olderOverall !== null ? recentOverall - olderOverall : 0;

  if (improvement > 5) {
    found.push({
      tone: 'positive',
      text: 'Strong improvement trend',
      detail: `Up ${improvement.toFixed(1)} points recently.`,
    });
  } else if (improvement < -5) {
    found.push({
      tone: 'negative',
      text: 'Performance has dipped',
      detail: 'It might be worth reviewing your technique.',
    });
  }

  const consistency = averageScore(recent, 'consistency');
  if (consistency !== null && consistency < 30) {
    found.push({
      tone: 'neutral',
      text: 'Focus on consistency',
      detail:
        "Your solves vary more than most competitors'. Try turning at a steady pace, even with a metronome.",
    });
  } else if (consistency !== null && consistency > 70) {
    found.push({
      tone: 'positive',
      text: 'Excellent consistency',
      detail: "Your solves are steadier than most competitors'.",
    });
  }

  if (sessions.length < 10) {
    found.push({
      tone: 'neutral',
      text: 'Build up more data',
      detail: `${count(10 - sessions.length, 'more session', 'more sessions')} will make these trends more reliable.`,
    });
  }

  if (found.length === 0)
    found.push({ tone: 'neutral', text: 'Keep training!', detail: 'Your performance is stable.' });
  return found;
}
