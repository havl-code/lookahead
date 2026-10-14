import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LookaheadDb } from '../../db/database.ts';
import { setMeta } from '../../db/meta.ts';
import { unbackedSolves } from '../../db/stored.ts';
import { createTestDb } from '../../test/db.ts';
import { exportBackup, readBackup, restoreBackup } from '../backup/backup.ts';
import {
  type CsTimerData,
  CsTimerError,
  importCsTimer,
  importMessage,
  previewCsTimer,
  readCsTimer,
  sessionEvents,
  sessionNames,
} from './cstimer.ts';
import golden from './golden/cstimer.json' with { type: 'json' };

// The golden file holds CSTimer exports and what the desktop app makes of them
// (tools/build_pwa_golden.py), with dates on UTC's calendar, so these run on it too.
beforeAll(() => {
  vi.stubEnv('TZ', 'UTC');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const exports = golden.exports as unknown as Record<string, CsTimerData>;
const now = new Date(golden.now * 1000);

async function startingWith(backup: unknown): Promise<LookaheadDb> {
  const db = createTestDb();
  if (backup) await restoreBackup(db, readBackup(JSON.stringify(backup)));
  return db;
}

describe('reading a file', () => {
  it('reads an export, and the TXT kind that starts with a byte order mark', () => {
    const text = JSON.stringify(exports.fixture);
    expect(readCsTimer(text)).toEqual(exports.fixture);
    expect(readCsTimer(`\uFEFF${text}`)).toEqual(exports.fixture);
  });

  it.each(['[1, 2]', '"text"', '{broken', '', 'null'])('turns down %j', (text) => {
    expect(() => readCsTimer(text)).toThrow(CsTimerError);
  });

  it('finds the names and events in its session data', () => {
    expect(Object.fromEntries(sessionNames(exports.fixture as CsTimerData))).toEqual({
      session1: 'Main 3x3',
      session2: '2',
      session3: 'Empty',
    });
    expect(Object.fromEntries(sessionEvents(exports.messy as CsTimerData))).toEqual({
      session1: '333',
      session2: '222',
    });
  });
});

describe('as the desktop app does it', () => {
  it.each(Object.keys(golden.previews))('previews the %s export', async (name) => {
    expect(await previewCsTimer(exports[name] as CsTimerData, null, golden.now)).toEqual(
      golden.previews[name as keyof typeof golden.previews],
    );
  });

  it.each(golden.scenarios.map((scenario) => [scenario.name, scenario] as const))(
    'imports %s',
    async (_, scenario) => {
      const db = await startingWith(scenario.start);
      if ('previews' in scenario && scenario.previews) {
        for (const [name, preview] of Object.entries(scenario.previews))
          expect(await previewCsTimer(exports[name] as CsTimerData, db, golden.now)).toEqual(
            preview,
          );
      }
      for (const step of scenario.imports) {
        const result = await importCsTimer(
          db,
          exports[step.export] as CsTimerData,
          {
            keys: step.keys,
            eventId: step.eventId,
            splitByDay: step.splitByDay,
            events: new Map(Object.entries(step.events as Record<string, string>)),
          },
          now,
        );
        expect(result).toEqual(step.result);
        expect(importMessage(result)).toBe(`${step.message}.`);
      }
      const { exported_at: _at, ...exported } = await exportBackup(db);
      expect(exported).toEqual(scenario.exported);
      for (const [id, stats] of Object.entries(scenario.stats))
        expect(await db.sessions.get(Number(id))).toMatchObject(stats);
    },
  );
});

describe('days', () => {
  it("splits sessions by this device's calendar", async () => {
    vi.stubEnv('TZ', 'Pacific/Auckland');
    try {
      // 11:30 pm and 11:30 am the next day in New Zealand (13 hours ahead in October), both on
      // 1 October in UTC
      const data = readCsTimer(
        JSON.stringify({
          session1: [
            [[0, 10000], 'R', '', Date.UTC(2026, 9, 1, 10, 30) / 1000],
            [[0, 11000], 'U', '', Date.UTC(2026, 9, 1, 22, 30) / 1000],
          ],
        }),
      );
      const db = createTestDb();
      const result = await importCsTimer(db, data, {
        keys: ['session1'],
        eventId: '333',
        splitByDay: true,
      });
      expect(result.sessions_imported).toBe(2);
      expect((await db.sessions.toArray()).map((session) => session.date)).toEqual([
        '2026-10-01',
        '2026-10-02',
      ]);
    } finally {
      vi.stubEnv('TZ', 'UTC');
    }
  });

  it('changes nothing if the import fails part way', async () => {
    const db = createTestDb();
    const data = readCsTimer(JSON.stringify({ session1: [[[0, 10000], 'R', '', 1788228000]] }));
    // Writing the solves fails after the session is added
    db.solves.hook('creating').subscribe(() => {
      throw new Error('full');
    });
    await expect(
      importCsTimer(db, data, { keys: ['session1'], eventId: '333', splitByDay: true }),
    ).rejects.toThrow();
    expect(await db.sessions.count()).toBe(0);
  });
});

describe('the message', () => {
  it('says what was imported, and what was left out and why', () => {
    const result = {
      sessions_imported: 1,
      total_solves: 1234,
      duplicates_skipped: 1,
      unreadable_skipped: 0,
      sessions_found: 1,
    };
    expect(importMessage(result)).toBe(
      'Imported 1,234 solves into 1 session (skipped 1 already in the app).',
    );
  });
});

describe('the backup reminder', () => {
  it('counts imported solves until the next backup or restore, though their times are old', async () => {
    const db = createTestDb();
    await setMeta(db, 'lastBackupAt', Date.now());
    await importCsTimer(db, exports.fixture as CsTimerData, {
      keys: ['session1', 'session2'],
      eventId: '333',
      splitByDay: true,
    });
    expect((await unbackedSolves(db)).count).toBe(10);
    await restoreBackup(db, readBackup(JSON.stringify(await exportBackup(db))));
    expect((await unbackedSolves(db)).count).toBe(0);
  });
});
