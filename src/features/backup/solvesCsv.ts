import type { LookaheadDb } from '../../db/database.ts';
import type { Cube, Session, Solve } from '../../db/schema.ts';
import { eventName } from '../../lib/events.ts';
import { singleSeconds } from '../../lib/stats.ts';
import { localDate } from '../../lib/time.ts';

/*
 * Solves as CSV, for spreadsheets: the same columns, order, and file as the 3.x desktop app's
 * /api/export/solves.csv (speedcube/api.py). The golden tests compare the two.
 */

export const csvColumns = [
  'session_id',
  'session_date',
  'event_id',
  'event',
  'cube',
  'solve_number',
  'time_seconds',
  'penalty',
  'result_seconds',
  'scramble',
  'notes',
  'timestamp',
] as const;

// Spreadsheets treat a cell starting with one of these as a formula, so text from you or an
// imported file gets a leading ' to keep it as text.
const formulaStarts = ['=', '+', '-', '@', '\t', '\r'];

function asText(value: string | null): string {
  const text = value ?? '';
  return formulaStarts.some((start) => text.startsWith(start)) ? `'${text}` : text;
}

function cubeName(cube: Cube | undefined): string {
  if (!cube || cube.cube_type === null) return '';
  const name = [cube.brand, cube.model].filter(Boolean).join(' ') || 'Unnamed cube';
  return `${name} (${eventName(cube.cube_type)})`;
}

/** A cell as Python's csv module writes it: quoted only if it has to be. */
function cell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function row(session: Session, cube: Cube | undefined, solve: Solve): (string | number)[] {
  const penalty = solve.dnf ? 'DNF' : solve.penalty === '+2' ? '+2' : 'OK';
  const result = solve.dnf ? null : singleSeconds(solve.time_ms + (penalty === '+2' ? 2000 : 0));
  return [
    session.id,
    session.date ?? '',
    session.event_id ?? '',
    session.event_id === null ? '' : eventName(session.event_id),
    asText(cubeName(cube)),
    solve.solve_number,
    (solve.time_ms / 1000).toFixed(3),
    penalty,
    result === null ? '' : result.toFixed(2),
    asText(solve.scramble),
    asText(solve.notes),
    solve.timestamp ?? '',
  ];
}

// Sessions without a date come first, as SQLite sorts them on the desktop.
const bySessionDate = (a: Session, b: Session) =>
  a.date === b.date
    ? a.id - b.id
    : a.date === null
      ? -1
      : b.date === null
        ? 1
        : a.date < b.date
          ? -1
          : 1;
const inSolveOrder = (a: Solve, b: Solve) => a.solve_number - b.solve_number || a.id - b.id;

/**
 * Every solve, or one session's, as CSV: one row a solve, by session date, then session, then
 * solve number. It starts with a byte order mark, so Excel reads it as UTF-8.
 */
export async function solvesCsv(db: LookaheadDb, sessionId: number | null = null): Promise<string> {
  return db.transaction('r', db.sessions, db.solves, db.cubes, async () => {
    const sessions =
      sessionId === null
        ? await db.sessions.toArray()
        : [await db.sessions.get(sessionId)].filter((s): s is Session => s !== undefined);
    const cubes = new Map((await db.cubes.toArray()).map((cube) => [cube.id, cube]));
    const solves = new Map<number, Solve[]>();
    const rows =
      sessionId === null
        ? await db.solves.toArray()
        : await db.solves.where('session_id').equals(sessionId).toArray();
    for (const solve of rows) {
      const list = solves.get(solve.session_id);
      if (list) list.push(solve);
      else solves.set(solve.session_id, [solve]);
    }

    const lines = [csvColumns.join(',')];
    for (const session of sessions.sort(bySessionDate)) {
      const cube = session.cube_id === null ? undefined : cubes.get(session.cube_id);
      for (const solve of (solves.get(session.id) ?? []).sort(inSolveOrder))
        lines.push(row(session, cube, solve).map(cell).join(','));
    }
    return `﻿${lines.map((line) => `${line}\r\n`).join('')}`;
  });
}

/** The CSV as a file to save, named as the desktop app names it. */
export async function solvesCsvFile(
  db: LookaheadDb,
  sessionId: number | null = null,
  now = new Date(),
): Promise<File> {
  const which = sessionId === null ? '' : `session-${sessionId}-`;
  return new File(
    [await solvesCsv(db, sessionId)],
    `lookahead-solves-${which}${localDate(now)}.csv`,
    {
      type: 'text/csv',
    },
  );
}
