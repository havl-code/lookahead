import { useState } from 'react';
import { Field, fieldStyle, primaryButton } from '../../app/forms.tsx';
import { Sheet } from '../../app/Sheet.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { StorageFullError } from '../../db/errors.ts';
import { addSolve } from '../../db/solves.ts';
import { maxNotes, maxScramble, solveTimeMs, text } from '../../lib/validation.ts';
import type { Penalty } from '../timer/clock.ts';

/** Types in a solve timed somewhere else: its time (before any +2), penalty, scramble, and note. */
export function AddSolveSheet({
  open,
  onClose,
  sessionId,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly sessionId: number;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add a solve">
      <AddSolveForm sessionId={sessionId} />
    </Sheet>
  );
}

function AddSolveForm({ sessionId }: { readonly sessionId: number }) {
  const db = useDb();
  const [time, setTime] = useState('');
  const [penalty, setPenalty] = useState<Penalty>('OK');
  const [scramble, setScramble] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ time?: string; scramble?: string; notes?: string }>({});
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  async function save() {
    const checkedTime = solveTimeMs(time, penalty === 'DNF');
    const checkedScramble = text(scramble, 'The scramble', maxScramble);
    const checkedNotes = text(notes, 'The note', maxNotes);
    setErrors({
      ...(checkedTime.ok ? {} : { time: checkedTime.error }),
      ...(checkedScramble.ok ? {} : { scramble: checkedScramble.error }),
      ...(checkedNotes.ok ? {} : { notes: checkedNotes.error }),
    });
    setStatus('');
    if (!checkedTime.ok || !checkedScramble.ok || !checkedNotes.ok) return;
    setFailure(null);
    try {
      await addSolve(db, sessionId, {
        timeMs: checkedTime.value,
        penalty,
        scramble: checkedScramble.value,
        notes: checkedNotes.value,
      });
      // Ready for the next one, as people often type in a few in a row.
      setTime('');
      setScramble('');
      setNotes('');
      setPenalty('OK');
      setStatus('Solve added.');
    } catch (error) {
      setFailure(
        error instanceof StorageFullError ? error.message : "Couldn't add the solve. Try again.",
      );
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-4"
    >
      <Field
        label="Time"
        hint="In seconds, such as 12.34, or as 1:23.45. Leave out any +2; pick it below."
        error={errors.time}
      >
        {(ids) => (
          <input
            {...ids}
            inputMode="decimal"
            autoComplete="off"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className={`${fieldStyle} tabular-nums`}
          />
        )}
      </Field>
      <fieldset>
        <legend className="mb-1 font-medium">Penalty</legend>
        <div className="flex w-fit overflow-hidden rounded-lg border border-control">
          {(['OK', '+2', 'DNF'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={penalty === choice}
              onClick={() => setPenalty(choice)}
              className={`min-h-11 min-w-14 px-3 font-semibold ${
                penalty === choice ? 'bg-accent text-on-accent' : 'bg-raised'
              }`}
            >
              {choice}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Scramble (optional)" error={errors.scramble}>
        {(ids) => (
          <input
            {...ids}
            autoComplete="off"
            autoCapitalize="characters"
            value={scramble}
            onChange={(event) => setScramble(event.target.value)}
            className={fieldStyle}
          />
        )}
      </Field>
      <Field label="Note (optional)" error={errors.notes}>
        {(ids) => (
          <input
            {...ids}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={fieldStyle}
          />
        )}
      </Field>
      {failure && (
        <p role="alert" className="text-danger-ink text-sm">
          {failure}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" className={primaryButton}>
          Add solve
        </button>
        <p role="status" className="text-muted text-sm">
          {status}
        </p>
      </div>
    </form>
  );
}
