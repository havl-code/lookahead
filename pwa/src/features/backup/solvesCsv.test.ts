import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/db.ts';
import { readBackup, restoreBackup } from './backup.ts';
import golden from './golden/solves-csv.json' with { type: 'json' };
import { solvesCsv, solvesCsvFile } from './solvesCsv.ts';

// The golden file holds a backup and the desktop app's CSV export of it (tools/build_pwa_golden.py).
async function restored() {
  const db = createTestDb();
  await restoreBackup(db, readBackup(JSON.stringify(golden.backup)));
  return db;
}

describe('the CSV export', () => {
  it('writes every solve as the desktop app does', async () => {
    expect(await solvesCsv(await restored())).toBe(golden.csv.all);
  });

  it.each(Object.keys(golden.csv).filter((key) => key !== 'all'))(
    "writes session %s's solves as the desktop app does",
    async (id) => {
      expect(await solvesCsv(await restored(), Number(id))).toBe(
        golden.csv[id as keyof typeof golden.csv],
      );
    },
  );

  it('is just the heading without solves', async () => {
    expect(await solvesCsv(createTestDb())).toBe(
      '﻿session_id,session_date,event_id,event,cube,solve_number,time_seconds,penalty,result_seconds,scramble,notes,timestamp\r\n',
    );
  });

  it('names the file as the desktop app does', async () => {
    const db = await restored();
    const now = new Date(2026, 9, 14, 9);
    expect((await solvesCsvFile(db, null, now)).name).toBe('lookahead-solves-2026-10-14.csv');
    const file = await solvesCsvFile(db, 4, now);
    expect(file.name).toBe('lookahead-solves-session-4-2026-10-14.csv');
    expect(file.type).toBe('text/csv');
  });
});
