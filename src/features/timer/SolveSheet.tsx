import { useEffect, useState } from 'react';
import { Field, fieldStyle, secondaryButton } from '../../app/forms.tsx';
import { Sheet } from '../../app/Sheet.tsx';
import { useSolveAverages } from '../../db/hooks.ts';
import type { Solve } from '../../db/schema.ts';
import type { EditResult } from '../../db/solveEditing.ts';
import { formatMoment } from '../../lib/time.ts';
import { averageText, PenaltyButtons, resultText, timerAverages } from '../solves/presentation.tsx';
import type { Penalty } from './clock.ts';

/**
 * One solve: its result, when, the Ao5 and Ao12 at it, and its scramble, with its penalty, notes,
 * and Delete.
 */
export function SolveSheet({
  solve,
  onClose,
  onPenalty,
  onNotes,
  onDelete,
  pending,
}: {
  readonly solve: Solve | null;
  readonly onClose: () => void;
  readonly onPenalty: (solve: Solve, penalty: Penalty) => Promise<EditResult<boolean>>;
  readonly onNotes: (solve: Solve, notes: string) => Promise<EditResult<string>>;
  readonly onDelete: (solve: Solve) => Promise<EditResult<Solve>>;
  readonly pending: boolean;
}) {
  // Left blank until they're worked out for this solve, rather than showing another solve's.
  const loaded = useSolveAverages(solve);
  const averages = loaded && loaded.id === solve?.id ? loaded : undefined;
  return (
    <Sheet
      open={solve !== null}
      onClose={onClose}
      title={solve ? `Solve ${solve.solve_number}` : ''}
      dismissible={!pending}
    >
      {solve && (
        <div className="space-y-4">
          <p className="font-semibold text-4xl tabular-nums">{resultText(solve)}</p>
          {solve.timestamp && <p className="text-muted text-sm">{formatMoment(solve.timestamp)}</p>}
          <dl className="flex gap-6 text-sm">
            {timerAverages.map(({ label, key, size }) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="font-semibold tabular-nums">
                  {averages && averageText(averages[key], size, solve.solve_number)}
                </dd>
              </div>
            ))}
          </dl>
          {solve.scramble && <p className="whitespace-pre-line break-words">{solve.scramble}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <PenaltyButtons
              solve={solve}
              disabled={pending}
              onChange={(penalty) => void onPenalty(solve, penalty)}
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => void onDelete(solve)}
              className="min-h-11 rounded-lg border border-control px-4 font-medium text-danger-ink"
            >
              Delete
            </button>
          </div>
          <NotesField
            key={solve.id}
            solve={solve}
            pending={pending}
            onSave={(notes) => onNotes(solve, notes)}
          />
        </div>
      )}
    </Sheet>
  );
}

function NotesField({
  solve,
  onSave,
  pending,
}: {
  readonly solve: Solve;
  readonly onSave: (notes: string) => Promise<EditResult<string>>;
  readonly pending: boolean;
}) {
  const saved = solve.notes ?? '';
  const [notes, setNotes] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  useEffect(() => setNotes(saved), [saved]);

  async function save() {
    setError(null);
    const result = await onSave(notes);
    if (result.status === 'success') {
      setStatus('Note saved.');
    } else if (result.status === 'invalid') {
      setError(result.message);
    } else if (result.status === 'unavailable') {
      setError('This solve is no longer available.');
    } else if (result.status === 'error') {
      setError("Couldn't save the note. This device may be out of space.");
    } else {
      setError('Another edit is still in progress.');
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-2"
    >
      <Field label="Note" error={error}>
        {(ids) => (
          <textarea
            {...ids}
            value={notes}
            readOnly={pending}
            onChange={(event) => {
              setNotes(event.target.value);
              setStatus('');
            }}
            rows={2}
            className={`${fieldStyle} py-2`}
          />
        )}
      </Field>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || notes.trim() === saved}
          className={secondaryButton}
        >
          Save note
        </button>
        <p role="status" className="text-muted text-sm">
          {status}
        </p>
      </div>
    </form>
  );
}
