import { useState } from 'react';
import { BackLink } from '../../app/BackLink.tsx';
import { Field, fieldStyle, primaryButton, secondaryButton } from '../../app/forms.tsx';
import { PlusIcon } from '../../app/icons.tsx';
import { Sheet } from '../../app/Sheet.tsx';
import { addCube, type CubeUsage, cubeName, updateCube } from '../../db/cubes.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { StorageFullError } from '../../db/errors.ts';
import { useCubes, useCubeUsage } from '../../db/hooks.ts';
import type { Cube } from '../../db/schema.ts';
import { eventName, events } from '../../lib/events.ts';
import { count, formatResult } from '../../lib/format.ts';
import { averageSeconds, singleSeconds } from '../../lib/stats.ts';
import { formatDate } from '../../lib/time.ts';
import { isoDate, maxCubeText, maxNotes, text } from '../../lib/validation.ts';

const byType = (a: Cube, b: Cube) =>
  eventName(a.cube_type).localeCompare(eventName(b.cube_type), 'en-NZ') || a.id - b.id;

/** Your cubes, with how much each has been used. A cube is retired rather than deleted. */
export function CubesScreen() {
  const cubes = useCubes();
  const usage = useCubeUsage();
  const [editing, setEditing] = useState<Cube | 'new' | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  if (cubes === undefined) return null;

  const all = [...cubes.values()].sort(byType);
  const inUse = all.filter((cube) => cube.is_active);
  const retired = all.filter((cube) => !cube.is_active);

  return (
    <>
      <BackLink tab="more" label="More" />
      <header className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 id="screen-title" className="font-bold text-3xl tracking-tight">
          Cubes
        </h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-control bg-raised px-3 font-medium"
        >
          <PlusIcon className="size-5" />
          Add cube
        </button>
      </header>
      {all.length === 0 ? (
        <p className="mt-4 text-muted">
          No cubes yet. Add the ones you practise with, then pick one for each session to see how
          you do on each.
        </p>
      ) : (
        <>
          <CubeList cubes={inUse} usage={usage} onOpen={setEditing} />
          {inUse.length === 0 && <p className="mt-4 text-muted">Every cube is retired.</p>}
          {retired.length > 0 && (
            <section className="mt-6">
              <button
                type="button"
                aria-expanded={showRetired}
                onClick={() => setShowRetired((shown) => !shown)}
                className="min-h-11 font-medium text-accent-ink"
              >
                {showRetired ? 'Hide' : 'Show'} retired cubes ({retired.length})
              </button>
              {showRetired && <CubeList cubes={retired} usage={usage} onOpen={setEditing} />}
            </section>
          )}
        </>
      )}
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add cube' : 'Edit cube'}
      >
        {editing !== null && (
          <CubeForm
            key={editing === 'new' ? 'new' : editing.id}
            cube={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  );
}

function CubeList({
  cubes,
  usage,
  onOpen,
}: {
  readonly cubes: readonly Cube[];
  readonly usage: Map<number, CubeUsage> | undefined;
  readonly onOpen: (cube: Cube) => void;
}) {
  return (
    <ul className="mt-4 space-y-3">
      {cubes.map((cube) => {
        const used = usage?.get(cube.id);
        const name = cubeName(cube);
        const otherEvent = used?.mainEvent && used.mainEvent !== cube.cube_type;
        return (
          <li key={cube.id}>
            <button
              type="button"
              onClick={() => onOpen(cube)}
              className="block w-full rounded-xl border border-line bg-raised p-4 text-left"
            >
              <h2 className="font-semibold">{name || eventName(cube.cube_type)}</h2>
              <p className="text-muted text-sm">
                {[
                  name ? eventName(cube.cube_type) : '',
                  cube.purchase_date ? `bought ${formatDate(cube.purchase_date)}` : '',
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              {used ? (
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-muted">Used for</dt>
                    <dd className="font-medium tabular-nums">
                      {count(used.solves, 'solve', 'solves')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Best</dt>
                    <dd className="font-medium tabular-nums">
                      {formatResult(singleSeconds(used.bestSingle))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Best Ao5</dt>
                    <dd className="font-medium tabular-nums">
                      {formatResult(averageSeconds(used.bestAo5))}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-muted text-sm">No sessions with this cube yet.</p>
              )}
              {otherEvent && (
                <p className="mt-1 text-muted text-sm">
                  Bests are for {eventName(used.mainEvent)}, the event it's used most for.
                </p>
              )}
              {cube.notes && <p className="mt-2 text-sm">{cube.notes}</p>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const otherType = 'other';

function CubeForm({ cube, onDone }: { readonly cube: Cube | null; readonly onDone: () => void }) {
  const db = useDb();
  const known = cube?.cube_type ? Object.hasOwn(events, cube.cube_type) : true;
  const [type, setType] = useState(known ? (cube?.cube_type ?? '333') : otherType);
  const [customType, setCustomType] = useState(known ? '' : (cube?.cube_type ?? ''));
  const [brand, setBrand] = useState(cube?.brand ?? '');
  const [model, setModel] = useState(cube?.model ?? '');
  const [bought, setBought] = useState(cube?.purchase_date ?? '');
  const [notes, setNotes] = useState(cube?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save() {
    const checks = {
      type: text(type === otherType ? customType : type, 'The cube type', maxCubeText, true),
      brand: text(brand, 'The brand', maxCubeText),
      model: text(model, 'The model', maxCubeText),
      bought: isoDate(bought, 'The purchase date'),
      notes: text(notes, 'Notes', maxNotes),
    };
    const found: Record<string, string> = {};
    for (const [key, check] of Object.entries(checks)) if (!check.ok) found[key] = check.error;
    setErrors(found);
    if (
      !checks.type.ok ||
      !checks.brand.ok ||
      !checks.model.ok ||
      !checks.bought.ok ||
      !checks.notes.ok
    )
      return;
    const fields = {
      cube_type: checks.type.value,
      brand: checks.brand.value,
      model: checks.model.value,
      purchase_date: checks.bought.value,
      notes: checks.notes.value,
    };
    try {
      if (cube) await updateCube(db, cube.id, fields);
      else await addCube(db, fields);
      onDone();
    } catch (error) {
      setErrors({
        form:
          error instanceof StorageFullError ? error.message : "Couldn't save the cube. Try again.",
      });
    }
  }

  async function setActive(active: boolean) {
    if (!cube) return;
    await updateCube(db, cube.id, { is_active: active });
    onDone();
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
      <Field label="Type" error={type === otherType ? undefined : errors.type}>
        {(ids) => (
          <select
            {...ids}
            value={type}
            onChange={(event) => setType(event.target.value)}
            className={fieldStyle}
          >
            {Object.entries(events).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
            <option value={otherType}>Something else</option>
          </select>
        )}
      </Field>
      {type === otherType && (
        <Field label="What kind of puzzle" error={errors.type}>
          {(ids) => (
            <input
              {...ids}
              value={customType}
              onChange={(event) => setCustomType(event.target.value)}
              className={fieldStyle}
            />
          )}
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand" error={errors.brand}>
          {(ids) => (
            <input
              {...ids}
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              className={fieldStyle}
            />
          )}
        </Field>
        <Field label="Model" error={errors.model}>
          {(ids) => (
            <input
              {...ids}
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className={fieldStyle}
            />
          )}
        </Field>
      </div>
      <Field label="Bought on (optional)" error={errors.bought}>
        {(ids) => (
          <input
            {...ids}
            type="date"
            value={bought}
            onChange={(event) => setBought(event.target.value)}
            className={fieldStyle}
          />
        )}
      </Field>
      <Field label="Notes (optional)" error={errors.notes}>
        {(ids) => (
          <textarea
            {...ids}
            rows={2}
            value={notes}
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
      <button type="submit" className={`${primaryButton} w-full`}>
        {cube ? 'Save changes' : 'Add cube'}
      </button>
      {cube && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void setActive(!cube.is_active)}
            className={`${secondaryButton} w-full`}
          >
            {cube.is_active ? 'Retire cube' : 'Use this cube again'}
          </button>
          {cube.is_active && (
            <p className="text-muted text-sm">
              A retired cube stays on the sessions done with it, but isn't offered for new ones.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
