import type { Solve } from '../../db/schema.ts';
import { onlyDnf } from '../../db/solves.ts';
import { formatClock, formatResult } from '../../lib/format.ts';
import { averageSeconds, type Result, singleSeconds } from '../../lib/stats.ts';
import type { Penalty } from '../timer/clock.ts';

/** A solve's result as the app shows it. */
export function resultText(solve: Pick<Solve, 'time_ms' | 'penalty' | 'dnf'>): string {
  if (solve.dnf) return 'DNF';
  if (solve.penalty === '+2')
    return `${formatClock(singleSeconds(solve.time_ms + 2000) ?? 0)} (+2)`;
  return formatClock(singleSeconds(solve.time_ms) ?? 0);
}

export const timerAverages = [
  { label: 'Ao5', key: 'ao5', size: 5 },
  { label: 'Ao12', key: 'ao12', size: 12 },
] as const;

export function averageText(value: Result | undefined, size: number, solvesSoFar: number): string {
  return value == null && solvesSoFar >= size ? 'DNF' : formatResult(averageSeconds(value ?? null));
}

function penaltyOf(solve: Pick<Solve, 'penalty' | 'dnf'>): Penalty {
  return solve.dnf ? 'DNF' : solve.penalty === '+2' ? '+2' : 'OK';
}

export function PenaltyButtons({
  solve,
  onChange,
  disabled = false,
}: {
  readonly solve: Solve;
  readonly onChange: (penalty: Penalty) => void;
  readonly disabled?: boolean;
}) {
  const current = penaltyOf(solve);
  const fixed = onlyDnf(solve);
  return (
    <div className="flex overflow-hidden rounded-lg border border-control">
      {(['OK', '+2', 'DNF'] as const).map((penalty) => (
        <button
          key={penalty}
          type="button"
          aria-pressed={current === penalty}
          disabled={disabled || (fixed && penalty !== 'DNF')}
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
