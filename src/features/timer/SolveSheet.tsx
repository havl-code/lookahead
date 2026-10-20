import { useEffect, useState } from 'react';
import { Field, fieldStyle, secondaryButton } from '../../app/forms.tsx';
import { Sheet } from '../../app/Sheet.tsx';
import type { Solve } from '../../db/schema.ts';
import { formatMoment } from '../../lib/time.ts';
import { maxNotes, text } from '../../lib/validation.ts';
import type { Penalty } from './clock.ts';
import { PenaltyButtons, resultText } from './TimerScreen.tsx';

/** One solve: its result, scramble, and when, with its penalty, notes, and Delete. */
export function SolveSheet({
  solve,
  onClose,
  onPenalty,
  onNotes,
  onDelete,
}: {
  readonly solve: Solve | null;
  readonly onClose: () => void;
  readonly onPenalty: (solve: Solve, penalty: Penalty) => void;
  readonly onNotes: (solve: Solve, notes: string) => Promise<void>;
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
          <NotesField key={solve.id} solve={solve} onSave={(notes) => onNotes(solve, notes)} />
        </div>
      )}
    </Sheet>
  );
}

function NotesField({
  solve,
  onSave,
}: {
  readonly solve: Solve;
  readonly onSave: (notes: string) => Promise<void>;
}) {
  const saved = solve.notes ?? '';
  const [notes, setNotes] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  useEffect(() => setNotes(saved), [saved]);

  async function save() {
    const checked = text(notes, 'A note', maxNotes);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    try {
      await onSave(checked.value);
      setStatus('Note saved.');
    } catch {
      setError("Couldn't save the note. This device may be out of space.");
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
        <button type="submit" disabled={notes.trim() === saved} className={secondaryButton}>
          Save note
        </button>
        <p role="status" className="text-muted text-sm">
          {status}
        </p>
      </div>
    </form>
  );
}
