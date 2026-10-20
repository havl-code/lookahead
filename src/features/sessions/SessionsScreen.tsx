import { useId, useState } from 'react';
import { fieldStyle, secondaryButton } from '../../app/forms.tsx';
import { ForwardIcon, PlusIcon } from '../../app/icons.tsx';
import { detailHref, tabHref, useDetail } from '../../app/router.ts';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { cubeName } from '../../db/cubes.ts';
import {
  type SessionSort,
  useCubes,
  useSessionEvents,
  useSessions,
  useStoredCounts,
} from '../../db/hooks.ts';
import type { Cube, Session } from '../../db/schema.ts';
import { eventName } from '../../lib/events.ts';
import { count, formatResult } from '../../lib/format.ts';
import { averageSeconds, singleSeconds } from '../../lib/stats.ts';
import { SessionScreen, sessionTitle } from './SessionScreen.tsx';
import { SessionSheet } from './SessionSheet.tsx';

const pageSize = 50;

/** The Sessions tab: the list, or one session when the address names it (#/sessions/12). */
export function SessionsScreen() {
  const detail = useDetail();
  const sessionId = detail === null ? null : Number(detail);
  if (sessionId !== null && Number.isInteger(sessionId) && sessionId > 0)
    return <SessionScreen key={sessionId} sessionId={sessionId} />;
  return <SessionList />;
}

function SessionList() {
  const [limit, setLimit] = useState(pageSize);
  const [eventId, setEventId] = useState<string | null>(null);
  const [sort, setSort] = useState<SessionSort>('newest');
  const [adding, setAdding] = useState(false);
  const found = useSessions(limit, eventId, sort);
  const events = useSessionEvents();
  const cubes = useCubes();
  const counts = useStoredCounts();
  const eventFilterId = useId();
  const sortId = useId();

  const add = (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-control bg-raised px-3 font-medium"
    >
      <PlusIcon className="size-5" />
      Add session
    </button>
  );

  return (
    <>
      <ScreenHeader title="Sessions">{add}</ScreenHeader>
      {found === undefined || counts === undefined ? null : counts.sessions === 0 ? (
        <p className="mt-6 text-muted">
          No sessions yet. The timer starts one each day you time a solve. To bring your solves
          across from Lookahead 3.x (the desktop app), make a backup there, then restore it on the{' '}
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
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={eventFilterId} className="block text-muted text-sm">
                Event
              </label>
              <select
                id={eventFilterId}
                value={eventId ?? ''}
                onChange={(event) => {
                  setEventId(event.target.value || null);
                  setLimit(pageSize);
                }}
                className={`${fieldStyle} bg-raised`}
              >
                <option value="">All events</option>
                {events?.map((id) => (
                  <option key={id} value={id}>
                    {eventName(id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={sortId} className="block text-muted text-sm">
                Order
              </label>
              <select
                id={sortId}
                value={sort}
                onChange={(event) => setSort(event.target.value as SessionSort)}
                className={`${fieldStyle} bg-raised`}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="best">Best single</option>
                <option value="ao5">Best Ao5</option>
              </select>
            </div>
          </div>
          <p className="mt-3 text-muted text-sm">
            {eventId === null
              ? `${count(counts.sessions, 'session', 'sessions')}, ${count(counts.solves, 'solve', 'solves')}`
              : count(found.total, 'session', 'sessions')}
          </p>
          <ul className="mt-3 space-y-3">
            {found.sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                cube={cubes?.get(session.cube_id ?? -1)}
              />
            ))}
          </ul>
          {found.sessions.length < found.total && (
            <button
              type="button"
              onClick={() => setLimit((current) => current + pageSize)}
              className={`${secondaryButton} mt-4 w-full`}
            >
              Show more sessions
            </button>
          )}
        </>
      )}
      <SessionSheet
        open={adding}
        onClose={() => setAdding(false)}
        session={null}
        onAdded={(id) => {
          window.location.hash = detailHref('sessions', String(id));
        }}
      />
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
  const cubeText = cube ? cubeName(cube) : '';

  return (
    <li>
      <a
        href={detailHref('sessions', String(session.id))}
        className="block rounded-xl border border-line bg-raised p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="font-semibold">{sessionTitle(session)}</h2>
          <p className="inline-flex items-center gap-1 text-muted text-sm">
            {count(session.solve_count, 'solve', 'solves')}
            <ForwardIcon className="size-4" />
          </p>
        </div>
        {(cubeText || session.notes) && (
          <p className="mt-1 text-muted text-sm">
            {[cubeText, session.notes].filter(Boolean).join(' · ')}
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
      </a>
    </li>
  );
}
