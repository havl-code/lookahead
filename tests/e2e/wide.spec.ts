import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

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

test('centres each tab in a readable column, no wider than 768 px', async ({ page }) => {
  for (const name of tabs.filter((tab) => tab !== 'Timer')) {
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

  // One row each, newest first, the best and the worst named.
  const rows = today.getByRole('list', { name: 'Latest solves' }).getByRole('button');
  const names = await rows.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')),
  );
  expect(names).toEqual([
    expect.stringMatching(/^Solve 3: 11\.[01]\d$/),
    expect.stringMatching(/^Solve 2: 12\.[01]\d, worst$/),
    expect.stringMatching(/^Solve 1: 10\.[01]\d, best$/),
  ]);
  await expect(rows.nth(0)).toContainText('3');
  await expect(rows.nth(1)).toContainText('worst');
  await expect(rows.nth(2)).toContainText('best');
  const boxes = await Promise.all([0, 1, 2].map((i) => rows.nth(i).boundingBox()));
  for (const box of boxes) expect(box?.width).toBe(panel?.width);
  expect(boxes[0]?.y ?? 0).toBeLessThan(boxes[1]?.y ?? 0);
  expect(boxes[1]?.y ?? 0).toBeLessThan(boxes[2]?.y ?? 0);
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
  await expect(rows).toHaveAccessibleName(/^Solve 1: 12\.[01]\d$/);
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
  await expect(page.getByRole('button', { name: /^Solve 1: 12\.[34]\d$/ })).toBeVisible();
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
}
