import { useState } from 'react';
import { tabHref } from '../../app/router.ts';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useCubes, useSessions, useStoredCounts } from '../../db/hooks.ts';
import type { Cube, Session } from '../../db/schema.ts';
import { eventName } from '../../lib/events.ts';
import { count, formatResult } from '../../lib/format.ts';
import { averageSeconds, singleSeconds } from '../../lib/stats.ts';
import { formatDate } from '../../lib/time.ts';

const pageSize = 50;

export function SessionsScreen() {
  const [limit, setLimit] = useState(pageSize);
  const sessions = useSessions(limit);
  const cubes = useCubes();
  const counts = useStoredCounts();

  return (
    <>
      <ScreenHeader title="Sessions" />
      {sessions === undefined || counts === undefined ? null : sessions.length === 0 ? (
        <p className="mt-6 text-muted">
          No sessions yet. To bring your solves across from the desktop app, make a backup there,
          then restore it on the{' '}
          <a
            href={tabHref('more')}
            className="font-medium text-accent-ink underline underline-offset-2"
          >
            More
          </a>{' '}
          tab.
        </p>
      ) : (
        <>
          <p className="mt-2 text-muted text-sm">
            {count(counts.sessions, 'session', 'sessions')},{' '}
            {count(counts.solves, 'solve', 'solves')}
          </p>
          <ul className="mt-4 space-y-3">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                cube={cubes?.get(session.cube_id ?? -1)}
              />
            ))}
          </ul>
          {sessions.length < counts.sessions && (
            <button
              type="button"
              onClick={() => setLimit((current) => current + pageSize)}
              className="mt-4 min-h-12 w-full rounded-xl border border-control bg-raised font-medium"
            >
              Show more sessions
            </button>
          )}
        </>
      )}
    </>
  );
}

function SessionCard({
  session,
  cube,
}: {
  readonly session: Session;
  readonly cube: Cube | undefined;
}) {
  const stats: ReadonlyArray<readonly [string, string]> = [
    ['Best', formatResult(singleSeconds(session.best_single))],
    ['Ao5', formatResult(averageSeconds(session.ao5))],
    ['Ao12', formatResult(averageSeconds(session.ao12))],
    ['Mean', formatResult(averageSeconds(session.session_mean))],
  ];
  const cubeName = cube ? [cube.brand, cube.model].filter(Boolean).join(' ') : '';

  return (
    <li className="rounded-xl border border-line bg-raised p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-semibold">
          {session.date ? formatDate(session.date) : 'No date'}, {eventName(session.event_id)}
        </h2>
        <p className="text-muted text-sm">{count(session.solve_count, 'solve', 'solves')}</p>
      </div>
      {(cubeName || session.notes) && (
        <p className="mt-1 text-muted text-sm">
          {[cubeName, session.notes].filter(Boolean).join(' · ')}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
