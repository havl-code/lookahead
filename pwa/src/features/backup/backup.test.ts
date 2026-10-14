import { describe, expect, it } from 'vitest';
import type { LookaheadDb } from '../../db/database.ts';
import { setMeta } from '../../db/meta.ts';
import { saveTimedSolve } from '../../db/solves.ts';
import { latestSafetyCopy, storedCounts, unbackedSolves } from '../../db/stored.ts';
import { createTestDb } from '../../test/db.ts';
import {
  BackupError,
  createBackupFile,
  exportBackup,
  readBackup,
  restoreBackup,
  undoLastRestore,
} from './backup.ts';
import untidy from './golden/backup-untidy.json' with { type: 'json' };
import v2 from './golden/backup-v2.json' with { type: 'json' };
import v3 from './golden/backup-v3.json' with { type: 'json' };

// Each golden file holds a backup and what the desktop app exports after restoring it
// (tools/build_pwa_golden.py), so these check that both apps restore a backup the same way.
const goldens = { 'a 3.x backup': v3, 'a 2.x backup': v2, 'a backup with loose ends': untidy };

async function restored(golden: { backup: unknown }): Promise<LookaheadDb> {
  const db = createTestDb();
  await restoreBackup(db, readBackup(JSON.stringify(golden.backup)));
  return db;
}

function withoutTime<T extends { exported_at?: string }>(backup: T): Omit<T, 'exported_at'> {
  const { exported_at: _, ...rest } = backup;
  return rest;
}

describe('restoring', () => {
  it.each(Object.entries(goldens))('restores %s as the desktop app does', async (_, golden) => {
    const db = await restored(golden);
    expect(withoutTime(await exportBackup(db))).toEqual(golden.desktop.exported);
    expect(readBackup(golden.backup).leftOut).toBe(golden.desktop.leftOut);
    // Including the best averages, which backups leave out
    for (const [id, stats] of Object.entries(golden.desktop.stats)) {
      expect(await db.sessions.get(Number(id))).toMatchObject(stats);
    }
  });

  it('reads a file that starts with a byte order mark', () => {
    expect(readBackup(`﻿${JSON.stringify(v3.backup)}`).solves).toHaveLength(7);
  });

  it.each([
    ['text that is not JSON', '{"cubes": ['],
    ['not an object', '"not an object"'],
    ['a list', '[]'],
    ['no solves', '{"cubes": [], "sessions": []}'],
    ['sessions that are not a list', '{"cubes": [], "sessions": "x", "solves": []}'],
    ['a cube that is not a record', '{"cubes": [1], "sessions": [], "solves": []}'],
    [
      'a solve with no time',
      '{"cubes": [], "sessions": [{"id": 1}], "solves": [{"id": 1, "session_id": 1, "solve_number": 1}]}',
    ],
    [
      'a setting that is not a record',
      '{"cubes": [], "sessions": [], "solves": [], "settings": [1]}',
    ],
  ])('turns down %s', (_, text) => {
    expect(() => readBackup(text)).toThrow(
      new BackupError('This file does not look like a valid backup.'),
    );
  });

  it('turns down a backup from another app', () => {
    expect(() => readBackup(JSON.stringify({ ...v3.backup, app: 'cstimer' }))).toThrow(
      'This file is a backup from another app, not Lookahead.',
    );
  });

  it('changes nothing when a restore fails', async () => {
    const db = await restored(v3);
    const before = await exportBackup(db);
    const broken = readBackup(v3.backup);
    // A solve that can't be stored makes the whole restore fail part way through.
    const solves = [...broken.solves, { ...broken.solves[0], id: Number.NaN }];
    await expect(restoreBackup(db, { ...broken, solves } as typeof broken)).rejects.toThrow();
    expect(withoutTime(await exportBackup(db))).toEqual(withoutTime(before));
  });
});

describe('backing up', () => {
  it('makes a file that restores to the same data', async () => {
    const db = await restored(untidy);
    const { file, sessions, solves } = await createBackupFile(db, new Date(2026, 9, 14, 9));
    expect(file.name).toBe('lookahead-backup-2026-10-14.json');
    expect([sessions, solves]).toEqual([2, 30]);

    const other = createTestDb();
    await restoreBackup(other, readBackup(await file.text()));
    expect(withoutTime(await exportBackup(other))).toEqual(withoutTime(await exportBackup(db)));
  });

  it('names the app and the time', async () => {
    const backup = await exportBackup(createTestDb(), new Date('2026-10-14T03:00:00.000Z'));
    expect(backup).toMatchObject({
      app: 'lookahead',
      version: 1,
      exported_at: '2026-10-14T03:00:00.000Z',
    });
  });
});

describe('undoing a restore', () => {
  it('puts back what was here before', async () => {
    const db = await restored(v3);
    const before = withoutTime(await exportBackup(db));
    await restoreBackup(db, readBackup(v2.backup));
    expect((await storedCounts(db)).solves).toBe(5);

    await undoLastRestore(db);
    expect(withoutTime(await exportBackup(db))).toEqual(before);
    expect(await latestSafetyCopy(db)).toBeUndefined();
  });

  it('keeps no copy when there was nothing here', async () => {
    const db = await restored(v3);
    expect(await latestSafetyCopy(db)).toBeUndefined();
    await expect(undoLastRestore(db)).rejects.toThrow('There is no restore to undo.');
  });

  it('keeps only the newest three copies', async () => {
    const db = await restored(v3);
    for (let day = 1; day <= 5; day++) {
      await restoreBackup(db, readBackup(day % 2 ? v2.backup : v3.backup), new Date(2026, 9, day));
    }
    expect(await db.safetyCopies.count()).toBe(3);
    expect((await latestSafetyCopy(db))?.made_at).toBe(new Date(2026, 9, 5).toISOString());
  });
});

describe('what a backup reminder counts', () => {
  it('counts restored solves as backed up, and only the ones timed after', async () => {
    const db = createTestDb();
    await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 9_000, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 1),
    );
    expect((await unbackedSolves(db)).count).toBe(1);

    await restoreBackup(db, readBackup(JSON.stringify(v3.backup)), new Date(2026, 9, 14, 9));
    expect((await unbackedSolves(db)).count).toBe(0);
    await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 9_500, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 14, 10),
    );
    expect((await unbackedSolves(db)).count).toBe(1);

    // Undo brings back solves that may never have been backed up.
    await undoLastRestore(db);
    expect((await unbackedSolves(db)).count).toBe(1);
  });

  it('counts from the later of the last backup and the last restore', async () => {
    const db = createTestDb();
    await restoreBackup(db, readBackup(JSON.stringify(v3.backup)), new Date(2026, 9, 10));
    await setMeta(db, 'lastBackupAt', new Date(2026, 9, 5).getTime());
    await saveTimedSolve(
      db,
      { eventId: '333', timeMs: 9_000, penalty: 'OK', scramble: '' },
      new Date(2026, 9, 8),
    );
    expect((await unbackedSolves(db)).count).toBe(0);
  });
});
