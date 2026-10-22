import { expect, type Page } from '@playwright/test';

// A practice backup and the WCA's rankings, faked, shared by the Analytics specs on the phone
// and in the wide layout.

/** A backup of 12 days of 3x3x3, 25 solves each, a little faster each day, and some 2x2x2. */
function practice(solveCountPerSession = 25) {
  const sessions: object[] = [];
  const solves: object[] = [];
  let solveId = 0;
  for (let day = 1; day <= 12; day++) {
    const date = `2026-10-${String(day).padStart(2, '0')}`;
    sessions.push({
      id: day,
      date,
      event_id: '333',
      cube_id: null,
      notes: '',
      created_at: `${date}T08:00:00.000Z`,
    });
    for (let n = 1; n <= solveCountPerSession; n++) {
      solveId += 1;
      const dnf = n === 13;
      solves.push({
        id: solveId,
        session_id: day,
        solve_number: n,
        time_ms: Math.round((15_000 - day * 200) * (1 + ((n * 37) % 9) * 0.02)),
        scramble: `R U2 F' ${solveId}`,
        penalty: dnf ? 'DNF' : null,
        dnf,
        notes: '',
        timestamp: `${date}T08:${String(n).padStart(2, '0')}:00.000Z`,
      });
    }
  }
  sessions.push({
    id: 99,
    date: '2026-10-12',
    event_id: '222',
    cube_id: null,
    notes: '',
    created_at: '2026-10-12T09:00:00.000Z',
  });
  solves.push({
    id: solveId + 1,
    session_id: 99,
    solve_number: 1,
    time_ms: 3_210,
    scramble: '',
    penalty: null,
    dnf: false,
    notes: '',
    timestamp: '2026-10-12T09:00:00.000Z',
  });
  return {
    app: 'lookahead',
    version: 1,
    exported_at: '2026-10-13T00:00:00.000Z',
    cubes: [],
    sessions,
    solves,
    settings: [{ id: 'user', wca_id: '2003POCH01', wca_name: 'Test Person', value: null }],
  };
}

const rankings = 'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/**';

/** The WCA's 3x3x3 rankings, faked: 1,000 people listed from 3.00 up, 200,000 ranked. */
export async function fakeRankings(page: Page) {
  await page.route(rankings, (route) =>
    route.request().url().endsWith('/rank/world/single/333.json')
      ? route.fulfill({
          json: {
            items: Array.from({ length: 1000 }, (_, i) => ({ best: 300 + i })),
            total: 200_000,
          },
        })
      : route.abort('internetdisconnected'),
  );
}

/** Restores the practice backup from the More tab. */
export async function restore(page: Page, solveCountPerSession = 25) {
  await page.goto('./#/more');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from a backup' }).click();
  await (await chooser).setFiles({
    name: 'lookahead-backup-2026-10-13.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(practice(solveCountPerSession))),
  });
  await page
    .getByRole('dialog', { name: 'Restore backup' })
    .getByRole('button', { name: 'Restore' })
    .click();
  const solveCount = (12 * solveCountPerSession + 1).toLocaleString('en-NZ');
  await expect(page.getByText(`Restored 13 sessions and ${solveCount} solves.`)).toBeVisible();
}
