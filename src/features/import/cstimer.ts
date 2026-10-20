import type { LookaheadDb } from '../../db/database.ts';
import { withStorageErrors } from '../../db/errors.ts';
import { getMeta, setMeta } from '../../db/meta.ts';
import type { Session, Solve } from '../../db/schema.ts';
import { recomputeSessionStats } from '../../db/sessions.ts';
import {
  averageSeconds,
  roundHalfUp,
  sessionStats,
  singleSeconds,
  wcaSingleMs,
} from '../../lib/stats.ts';
import { localDate } from '../../lib/time.ts';
import { maxSolveMs } from '../../lib/validation.ts';

/*
 * CSTimer import, the same as the 3.x desktop app's speedcube/cstimer.py. A CSTimer export is a
 * JSON object mapping session keys to lists of solves, plus a "properties" key with CSTimer's
 * settings:
 *
 *   {"session1": [[[penalty, time_ms], "scramble", "comment", timestamp], ...], ...,
 *    "properties": {"sessionData": "{\"1\": {\"name\": \"Main 3x3\", ...}, ...}", ...}}
 *
 * penalty is 0 for OK, 2000 for +2, and -1 for DNF; timestamp is when the solve was done, in Unix
 * seconds. properties.sessionData (a JSON string, or an object in some versions) holds each
 * session's name and options, keyed by the number in its session key.
 */

export type CsTimerData = Readonly<Record<string, unknown>>;

export class CsTimerError extends Error {
  override readonly name = 'CsTimerError';
}

const penaltyCodes = new Map<number, 'OK' | '+2' | 'DNF'>([
  [0, 'OK'],
  [2000, '+2'],
  [-1, 'DNF'],
]);
// Timestamps before 1 January 2000 can't be real solves, so they're treated as missing.
const earliestTimestamp = 946_684_800;

/** Reads an export file's text. Throws a CsTimerError if it isn't a JSON object. */
export function readCsTimer(text: string): CsTimerData {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new CsTimerError(
      "This file isn't a CSTimer export. In CSTimer, use Export, then Export to file.",
    );
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data))
    throw new CsTimerError(
      "This file isn't a CSTimer export. In CSTimer, use Export, then Export to file.",
    );
  return data as CsTimerData;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

interface ReadSolve {
  readonly time_ms: number;
  readonly penalty: 'OK' | '+2' | 'DNF';
  readonly dnf: boolean;
  readonly scramble: string;
  readonly notes: string;
  readonly unix: number;
  readonly timestamp: string;
}

/** A Unix time as the app stores timestamps (UTC, to the millisecond). */
export function isoTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/** The date a solve was done on this device's clock, as the timer dates its sessions. */
export function solveDate(unixSeconds: number): string {
  return localDate(new Date(unixSeconds * 1000));
}

/**
 * A readable solve, or null if the row isn't shaped like a CSTimer solve, has a penalty code
 * CSTimer doesn't use, or a time that can't be real (more than 2 hours, or no time for a
 * finished solve). A missing timestamp comes back as null.
 */
function parseSolve(row: unknown, nowSeconds: number) {
  if (!Array.isArray(row) || row.length === 0 || !Array.isArray(row[0]) || row[0].length < 2)
    return null;
  const [code, timeMs] = row[0] as unknown[];
  if (!isNumber(code) || !isNumber(timeMs)) return null;
  const penalty = penaltyCodes.get(code);
  if (penalty === undefined) return null;
  if (timeMs < 0 || timeMs > maxSolveMs || (timeMs === 0 && penalty !== 'DNF')) return null;
  const stamp: unknown = row.length > 3 ? row[3] : null;
  const unix =
    isNumber(stamp) && stamp >= earliestTimestamp && stamp <= nowSeconds + 86_400 ? stamp : null;
  return {
    time_ms: roundHalfUp(timeMs),
    penalty,
    dnf: penalty === 'DNF',
    scramble: row.length > 1 && typeof row[1] === 'string' ? row[1] : '',
    notes: row.length > 2 && typeof row[2] === 'string' ? row[2].trim() : '',
    unix,
  };
}

/**
 * One session's readable solves, and how many rows couldn't be read. A solve without a usable
 * timestamp takes the one before it (or the import time, if it's the first), so it still lands
 * on a sensible day and in the right order.
 */
function readableSolves(rows: readonly unknown[], nowSeconds: number) {
  const solves: ReadSolve[] = [];
  let unreadable = 0;
  let previous: number | null = null;
  for (const row of rows) {
    const solve = parseSolve(row, nowSeconds);
    if (solve === null) {
      unreadable += 1;
      continue;
    }
    const unix: number = solve.unix ?? previous ?? nowSeconds;
    previous = unix;
    solves.push({ ...solve, unix, timestamp: isoTime(unix) });
  }
  return { solves, unreadable };
}

/** properties.sessionData by session key, or nothing if it's missing or unreadable. */
function sessionData(data: CsTimerData): Map<string, Record<string, unknown>> {
  const properties = data.properties;
  let found: unknown =
    properties && typeof properties === 'object'
      ? (properties as Record<string, unknown>).sessionData
      : null;
  if (typeof found === 'string') {
    try {
      found = JSON.parse(found);
    } catch {
      found = null;
    }
  }
  const sessions = new Map<string, Record<string, unknown>>();
  if (!found || typeof found !== 'object' || Array.isArray(found)) return sessions;
  for (const [number, info] of Object.entries(found))
    if (info && typeof info === 'object' && !Array.isArray(info))
      sessions.set(`session${number}`, info as Record<string, unknown>);
  return sessions;
}

/** CSTimer's name for each session key. */
export function sessionNames(data: CsTimerData): Map<string, string> {
  const names = new Map<string, string>();
  for (const [key, info] of sessionData(data)) {
    const name = info.name;
    if (name !== null && name !== undefined && String(name).trim())
      names.set(key, String(name).trim());
  }
  return names;
}

// CSTimer's scramble type for each WCA event (the "WCA" group of its scramble menu), and the event
// it is here. Fewest Moves, FTO, and Multi-Blind (scored in points) suggest nothing.
const csTimerEvents: Readonly<Record<string, string>> = {
  '333': '333',
  '222so': '222',
  '444wca': '444',
  '555wca': '555',
  '666wca': '666',
  '777wca': '777',
  '333ni': '333bf',
  '333oh': '333oh',
  clkwca: 'clock',
  mgmp: 'minx',
  pyrso: 'pyram',
  skbso: 'skewb',
  sqrs: 'sq1',
  '444bld': '444bf',
  '555bld': '555bf',
};

/** The event each session is for, where its own options name a scramble type for one. */
export function sessionEvents(data: CsTimerData): Map<string, string> {
  const events = new Map<string, string>();
  for (const [key, info] of sessionData(data)) {
    const options = info.opt;
    const type =
      options && typeof options === 'object'
        ? (options as Record<string, unknown>).scrType
        : undefined;
    if (typeof type === 'string' && Object.hasOwn(csTimerEvents, type))
      events.set(key, csTimerEvents[type] as string);
  }
  return events;
}

/** Each session in the export, in the file's order, with its name. */
function* sessionsIn(data: CsTimerData): Generator<{ key: string; name: string; rows: unknown[] }> {
  const names = sessionNames(data);
  for (const [key, rows] of Object.entries(data)) {
    if (key === 'properties' || !Array.isArray(rows)) continue;
    const number = key.startsWith('session') ? key.slice('session'.length) : '';
    yield { key, name: names.get(key) || (/^\d+$/.test(number) ? `Session ${number}` : key), rows };
  }
}

/**
 * Which of these solves are already here (in any event): one with the same timestamp and time, to
 * the millisecond, is the same solve imported before.
 */
async function alreadyImported(
  db: LookaheadDb,
  solves: readonly ReadSolve[],
): Promise<Set<number>> {
  if (solves.length === 0) return new Set();
  const stamps = solves.map((solve) => solve.timestamp).sort();
  const rows = await db.solves
    .where('timestamp')
    .between(stamps[0] as string, stamps.at(-1) as string, true, true)
    .toArray();
  const existing = new Set(rows.map((row) => `${row.timestamp} ${row.time_ms}`));
  const found = new Set<number>();
  solves.forEach((solve, i) => {
    if (existing.has(`${solve.timestamp} ${solve.time_ms}`)) found.add(i);
  });
  return found;
}

export interface PreviewSession {
  readonly key: string;
  readonly name: string;
  readonly suggested_event: string | null;
  readonly solve_count: number;
  readonly unreadable: number;
  readonly first_date: string | null;
  readonly last_date: string | null;
  readonly days: number;
  readonly already_imported: number;
  readonly best: number | null;
  readonly worst: number | null;
  readonly mean: number | null;
}

/**
 * A summary of each session for the picker: its name, the event CSTimer says it's for, how many
 * solves can (and can't) be read, the days they span, how many are already here, and the best,
 * worst, and mean in seconds (+2s included, DNFs left out). Without a database, nothing counts as
 * already here.
 */
export async function previewCsTimer(
  data: CsTimerData,
  db: LookaheadDb | null,
  nowSeconds = Date.now() / 1000,
): Promise<PreviewSession[]> {
  const events = sessionEvents(data);
  const sessions: PreviewSession[] = [];
  for (const { key, name, rows } of sessionsIn(data)) {
    const { solves, unreadable } = readableSolves(rows, nowSeconds);
    const results = solves
      .filter((solve) => !solve.dnf)
      .map((solve) => wcaSingleMs(solve.time_ms + (solve.penalty === '+2' ? 2000 : 0)));
    const days = [...new Set(solves.map((solve) => solveDate(solve.unix)))].sort();
    sessions.push({
      key,
      name,
      suggested_event: events.get(key) ?? null,
      solve_count: solves.length,
      unreadable,
      first_date: days[0] ?? null,
      last_date: days.at(-1) ?? null,
      days: days.length,
      already_imported: db ? (await alreadyImported(db, solves)).size : 0,
      best: results.length ? singleSeconds(Math.min(...results)) : null,
      worst: results.length ? singleSeconds(Math.max(...results)) : null,
      mean: results.length
        ? averageSeconds(results.reduce((a, b) => a + b, 0) / results.length)
        : null,
    });
  }
  return sessions;
}

export interface ImportResult {
  readonly sessions_imported: number;
  readonly total_solves: number;
  readonly duplicates_skipped: number;
  readonly unreadable_skipped: number;
  readonly sessions_found: number;
}

/**
 * Imports the chosen sessions as sessions of `eventId`, or of the event `events` gives a session
 * by its key, keeping each solve's time, penalty, scramble, comment (as its note), and timestamp.
 * With `splitByDay`, each becomes one session for each day it has solves on; otherwise one
 * session, dated by its first solve. Solves already here are skipped, so importing the same file
 * twice doesn't double anything. All or nothing. The backup reminder counts what comes in.
 */
export async function importCsTimer(
  db: LookaheadDb,
  data: CsTimerData,
  options: {
    readonly keys: readonly string[];
    readonly eventId: string;
    readonly splitByDay: boolean;
    readonly events?: ReadonlyMap<string, string>;
  },
  now = new Date(),
): Promise<ImportResult> {
  const nowSeconds = now.getTime() / 1000;
  const selected = new Set(options.keys);
  return withStorageErrors(() =>
    db.transaction('rw', db.sessions, db.solves, db.meta, async () => {
      const result = {
        sessions_imported: 0,
        total_solves: 0,
        duplicates_skipped: 0,
        unreadable_skipped: 0,
        sessions_found: 0,
      };
      for (const { key, name, rows } of sessionsIn(data)) {
        if (!selected.has(key)) continue;
        result.sessions_found += 1;
        const read = readableSolves(rows, nowSeconds);
        result.unreadable_skipped += read.unreadable;
        const duplicates = await alreadyImported(db, read.solves);
        result.duplicates_skipped += duplicates.size;
        const solves = read.solves.filter((_, i) => !duplicates.has(i));

        const groups = new Map<string, ReadSolve[]>();
        for (const solve of solves) {
          const day = solveDate(options.splitByDay ? solve.unix : (solves[0] as ReadSolve).unix);
          const group = groups.get(day);
          if (group) group.push(solve);
          else groups.set(day, [solve]);
        }

        for (const [day, daySolves] of groups) {
          const sessionId = await db.sessions.add({
            date: day,
            event_id: options.events?.get(key) ?? options.eventId,
            cube_id: null,
            notes: `Imported from CSTimer: ${name}`,
            created_at: now.toISOString(),
            ...sessionStats([]),
          } as Session);
          await db.solves.bulkAdd(
            daySolves.map(
              (solve, i) =>
                ({
                  session_id: sessionId,
                  solve_number: i + 1,
                  time_ms: solve.time_ms,
                  scramble: solve.scramble,
                  penalty: solve.penalty,
                  dnf: solve.dnf,
                  notes: solve.notes,
                  timestamp: solve.timestamp,
                }) as Solve,
            ),
          );
          await recomputeSessionStats(db, sessionId);
          result.sessions_imported += 1;
          result.total_solves += daySolves.length;
        }
      }
      if (result.total_solves > 0)
        await setMeta(
          db,
          'importedSinceBackup',
          (await getMeta(db, 'importedSinceBackup')) + result.total_solves,
        );
      return result;
    }),
  );
}

/** "Imported 120 solves into 3 sessions", and anything left out and why, as the desktop says it. */
export function importMessage(result: ImportResult): string {
  const plural = (n: number, word: string) =>
    `${n.toLocaleString('en-NZ')} ${word}${n === 1 ? '' : 's'}`;
  let message = `Imported ${plural(result.total_solves, 'solve')} into ${plural(result.sessions_imported, 'session')}`;
  const extras: string[] = [];
  if (result.duplicates_skipped)
    extras.push(`${result.duplicates_skipped.toLocaleString('en-NZ')} already in the app`);
  if (result.unreadable_skipped)
    extras.push(`${result.unreadable_skipped.toLocaleString('en-NZ')} that couldn't be read`);
  if (extras.length) message += ` (skipped ${extras.join(' and ')})`;
  return `${message}.`;
}
