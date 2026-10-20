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
  for (const name of tabs) {
    await page.goto(`./#/${name.toLowerCase()}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    const main = await page.getByRole('main').boundingBox();
    expect(main?.width, name).toBe(768);
    // Centred in the 1440 px window, give or take a scroll bar when the tab is taller than it.
    const centre = (main?.x ?? 0) + (main?.width ?? 0) / 2;
    expect(Math.abs(centre - 720), name).toBeLessThanOrEqual(8);
  }
});

test('keeps a solve running when the window narrows to the phone layout and widens again', async ({
  page,
}) => {
  // The page's clock is faked, as in timer.spec.ts, so the solve takes no real time.
  await page.clock.install({ time: new Date(2026, 9, 14, 9) });
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'WCA inspection (15 seconds)' }).uncheck();
  await page.getByRole('button', { name: 'Close' }).click();

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

test('hides the top bar in fullscreen, as it hides the tab bar on a phone', async ({ page }) => {
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();

  await page.getByRole('button', { name: 'Fullscreen' }).click();
  await expect(nav).toBeHidden();
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
}
