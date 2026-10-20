import { useId, useState } from 'react';
import { BackLink } from '../../app/BackLink.tsx';
import { dangerButton, fieldStyle, primaryButton, secondaryButton } from '../../app/forms.tsx';
import { PlusIcon } from '../../app/icons.tsx';
import { tabHref } from '../../app/router.ts';
import { Sheet } from '../../app/Sheet.tsx';
import { Toast } from '../../app/Toast.tsx';
import { cubeName } from '../../db/cubes.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { useCubes, useSession, useSessionSolves } from '../../db/hooks.ts';
import type { Session, Solve } from '../../db/schema.ts';
import { deleteSession } from '../../db/sessions.ts';
import {
  deleteSolve,
  restoreSolve,
  type SolveSort,
  setPenalty,
  setSolveNotes,
} from '../../db/solves.ts';
import { eventName } from '../../lib/events.ts';
import { count, formatResult } from '../../lib/format.ts';
import { averageSeconds, singleSeconds } from '../../lib/stats.ts';
import { formatDate } from '../../lib/time.ts';
import { CsvExportButton } from '../backup/CsvExportButton.tsx';
import { SolveSheet } from '../timer/SolveSheet.tsx';
import { resultText } from '../timer/TimerScreen.tsx';
import { AddSolveSheet } from './AddSolveSheet.tsx';
import { SessionSheet } from './SessionSheet.tsx';

const pageSize = 100;

export function sessionTitle(session: Session): string {
  return `${session.date ? formatDate(session.date) : 'No date'}, ${eventName(session.event_id)}`;
}

/** One session: its stats and every solve, with editing, adding solves, and deleting. */
export function SessionScreen({ sessionId }: { readonly sessionId: number }) {
  const db = useDb();
  const session = useSession(sessionId);
  const cubes = useCubes();
  const [sort, setSort] = useState<SolveSort>('number');
  const [limit, setLimit] = useState(pageSize);
  const solves = useSessionSolves(sessionId, sort, limit);
  const [sheet, setSheet] = useState<'edit' | 'add' | 'delete' | null>(null);
  const [openSolve, setOpenSolve] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const sortId = useId();

  if (session === undefined) return null;
  if (session === null) {
    return (
      <>
        <BackLink tab="sessions" label="Sessions" />
        <p className="mt-6">This session isn't here any more. It may have been deleted.</p>
      </>
    );
  }

  const cube = session.cube_id === null ? undefined : cubes?.get(session.cube_id);

  async function remove(solve: Solve) {
    setOpenSolve(null);
    const deleted = await deleteSolve(db, solve.id);
    if (!deleted) return;
    setToast({
      message: `Solve ${deleted.solve_number} deleted.`,
      action: {
        label: 'Undo',
        onClick: () => {
          setToast(null);
          void restoreSolve(db, deleted);
        },
      },
    });
  }

  return (
    <>
      <BackLink tab="sessions" label="Sessions" />
      <header className="mt-2">
        <h1 id="screen-title" className="font-bold text-2xl tracking-tight">
          {sessionTitle(session)}
        </h1>
        {(cube || session.notes) && (
          <p className="mt-1 text-muted">
            {[cube ? cubeName(cube) || eventName(cube.cube_type) : '', session.notes]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </header>

      <SessionNumbers session={session} />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setSheet('add')} className={primaryButton}>
          <span className="inline-flex items-center gap-1">
            <PlusIcon className="size-5" />
            Add a solve
          </span>
        </button>
        <button type="button" onClick={() => setSheet('edit')} className={secondaryButton}>
          Edit session
        </button>
      </div>

      <section aria-labelledby="solves-heading" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="solves-heading" className="font-semibold text-lg">
            Solves
          </h2>
          {session.solve_count > 1 && (
            <div className="flex items-center gap-2">
              <label htmlFor={sortId} className="shrink-0 text-muted text-sm">
                Order
              </label>
              <select
                id={sortId}
                value={sort}
                onChange={(event) => setSort(event.target.value as SolveSort)}
                className={`${fieldStyle} w-auto bg-raised`}
              >
                <option value="number">Newest first</option>
                <option value="fastest">Fastest first</option>
                <option value="slowest">Slowest first</option>
              </select>
            </div>
          )}
        </div>
        {solves === undefined ? null : solves.length === 0 ? (
          <p className="mt-2 text-muted">
            No solves yet. Time some on the Timer tab (today's session only), or add them here.
          </p>
        ) : (
          <>
            <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-raised">
              {solves.map((solve) => (
                <li key={solve.id}>
                  <button
                    type="button"
                    onClick={() => setOpenSolve(solve.id)}
                    aria-label={`Solve ${solve.solve_number}: ${resultText(solve)}${solve.notes ? `, ${solve.notes}` : ''}`}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left"
                  >
                    <span className="w-12 shrink-0 text-muted text-sm tabular-nums">
                      {solve.solve_number}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{resultText(solve)}</span>
                    {solve.notes && (
                      <span className="min-w-0 flex-1 truncate text-muted text-sm">
                        {solve.notes}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
            {solves.length < session.solve_count && (
              <button
                type="button"
                onClick={() => setLimit((current) => current + pageSize)}
                className={`${secondaryButton} mt-3 w-full`}
              >
                Show more solves
              </button>
            )}
          </>
        )}
      </section>

      {session.solve_count > 0 && <CsvExportButton sessionId={session.id} className="mt-8" />}

      <button
        type="button"
        onClick={() => setSheet('delete')}
        className={`${dangerButton} mt-8 w-full`}
      >
        Delete session
      </button>

      <SessionSheet open={sheet === 'edit'} onClose={() => setSheet(null)} session={session} />
      <AddSolveSheet open={sheet === 'add'} onClose={() => setSheet(null)} sessionId={session.id} />
      <Sheet open={sheet === 'delete'} onClose={() => setSheet(null)} title="Delete session">
        <p>
          Delete {sessionTitle(session)} and its {count(session.solve_count, 'solve', 'solves')}?
          This can't be undone, unless you have a backup.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setSheet(null)} className={secondaryButton}>
            Keep it
          </button>
          <button
            type="button"
            onClick={() => {
              void deleteSession(db, session.id).then(() => {
                window.location.hash = tabHref('sessions');
              });
            }}
            className={dangerButton}
          >
            Delete
          </button>
        </div>
      </Sheet>
      <SolveSheet
        solve={solves?.find((solve) => solve.id === openSolve) ?? null}
        onClose={() => setOpenSolve(null)}
        onPenalty={(solve, penalty) => void setPenalty(db, solve.id, penalty)}
        onNotes={(solve, notes) => setSolveNotes(db, solve.id, notes)}
        onDelete={(solve) => void remove(solve)}
      />
      {toast && (
        <Toast message={toast.message} action={toast.action} onDismiss={() => setToast(null)} />
      )}
    </>
  );
}

/** The session's numbers: the latest averages, and the bests over the whole session. */
function SessionNumbers({ session }: { readonly session: Session }) {
  const solves = session.solve_count;
  // An average that can be worked out but isn't a time is a DNF, as on the timer.
  const average = (value: number | null, size: number) =>
    value === null && solves >= size ? 'DNF' : formatResult(averageSeconds(value));
  const groups: ReadonlyArray<{
    readonly label: string;
    readonly stats: ReadonlyArray<readonly [string, string]>;
  }> = [
    {
      label: 'Session',
      stats: [
        ['Solves', solves.toLocaleString('en-NZ')],
        ['Best', formatResult(singleSeconds(session.best_single))],
        ['Worst', formatResult(singleSeconds(session.worst_single))],
        ['Mean', formatResult(averageSeconds(session.session_mean))],
      ],
    },
    {
      label: 'Latest',
      stats: [
        ['Ao5', average(session.ao5, 5)],
        ['Ao12', average(session.ao12, 12)],
      ],
    },
    {
      label: 'Best averages',
      stats: [
        ['Ao5', average(session.best_ao5, 5)],
        ['Ao12', average(session.best_ao12, 12)],
        ['Ao50', average(session.best_ao50, 50)],
        ['Ao100', average(session.best_ao100, 100)],
      ],
    },
  ];
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line bg-raised p-4">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className="text-muted text-sm">{group.label}</h2>
          <dl className="mt-1 grid grid-cols-4 gap-2">
            {group.stats.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted text-sm">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
