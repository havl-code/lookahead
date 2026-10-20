import { useState } from 'react';
import { Field, fieldStyle, primaryButton } from '../../app/forms.tsx';
import { Sheet } from '../../app/Sheet.tsx';
import { cubeName } from '../../db/cubes.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { StorageFullError } from '../../db/errors.ts';
import { useCubes } from '../../db/hooks.ts';
import type { Cube, Session } from '../../db/schema.ts';
import { addSession, updateSession } from '../../db/sessions.ts';
import { eventName, events } from '../../lib/events.ts';
import { localDate } from '../../lib/time.ts';
import { isoDate, maxNotes, text } from '../../lib/validation.ts';

/** A cube as menus list it: its type, then its brand and model. */
export function cubeLabel(cube: Cube): string {
  const name = cubeName(cube);
  const type = eventName(cube.cube_type);
  return `${name ? `${name}, ` : ''}${type}${cube.is_active ? '' : ' (retired)'}`;
}

/** The cubes a session can pick: those in use, and the one it already has, even if retired. */
export function cubeChoices(cubes: Map<number, Cube> | undefined, current: number | null): Cube[] {
  return [...(cubes?.values() ?? [])]
    .filter((cube) => cube.is_active || cube.id === current)
    .sort((a, b) => cubeLabel(a).localeCompare(cubeLabel(b), 'en-NZ'));
}

/**
 * Adds a session by hand (for today, or an earlier day), or edits one: its date, cube, and notes.
 * Its event can't change, since its times belong to that event.
 */
export function SessionSheet({
  open,
  onClose,
  session,
  onAdded,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The session to edit, or null to add one. */
  readonly session: Session | null;
  readonly onAdded?: (sessionId: number) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={session ? 'Edit session' : 'Add session'}>
      <SessionForm
        key={session?.id ?? 'new'}
        session={session}
        onDone={(sessionId) => {
          onClose();
          if (!session) onAdded?.(sessionId);
        }}
      />
    </Sheet>
  );
}

function SessionForm({
  session,
  onDone,
}: {
  readonly session: Session | null;
  readonly onDone: (sessionId: number) => void;
}) {
  const db = useDb();
  const cubes = useCubes();
  const today = localDate();
  const [eventId, setEventId] = useState(session?.event_id ?? '333');
  const [date, setDate] = useState(session?.date ?? today);
  const [cubeId, setCubeId] = useState(session?.cube_id ?? null);
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [errors, setErrors] = useState<{ date?: string; notes?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    const checkedDate = isoDate(date, 'The date', { today, required: true });
    const checkedNotes = text(notes, 'Notes', maxNotes);
    const found = {
      ...(checkedDate.ok ? {} : { date: checkedDate.error }),
      ...(checkedNotes.ok ? {} : { notes: checkedNotes.error }),
    };
    setErrors(found);
    if (!checkedDate.ok || !checkedNotes.ok || checkedDate.value === null) return;
    setSaving(true);
    try {
      if (session) {
        await updateSession(db, session.id, {
          date: checkedDate.value,
          cube_id: cubeId,
          notes: checkedNotes.value,
        });
        onDone(session.id);
      } else {
        onDone(
          await addSession(db, {
            eventId,
            date: checkedDate.value,
            cubeId,
            notes: checkedNotes.value,
          }),
        );
      }
    } catch (error) {
      setErrors({
        form:
          error instanceof StorageFullError
            ? error.message
            : "Couldn't save the session. Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const choices = cubeChoices(cubes, session?.cube_id ?? null);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-4"
    >
      {session ? (
        <p>
          <span className="text-muted">Event: </span>
          {eventName(session.event_id)}
        </p>
      ) : (
        <Field label="Event">
          {(ids) => (
            <select
              {...ids}
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              className={fieldStyle}
            >
              {Object.entries(events).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Field label="Date" error={errors.date}>
        {(ids) => (
          <input
            {...ids}
            type="date"
            value={date}
            max={today}
            required
            onChange={(event) => setDate(event.target.value)}
            className={fieldStyle}
          />
        )}
      </Field>
      <Field
        label="Cube"
        hint={choices.length === 0 ? 'Add your cubes on the More tab to pick one here.' : undefined}
      >
        {(ids) => (
          <select
            {...ids}
            value={cubeId ?? ''}
            onChange={(event) => setCubeId(event.target.value ? Number(event.target.value) : null)}
            className={fieldStyle}
          >
            <option value="">No cube</option>
            {choices.map((cube) => (
              <option key={cube.id} value={cube.id}>
                {cubeLabel(cube)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Notes" error={errors.notes}>
        {(ids) => (
          <textarea
            {...ids}
            value={notes}
            rows={2}
            onChange={(event) => setNotes(event.target.value)}
            className={`${fieldStyle} py-2`}
          />
        )}
      </Field>
      {errors.form && (
        <p role="alert" className="text-danger-ink text-sm">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={saving} className={`${primaryButton} w-full`}>
        {session ? 'Save changes' : 'Add session'}
      </button>
    </form>
  );
}
