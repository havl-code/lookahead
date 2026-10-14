import { Sheet } from '../../app/Sheet.tsx';
import type { Solve } from '../../db/schema.ts';
import { formatMoment } from '../../lib/time.ts';
import type { Penalty } from './clock.ts';
import { PenaltyButtons, resultText } from './TimerScreen.tsx';

/** One of today's solves: its result, scramble, and when, with its penalty and Delete. */
export function SolveSheet({
  solve,
  onClose,
  onPenalty,
  onDelete,
}: {
  readonly solve: Solve | null;
  readonly onClose: () => void;
  readonly onPenalty: (solve: Solve, penalty: Penalty) => void;
  readonly onDelete: (solve: Solve) => void;
}) {
  return (
    <Sheet
      open={solve !== null}
      onClose={onClose}
      title={solve ? `Solve ${solve.solve_number}` : ''}
    >
      {solve && (
        <div className="space-y-4">
          <p className="font-semibold text-4xl tabular-nums">{resultText(solve)}</p>
          {solve.timestamp && <p className="text-muted text-sm">{formatMoment(solve.timestamp)}</p>}
          {solve.scramble && <p className="whitespace-pre-line break-words">{solve.scramble}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <PenaltyButtons solve={solve} onChange={(penalty) => onPenalty(solve, penalty)} />
            <button
              type="button"
              onClick={() => onDelete(solve)}
              className="min-h-11 rounded-lg border border-control px-4 font-medium text-danger-ink"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
