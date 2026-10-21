import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { fakeRankings, restore } from './practice.ts';

// The wide layout, from 1024 px wide (CONTEXT.md). Runs only in the desktop-chromium project,
// at 1440 by 900 with a mouse; the iPhone projects check the phone layout.

const tabs = ['Timer', 'Sessions', 'Analytics', 'More'] as const;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

/** Turns inspection off, so the space bar starts a solve straight after the hold. */
async function skipInspection(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'WCA inspection (15 seconds)' }).uncheck();
  await page.getByRole('button', { name: 'Close' }).click();
}

/**
 * Times a solve of `solveMs` with the space bar and waits until it's in the list. The page's
 * clock is faked and keeps ticking, as in timer.spec.ts, so a time can come out a little long.
 */
async function timeASolve(page: Page, solveMs: number, number: number) {
  await page.keyboard.down(' ');
  await page.clock.runFor(300);
  await page.keyboard.up(' ');
  await page.clock.runFor(solveMs);
  await page.keyboard.down(' ');
  await page.keyboard.up(' ');
  await expect(page.getByRole('button', { name: new RegExp(`^Solve ${number}: `) })).toBeVisible();
}

/** Opens the Timer with the page's clock faked and inspection off. */
async function openTimer(page: Page) {
  await page.clock.install({ time: new Date(2026, 9, 14, 9) });
  await page.goto('./');
  await skipInspection(page);
}

/** Restores the practice backup and opens the Dashboard, with the WCA's rankings faked. */
async function openDashboard(page: Page) {
  await fakeRankings(page);
  await restore(page);
  await page.goto('./#/analytics');
  await expect(page.locator('figure canvas')).toHaveCount(4);
}

test('shows the Main navigation as a top bar, above the main content', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Main' });
  const navBox = await nav.boundingBox();
  const mainBox = await page.getByRole('main').boundingBox();
  expect(navBox?.y).toBe(0);
  expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual(mainBox?.y ?? 0);

  await expect(nav.locator('img')).toBeVisible();
  await expect(nav.getByText('Lookahead', { exact: true })).toBeVisible();
  // The tabs are text alone, without the phone's icons.
  for (const name of tabs) {
    const link = nav.getByRole('link', { name });
    await expect(link).toBeVisible();
    await expect(link.locator('svg')).toBeHidden();
    // Each name on one line (a two-line name still fits the pill's height, so count the lines).
    const lines = await link.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });
    expect(lines, name).toBe(1);
  }
  await expect(nav.getByRole('link', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
});

test('moves between the tabs, and back with the browser, without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Sessions', 'Analytics', 'More', 'Timer']) {
    await nav.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  }

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('centres Sessions and More in a readable column, no wider than 768 px', async ({ page }) => {
  for (const name of ['Sessions', 'More']) {
    await page.goto(`./#/${name.toLowerCase()}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    const main = await page.getByRole('main').boundingBox();
    expect(main?.width, name).toBe(768);
    // Centred in the 1440 px window, give or take a scroll bar when the tab is taller than it.
    const centre = (main?.x ?? 0) + (main?.width ?? 0) / 2;
    expect(Math.abs(centre - 720), name).toBeLessThanOrEqual(8);
  }
});

test('centres the Timer, no wider than 1,280 px', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeAttached();
  const main = await page.getByRole('main').boundingBox();
  expect(main?.width).toBe(1280);
  expect(Math.abs((main?.x ?? 0) + (main?.width ?? 0) / 2 - 720)).toBeLessThanOrEqual(8);
});

test('centres the Dashboard at up to 1,280 px, and How the scores work at 768 px', async ({
  page,
}) => {
  for (const [hash, heading, width] of [
    ['analytics', 'Analytics', 1280],
    ['analytics/scores', /How the Analytics Scores Work/, 768],
  ] as const) {
    await page.goto(`./#/${hash}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    const main = await page.getByRole('main').boundingBox();
    expect(main?.width, hash).toBe(width);
    expect(Math.abs((main?.x ?? 0) + (main?.width ?? 0) / 2 - 720), hash).toBeLessThanOrEqual(8);
  }
});

test('shows the bests as two rows of cards, five then four, linking as on the phone', async ({
  page,
}) => {
  await openDashboard(page);
  const bests = page.getByRole('region', { name: 'Your bests' });
  await expect(bests.getByText('~961')).toBeVisible();

  /** Where each card sits, found from its label. */
  const cards = (labels: readonly string[]) =>
    Promise.all(
      labels.map(async (label) => {
        const box = await bests.getByText(label, { exact: true }).locator('..').boundingBox();
        return { label, x: box?.x ?? 0, y: box?.y ?? 0, width: box?.width ?? 0 };
      }),
    );
  const first = await cards(['Best single', 'World rank', 'Average', 'Solves', 'Sessions']);
  const second = await cards(['Best Ao5', 'Best Ao12', 'Best Ao50', 'Best Ao100']);
  for (const row of [first, second]) {
    for (const [i, card] of row.entries()) {
      expect(card.y, card.label).toBe(row[0]?.y);
      if (i > 0) expect(card.x, card.label).toBeGreaterThan(row[i - 1]?.x ?? 0);
    }
    // The cards share the row: each about the same width, the row as wide as the page's content.
    const right = (row.at(-1)?.x ?? 0) + (row.at(-1)?.width ?? 0);
    expect(right - (row[0]?.x ?? 0)).toBeCloseTo(1248, -1);
  }
  expect(second[0]?.y ?? 0).toBeGreaterThan(first[0]?.y ?? 0);

  // The same figures as the phone, with the solves and sessions counted in cards of their own.
  await expect(bests.getByText('Top 0.48% worldwide, by best single')).toBeVisible();
  await expect(bests.getByText('300', { exact: true })).toBeVisible();
  await expect(bests.getByText('12', { exact: true })).toBeVisible();
  await expect(bests.getByText('300 solves in 12 sessions')).toBeHidden();

  // And the same links: each PB opens its details.
  await bests.getByRole('button', { name: /^Best single 12\.60/ }).click();
  const single = page.getByRole('dialog', { name: 'Best single' });
  await expect(single.getByRole('link', { name: 'Open its session' })).toBeVisible();
  await single.getByRole('button', { name: 'Close' }).click();
  await bests.getByRole('button', { name: /^Best Ao12 / }).click();
  const average = page.getByRole('dialog', { name: 'Best Ao12' });
  await expect(average.getByRole('link', { name: 'Open its session' })).toBeVisible();
});

test('puts Scores and Insights side by side', async ({ page }) => {
  await openDashboard(page);
  const scores = await page.getByRole('region', { name: 'Scores' }).boundingBox();
  const insights = await page.getByRole('region', { name: 'Insights' }).boundingBox();
  expect(insights?.y).toBe(scores?.y);
  expect(insights?.x ?? 0).toBeGreaterThan((scores?.x ?? 0) + (scores?.width ?? 0));
});

test('lays the charts out in a grid, 300 px tall, and 220 px again in a narrow window', async ({
  page,
}) => {
  await openDashboard(page);
  const charts = page.getByRole('figure');
  const box = async (title: string) =>
    (await charts.filter({ hasText: title }).boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };

  // Progress and Consistency across the grid, Distribution and Rolling averages sharing a row.
  const progress = await box('Progress');
  const spread = await box('How your times spread out');
  const rolling = await box('Rolling averages');
  const consistency = await box('Consistency across sessions');
  expect(progress.width).toBe(1248);
  expect(consistency.width).toBe(1248);
  expect(rolling.y).toBe(spread.y);
  expect(rolling.x).toBeGreaterThan(spread.x + spread.width);
  expect(spread.y).toBeGreaterThan(progress.y + progress.height);
  expect(consistency.y).toBeGreaterThan(spread.y + spread.height);
  // Each keeps its describing sentence.
  await expect(charts.filter({ hasText: 'Progress' })).toContainText(
    '12 sessions, from 1 Oct to 12 Oct.',
  );

  const heights = () =>
    page
      .locator('figure canvas')
      .evaluateAll((canvases) => canvases.map((canvas) => canvas.getBoundingClientRect().height));
  expect(await heights()).toEqual([300, 300, 300, 300]);

  // The charts' menu still switches to one session, without the comparison across sessions.
  await page.getByLabel('Charts for').selectOption({ index: 1 });
  await expect(charts).toHaveCount(3);
  await expect(charts.filter({ hasText: 'Progress' })).toContainText(
    'Solves 1 to 25 of this session',
  );
  expect(await heights()).toEqual([300, 300, 300]);

  // The height comes from the layout, so crossing 1024 px redraws the charts at the phone's.
  await page.setViewportSize({ width: 800, height: 900 });
  await expect.poll(heights).toEqual([220, 220, 220]);

  // An event with too few solves says so in the grid's place.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('Event').selectOption({ label: '2x2x2' });
  await expect(page.getByText('Needs 12 solves or more.')).toBeVisible();
});

test('shows the kept rankings in the world rank card offline, or says it has none', async ({
  page,
}) => {
  await openDashboard(page);
  const bests = page.getByRole('region', { name: 'Your bests' });
  await expect(bests.getByText('~961')).toBeVisible();

  await page.context().setOffline(true);
  await page.reload();
  const card = bests.getByText('World rank', { exact: true }).locator('..');
  await expect(card).toContainText('~961');
  // 2x2x2's rankings were never fetched.
  await page.getByLabel('Event').selectOption({ label: '2x2x2' });
  await expect(card).toContainText("Needs the internet once, to fetch the WCA's rankings");
  const single = await bests.getByText('Best single', { exact: true }).locator('..').boundingBox();
  expect((await card.boundingBox())?.y).toBe(single?.y);
});

test('lists the latest solves in a panel to the right of the time, newest first', async ({
  page,
}) => {
  await openTimer(page);
  await timeASolve(page, 10_000, 1);
  await timeASolve(page, 12_000, 2);
  await timeASolve(page, 11_000, 3);

  const scramble = await page.getByRole('region', { name: 'Scramble' }).boundingBox();
  const today = page.getByRole('region', { name: 'Today' });
  const panel = await today.boundingBox();
  expect(panel?.x ?? 0).toBeGreaterThan((scramble?.x ?? 0) + (scramble?.width ?? 0));
  expect(panel?.width).toBeLessThanOrEqual(360);

  // The session menu heads the panel, above its stats.
  const menu = await page.getByRole('combobox', { name: 'Session' }).boundingBox();
  expect(menu?.x).toBe(panel?.x);
  expect((menu?.y ?? 0) + (menu?.height ?? 0)).toBeLessThanOrEqual(panel?.y ?? 0);

  // One row each, newest first, the best and the worst named, then the Ao5 and Ao12 at the solve.
  const rows = today.getByRole('list', { name: 'Latest solves' }).getByRole('button');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAccessibleName(/^Solve 3: 11\.[01]\d, Ao5 -, Ao12 -$/);
  await expect(rows.nth(1)).toHaveAccessibleName(/^Solve 2: 12\.[01]\d, worst, Ao5 -, Ao12 -$/);
  await expect(rows.nth(2)).toHaveAccessibleName(/^Solve 1: 10\.[01]\d, best, Ao5 -, Ao12 -$/);
  await expect(rows.nth(0)).toContainText('3');
  await expect(rows.nth(1)).toContainText('worst');
  await expect(rows.nth(2)).toContainText('best');
  const boxes = await Promise.all([0, 1, 2].map((i) => rows.nth(i).boundingBox()));
  for (const box of boxes) expect(box?.width).toBe(panel?.width);
  expect(boxes[0]?.y ?? 0).toBeLessThan(boxes[1]?.y ?? 0);
  expect(boxes[1]?.y ?? 0).toBeLessThan(boxes[2]?.y ?? 0);
});

test('shows the Ao5 and Ao12 at each solve under one header row, as the header counts them', async ({
  page,
}) => {
  await openTimer(page);
  for (const [i, ms] of [10_000, 12_000, 11_000, 13_000, 9_000].entries()) {
    await timeASolve(page, ms, i + 1);
  }

  // The Ao5 at solve 5 drops the 9 and the 13; the others' windows haven't filled.
  const today = page.getByRole('region', { name: 'Today' });
  const rows = today.getByRole('list', { name: 'Latest solves' }).getByRole('button');
  await expect(rows.nth(0)).toHaveAccessibleName(/^Solve 5: 9\.[01]\d, best, Ao5 11\.0\d, Ao12 -$/);
  await expect(rows.nth(1)).toHaveAccessibleName(/^Solve 4: 13\.[01]\d, worst, Ao5 -, Ao12 -$/);
  await expect(rows.nth(4)).toHaveAccessibleName(/^Solve 1: 10\.[01]\d, Ao5 -, Ao12 -$/);

  // "Ao5" and "Ao12" once above the rows, each lined up with its column.
  for (const [label, value] of [
    ['Ao5', /^11\.0\d$/],
    ['Ao12', '-'],
  ] as const) {
    const heading = today.getByText(label, { exact: true }).last();
    const cell = rows.nth(0).getByText(value, { exact: true });
    const [headingBox, cellBox, rowBox] = await Promise.all([
      heading.boundingBox(),
      cell.boundingBox(),
      rows.nth(0).boundingBox(),
    ]);
    expect((headingBox?.y ?? 0) + (headingBox?.height ?? 0)).toBeLessThanOrEqual(rowBox?.y ?? 0);
    expect((headingBox?.x ?? 0) + (headingBox?.width ?? 0)).toBeCloseTo(
      (cellBox?.x ?? 0) + (cellBox?.width ?? 0),
      0,
    );
  }

  // Two DNFs in the window make the Ao5 a DNF (Regulation 9f9), in the row as in the header.
  await page.keyboard.press('Control+3');
  await expect(rows.nth(0)).toHaveAccessibleName(/^Solve 5: DNF, Ao5 12\.0\d, Ao12 -$/);
  await rows.nth(1).click();
  const sheet = page.getByRole('dialog', { name: 'Solve 4' });
  await sheet.getByRole('button', { name: 'DNF' }).click();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(rows.nth(0)).toHaveAccessibleName('Solve 5: DNF, Ao5 DNF, Ao12 -');
  await expect(today.getByRole('definition').nth(2)).toHaveText('DNF');
});

test('opens the solve sheet from a row, where penalty, note, and delete work', async ({ page }) => {
  await openTimer(page);
  await timeASolve(page, 10_000, 1);
  await timeASolve(page, 12_000, 2);

  await page.getByRole('button', { name: /^Solve 1: / }).click();
  const sheet = page.getByRole('dialog', { name: 'Solve 1' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: '+2' }).click();
  await expect(page.getByRole('button', { name: /^Solve 1: 12\.[01]\d \(\+2\)/ })).toBeAttached();
  await sheet.getByRole('textbox', { name: 'Note' }).fill('Lost the cross');
  await sheet.getByRole('button', { name: 'Save note' }).click();
  await expect(sheet.getByRole('status')).toHaveText('Note saved.');
  await sheet.getByRole('button', { name: 'Delete' }).click();
  await expect(sheet).toBeHidden();
  // The session renumbers, so the 12 second solve is Solve 1 now, and the only row.
  const rows = page.getByRole('list', { name: 'Latest solves' }).getByRole('button');
  await expect(rows).toHaveCount(1);
  await expect(rows).toHaveAccessibleName(/^Solve 1: 12\.[01]\d, Ao5 -, Ao12 -$/);
});

test('fits a time of 1:23.45 inside its column, on one line', async ({ page }) => {
  await openTimer(page);
  await timeASolve(page, 83_450, 1);

  const scramble = await page.getByRole('region', { name: 'Scramble' }).boundingBox();
  const time = page.getByText(/^1:23\.[45]\d$/).first();
  const text = await time.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()];
    return {
      left: Math.min(...rects.map((rect) => rect.left)),
      right: Math.max(...rects.map((rect) => rect.right)),
      lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    };
  });
  expect(text.lines).toBe(1);
  expect(text.left).toBeGreaterThanOrEqual(scramble?.x ?? 0);
  expect(text.right).toBeLessThanOrEqual((scramble?.x ?? 0) + (scramble?.width ?? 0));
  // Much larger than the phone's 8 rem, and no larger than 14 rem.
  expect(text.fontSize).toBeGreaterThan(128);
  expect(text.fontSize).toBeLessThanOrEqual(224);
});

test('drops the panel and centres the scramble and time with Hide stats on', async ({ page }) => {
  await openTimer(page);
  await timeASolve(page, 10_000, 1);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'Hide stats' }).check();
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('region', { name: 'Today' })).toBeHidden();
  const scramble = await page.getByRole('region', { name: 'Scramble' }).boundingBox();
  expect(Math.abs((scramble?.x ?? 0) + (scramble?.width ?? 0) / 2 - 720)).toBeLessThanOrEqual(8);
  const time = await page.getByText(/^10\.[01]\d$/).boundingBox();
  expect(Math.abs((time?.x ?? 0) + (time?.width ?? 0) / 2 - 720)).toBeLessThanOrEqual(8);
  // The session menu goes back beside the event menu.
  const event = await page.getByRole('combobox', { name: 'Event' }).boundingBox();
  const session = await page.getByRole('combobox', { name: 'Session' }).boundingBox();
  expect(session?.y).toBe(event?.y);
});

test('keeps a solve running when the window narrows to the phone layout and widens again', async ({
  page,
}) => {
  // The page's clock is faked, as in timer.spec.ts, so the solve takes no real time.
  await page.clock.install({ time: new Date(2026, 9, 14, 9) });
  await page.goto('./');
  await skipInspection(page);

  await page.keyboard.down(' ');
  await page.clock.runFor(300);
  await page.keyboard.up(' ');
  await page.clock.runFor(5_000);
  await page.setViewportSize({ width: 800, height: 900 });
  await page.clock.runFor(5_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.runFor(2_340);
  await page.keyboard.down(' ');
  await page.keyboard.up(' ');

  await expect(page.getByRole('status').filter({ hasText: 'saved' })).toHaveText(
    /^12\.[34]\d, saved\.$/,
  );
  await expect(
    page.getByRole('button', { name: /^Solve 1: 12\.[34]\d, Ao5 -, Ao12 -$/ }),
  ).toBeVisible();
});

test('hides the top bar and the panel in fullscreen, as it hides the tab bar on a phone', async ({
  page,
}) => {
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();

  await page.getByRole('button', { name: 'Fullscreen' }).click();
  await expect(nav).toBeHidden();
  await expect(page.getByRole('region', { name: 'Today' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Scramble' })).toBeVisible();

  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect(nav).toBeVisible();
});

test('opens a sheet as a dialog in the middle of the window, no wider than 560 px', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Timer settings' });
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  // About 480 to 560 px wide, as the wide layout's spec (#26) asks.
  expect(box?.width).toBeLessThanOrEqual(560);
  expect(box?.width).toBeGreaterThanOrEqual(480);
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 720)).toBeLessThanOrEqual(1);
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) / 2 - 450)).toBeLessThanOrEqual(1);
});

test('closes a sheet with Escape, Close, or a click outside it, and returns focus', async ({
  page,
}) => {
  await page.goto('./');
  const settings = page.getByRole('button', { name: 'Settings' });
  const sheet = page.getByRole('dialog', { name: 'Timer settings' });
  const ways = {
    Escape: () => page.keyboard.press('Escape'),
    Close: () => sheet.getByRole('button', { name: 'Close' }).click(),
    // The top left corner of the window is backdrop, well outside the centred dialog.
    'a click outside it': () => page.mouse.click(20, 20),
  };
  for (const [way, close] of Object.entries(ways)) {
    await settings.click();
    await expect(sheet, way).toBeVisible();
    await close();
    await expect(sheet, way).toBeHidden();
    await expect(settings, way).toBeFocused();
  }
});

test('moves a sheet to the middle from 1024 px wide, with all its corners rounded', async ({
  page,
}) => {
  await page.goto('./#/sessions');
  await page.getByRole('button', { name: 'Add session' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add session' });
  await expect(sheet).toBeVisible();
  const corners = () =>
    sheet.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.borderTopLeftRadius, style.borderBottomRightRadius];
    });

  await page.setViewportSize({ width: 1024, height: 900 });
  expect(await corners()).toEqual(['24px', '24px']);
  const wide = await sheet.boundingBox();
  expect((wide?.y ?? 0) + (wide?.height ?? 0)).toBeLessThan(900);

  await page.setViewportSize({ width: 1023, height: 900 });
  expect(await corners()).toEqual(['24px', '0px']);
  const narrow = await sheet.boundingBox();
  expect((narrow?.y ?? 0) + (narrow?.height ?? 0)).toBe(900);
});

test('keeps a sheet open with what was typed when the window narrows and widens again', async ({
  page,
}) => {
  await page.goto('./#/sessions');
  await page.getByRole('button', { name: 'Add session' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add session' });
  const notes = sheet.getByLabel('Notes');
  await notes.fill('Club night');

  await page.setViewportSize({ width: 800, height: 900 });
  await expect(sheet).toBeVisible();
  await expect(notes).toHaveValue('Club night');
  await expect(notes).toBeFocused();
  // On the phone layout it rises from the bottom of the window again.
  const narrow = await sheet.boundingBox();
  expect((narrow?.y ?? 0) + (narrow?.height ?? 0)).toBe(900);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(notes).toHaveValue('Club night');
  const wide = await sheet.boundingBox();
  expect(Math.abs((wide?.y ?? 0) + (wide?.height ?? 0) / 2 - 450)).toBeLessThanOrEqual(1);
});

for (const colorScheme of ['dark', 'light'] as const) {
  test(`has no detectable WCAG 2.2 AA violations in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    for (const name of tabs) {
      await page.goto(`./#/${name.toLowerCase()}`);
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations, name).toEqual([]);
    }
  });

  test(`has no detectable WCAG 2.2 AA violations on the Timer with solves, in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openTimer(page);
    await timeASolve(page, 10_000, 1);
    await timeASolve(page, 12_000, 2);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test(`has no detectable WCAG 2.2 AA violations with a sheet open, in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('./#/sessions');
    await page.getByRole('button', { name: 'Add session' }).click();
    await expect(page.getByRole('dialog', { name: 'Add session' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test(`has no detectable WCAG 2.2 AA violations on the Dashboard, in ${colorScheme} mode`, async ({
    page,
  }) => {
    await fakeRankings(page);
    await restore(page);
    await page.emulateMedia({ colorScheme });
    await page.goto('./#/analytics');
    await expect(page.locator('figure canvas')).toHaveCount(4);
    await expect(page.getByText('~961')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
