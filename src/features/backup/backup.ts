import { z } from 'zod';
import type { LookaheadDb } from '../../db/database.ts';
import { withStorageErrors } from '../../db/errors.ts';
import { setMeta } from '../../db/meta.ts';
import type { Cube, Session, SettingRow, Solve } from '../../db/schema.ts';
import { recomputeAllSessionStats } from '../../db/sessions.ts';
import { latestSafetyCopy, type StoredCounts, storedCounts } from '../../db/stored.ts';
import { sessionStats } from '../../lib/stats.ts';
import { localDate } from '../../lib/time.ts';

/*
 * Full-data backups, in the same JSON format as the 3.x desktop app's (speedcube/backup.py), so a
 * backup from either app restores in the other. The checks and tidy-ups are the desktop app's
 * too; the golden tests compare the two.
 */

export const backupApp = 'lookahead';
// The app was called Speedcube Training Explorer before it became Lookahead.
const knownBackupApps = new Set([backupApp, 'speedcube-training-explorer']);
const backupVersion = 1;
/** How many safety copies (what was here before a restore) are kept. */
const safetyCopiesKept = 3;

/** A message for the person, shown as it is. */
export class BackupError extends Error {
  override readonly name = 'BackupError';
}

const notABackup = 'This file does not look like a valid backup.';

// Text fields take whatever the file has, as the desktop app does, and keep it as text. Missing
// fields are null, and missing flags false.
const text = z
  .unknown()
  .optional()
  .transform((value) => (value == null ? null : String(value)));
const flag = z.unknown().optional().transform(Boolean);
const id = z.number().int();

const cubeRecord = z.object({
  id,
  cube_type: text,
  brand: text,
  model: text,
  purchase_date: text,
  notes: text,
  is_active: flag,
  created_at: text,
});

// A session's stats in the file are ignored: they're worked out again from its solves, as files
// (especially from version 2) can carry stats worked out under older rules.
const sessionRecord = z.object({
  id,
  date: text,
  event_id: text,
  cube_id: id.nullish().transform((value) => value ?? null),
  notes: text,
  created_at: text,
});

const solveRecord = z.object({
  id,
  session_id: id,
  solve_number: id,
  time_ms: z.number().nonnegative().finite(),
  scramble: text,
  penalty: text,
  dnf: flag,
  notes: text,
  timestamp: text,
});

const settingRecord = z.object({ id: z.string(), wca_id: text, wca_name: text, value: text });

const backupFile = z.object({
  app: z.unknown().optional(),
  exported_at: text.optional(),
  cubes: z.array(cubeRecord),
  sessions: z.array(sessionRecord),
  solves: z.array(solveRecord),
  settings: z.array(z.unknown()).nullish(),
});

export interface ReadBackup {
  readonly exportedAt: string | null;
  readonly cubes: readonly Cube[];
  readonly sessions: readonly Session[];
  readonly solves: readonly Solve[];
  readonly settings: readonly SettingRow[];
  /** Solves left out because their session isn't in the file. */
  readonly leftOut: number;
}

const noStats = sessionStats([]);

/** Checks a backup (the file's text, or its parsed contents) and tidies its loose ends. */
export function readBackup(contents: string | unknown): ReadBackup {
  let payload: unknown = contents;
  if (typeof contents === 'string') {
    try {
      payload = JSON.parse(contents.replace(/^﻿/, ''));
    } catch {
      throw new BackupError(notABackup);
    }
  }
  // Older backups may not say which app made them, but one that names another app isn't ours.
  if (
    payload !== null &&
    typeof payload === 'object' &&
    'app' in payload &&
    payload.app != null &&
    !knownBackupApps.has(String(payload.app))
  ) {
    throw new BackupError('This file is a backup from another app, not Lookahead.');
  }
  const parsed = backupFile.safeParse(payload);
  if (!parsed.success) throw new BackupError(notABackup);
  const file = parsed.data;

  // A solve whose session isn't in the file would be invisible everywhere in the app, and a
  // session pointing at a missing cube would show a cube that isn't there, so tidy both up.
  const sessionIds = new Set(file.sessions.map((session) => session.id));
  const cubeIds = new Set(file.cubes.map((cube) => cube.id));
  const solves = file.solves.filter((solve) => sessionIds.has(solve.session_id));
  const settings: SettingRow[] = [];
  for (const row of file.settings ?? []) {
    if (row === null || typeof row !== 'object') throw new BackupError(notABackup);
    const setting = settingRecord.safeParse(row);
    if (setting.success) settings.push(setting.data);
  }
  return {
    exportedAt: file.exported_at ?? null,
    cubes: file.cubes,
    sessions: file.sessions.map((session) => ({
      ...session,
      cube_id: session.cube_id !== null && cubeIds.has(session.cube_id) ? session.cube_id : null,
      ...noStats,
    })),
    solves,
    settings,
    leftOut: file.solves.length - solves.length,
  };
}

const cubeColumns = [
  'id',
  'cube_type',
  'brand',
  'model',
  'purchase_date',
  'notes',
  'is_active',
  'created_at',
] as const;
// The desktop app leaves the best averages out of its backups; they're worked out on restore.
const sessionColumns = [
  'id',
  'date',
  'event_id',
  'cube_id',
  'solve_count',
  'best_single',
  'worst_single',
  'session_mean',
  'ao5',
  'ao12',
  'notes',
  'created_at',
] as const;
const solveColumns = [
  'id',
  'session_id',
  'solve_number',
  'time_ms',
  'scramble',
  'penalty',
  'dnf',
  'notes',
  'timestamp',
] as const;
const settingColumns = ['id', 'wca_id', 'wca_name', 'value'] as const;

function pick<T, K extends keyof T>(record: T, columns: readonly K[]): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const column of columns) picked[column] = record[column];
  return picked;
}

export interface Backup {
  app: string;
  version: number;
  exported_at: string;
  cubes: Pick<Cube, (typeof cubeColumns)[number]>[];
  sessions: Pick<Session, (typeof sessionColumns)[number]>[];
  solves: Pick<Solve, (typeof solveColumns)[number]>[];
  settings: Pick<SettingRow, (typeof settingColumns)[number]>[];
}

/** Everything on this device, as a backup. */
export async function exportBackup(db: LookaheadDb, now = new Date()): Promise<Backup> {
  return db.transaction('r', db.cubes, db.sessions, db.solves, db.settings, async () => ({
    app: backupApp,
    version: backupVersion,
    exported_at: now.toISOString(),
    cubes: (await db.cubes.toArray()).map((cube) => pick(cube, cubeColumns)),
    sessions: (await db.sessions.toArray()).map((session) => pick(session, sessionColumns)),
    solves: (await db.solves.toArray()).map((solve) => pick(solve, solveColumns)),
    settings: (await db.settings.toArray()).map((row) => pick(row, settingColumns)),
  }));
}

export interface CreatedBackup {
  readonly file: File;
  readonly sessions: number;
  readonly solves: number;
}

export async function createBackupFile(db: LookaheadDb, now = new Date()): Promise<CreatedBackup> {
  const backup = await exportBackup(db, now);
  const file = new File([JSON.stringify(backup)], `lookahead-backup-${localDate(now)}.json`, {
    type: 'application/json',
  });
  return { file, sessions: backup.sessions.length, solves: backup.solves.length };
}

async function replaceEverything(db: LookaheadDb, backup: ReadBackup): Promise<void> {
  await Promise.all([
    db.cubes.clear(),
    db.sessions.clear(),
    db.solves.clear(),
    db.settings.clear(),
  ]);
  await db.cubes.bulkPut([...backup.cubes]);
  await db.sessions.bulkPut([...backup.sessions]);
  await db.solves.bulkPut([...backup.solves]);
  await db.settings.bulkPut([...backup.settings]);
  await recomputeAllSessionStats(db);
}

const allTables = (db: LookaheadDb) => [
  db.cubes,
  db.sessions,
  db.solves,
  db.settings,
  db.safetyCopies,
  db.meta,
];

/**
 * Replaces everything on this device with the backup's, all at once, so a failure changes nothing.
 * What was here is kept first as a safety copy (unless there was nothing), so it can be put back.
 */
export async function restoreBackup(
  db: LookaheadDb,
  backup: ReadBackup,
  now = new Date(),
): Promise<StoredCounts> {
  await withStorageErrors(() =>
    db.transaction('rw', allTables(db), async () => {
      const here = await storedCounts(db);
      if (here.cubes + here.sessions + here.solves > 0) {
        await db.safetyCopies.add({
          made_at: now.toISOString(),
          backup: await exportBackup(db, now),
        });
        const ids = await db.safetyCopies.orderBy('made_at').primaryKeys();
        await db.safetyCopies.bulkDelete(ids.slice(0, -safetyCopiesKept));
      }
      await replaceEverything(db, backup);
      await setMeta(db, 'restoredAt', now.getTime());
      await setMeta(db, 'importedSinceBackup', 0);
    }),
  );
  return storedCounts(db);
}

/** Puts back what was here before the last restore, and forgets that copy. */
export async function undoLastRestore(db: LookaheadDb): Promise<StoredCounts> {
  await withStorageErrors(() =>
    db.transaction('rw', allTables(db), async () => {
      const copy = await latestSafetyCopy(db);
      if (copy?.id === undefined) throw new BackupError('There is no restore to undo.');
      await replaceEverything(db, readBackup(copy.backup));
      await db.safetyCopies.delete(copy.id);
      // What comes back may never have been backed up.
      await setMeta(db, 'restoredAt', null);
    }),
  );
  return storedCounts(db);
}
