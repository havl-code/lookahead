/// <reference lib="dom" />
/*
 * Retakes docs/screenshots/phone-app.png, the README's picture of the app: the Timer, Sessions,
 * and Analytics tabs side by side, in dark mode, on a phone-sized screen. Retake it whenever the
 * UI changes. From the project folder:
 *
 *   pnpm build && pnpm preview --port 4199 &
 *   node scripts/screenshots.ts http://localhost:4199/lookahead/
 *
 * The solves are made up (the same every time), and the rankings are faked so the best single
 * shows outside the top 1,000, as the real ones do for it. Nothing is fetched from the internet.
 */
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4199/lookahead/';
const output = fileURLToPath(new URL('../docs/screenshots/phone-app.png', import.meta.url));
// Each pane is 603 by 1022 pixels (a 402 by 681 screen at 1.5 times), 32 pixels apart.
const viewport = { width: 402, height: 681 };
const scale = 1.5;
const gap = 32;
const evening = new Date(2026, 9, 15, 19, 30);

/** A small repeatable random number generator, so the made-up solves are the same each time. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

/** A backup of 25 days of 3x3x3, getting a little faster, and a few days of other events. */
function backup(): object {
  const next = random(2026);
  const sessions: object[] = [];
  const solves: object[] = [];
  let solveId = 0;
  const day = (offset: number) => {
    const date = new Date(2026, 9, 15 - offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const addSession = (
    id: number,
    date: string,
    eventId: string,
    count: number,
    typical: number,
  ) => {
    sessions.push({
      id,
      date,
      event_id: eventId,
      cube_id: eventId === '333' ? 1 : null,
      notes: '',
      created_at: `${date}T07:00:00.000Z`,
    });
    for (let n = 1; n <= count; n++) {
      solveId += 1;
      const dnf = next() < 0.02;
      solves.push({
        id: solveId,
        session_id: id,
        solve_number: n,
        time_ms: Math.round(typical * (0.8 + next() * 0.4)),
        scramble: '',
        penalty: dnf ? 'DNF' : next() < 0.03 ? '+2' : null,
        dnf,
        notes: '',
        timestamp: `${date}T07:${String(n % 60).padStart(2, '0')}:00.000Z`,
      });
    }
  };
  for (let offset = 24; offset >= 0; offset--)
    addSession(
      25 - offset,
      day(offset),
      '333',
      30 + Math.round(next() * 35),
      13_400 - (24 - offset) * 70,
    );
  addSession(26, day(3), '222', 25, 4_200);
  addSession(27, day(9), '444', 25, 52_000);
  addSession(28, day(17), '333oh', 25, 24_000);
  return {
    app: 'lookahead',
    version: 1,
    exported_at: evening.toISOString(),
    cubes: [
      {
        id: 1,
        cube_type: '333',
        brand: 'GAN',
        model: '14 MagLev',
        purchase_date: '2026-01-10',
        notes: '',
        is_active: true,
        created_at: '2026-01-10T00:00:00.000Z',
      },
    ],
    sessions,
    solves,
    // The owner's name for the greeting; the WCA ID is a placeholder and never shows.
    settings: [{ id: 'user', wca_id: '2026TEST01', wca_name: 'Lý Việt Hà', value: null }],
  };
}

async function shoot(page: Page, hash: string, ready: string): Promise<Buffer> {
  // A fresh load for each tab, so nothing is left pressed or focused from the one before.
  await page.goto('about:blank');
  await page.goto(`${url}${hash}`);
  await page.getByText(ready, { exact: false }).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  // Off to one side, so nothing shows as hovered.
  await page.mouse.move(viewport.width - 1, viewport.height / 2);
  return page.screenshot();
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: scale,
  colorScheme: 'dark',
  hasTouch: true,
  isMobile: true,
  // No service worker, so no "ready to work offline" message over the top of the panes.
  serviceWorkers: 'block',
});
const page = await context.newPage();
await page.clock.setFixedTime(evening);
// The WCA's 3x3x3 rankings, faked: 1,000 people from 3.00 to 8.99, so 9.20 is outside them.
await page.route('https://raw.githubusercontent.com/**', (route) =>
  route.fulfill({
    json: {
      items: Array.from({ length: 1000 }, (_, i) => ({ best: 300 + i * 0.6 })),
      total: 250_000,
    },
  }),
);

await page.goto(`${url}#/more`);
const chooser = page.waitForEvent('filechooser');
await page.getByRole('button', { name: 'Restore from a backup' }).click();
await (await chooser).setFiles({
  name: 'lookahead-backup.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(backup())),
});
await page
  .getByRole('dialog', { name: 'Restore backup' })
  .getByRole('button', { name: 'Restore' })
  .click();
await page.getByText(/^Restored /).waitFor();

const panes = [
  await shoot(page, '#/timer', 'Mean'),
  await shoot(page, '#/sessions', 'sessions,'),
  await shoot(page, '#/analytics', 'World rank'),
];

// Put the three side by side on a black background, in a page of its own at full size.
const width = Math.round(viewport.width * scale);
const height = Math.round(viewport.height * scale);
const sheet = await browser.newPage({
  viewport: { width: 3 * width + 2 * gap, height },
  deviceScaleFactor: 1,
});
await sheet.setContent(
  `<body style="margin:0;background:#000;display:flex;gap:${gap}px">${panes
    .map(
      (png) =>
        `<img style="width:${width}px;height:${height}px" src="data:image/png;base64,${png.toString('base64')}">`,
    )
    .join('')}</body>`,
);
await sheet.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
await sheet.screenshot({ path: output });
await browser.close();
console.log(`Wrote ${output}`);
