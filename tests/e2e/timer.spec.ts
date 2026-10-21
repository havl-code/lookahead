import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { restore } from './practice.ts';

// The page's clock is faked, so inspection and solves take no real time. It keeps ticking between
// steps (pausing it would also pause the app's own saving), so times can come out a few
// hundredths long (more when the machine is busy), and the checks allow up to a tenth.
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 14, 9) });
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Timer' })).toBeAttached();
});

const readout = (page: Page) => page.locator('.touch-pad').last().locator('p').first();

/** A finger going down or up on the timer (the full-screen pad, once an attempt is under way). */
async function touch(page: Page, type: 'pointerdown' | 'pointerup') {
  await page
    .locator('.touch-pad')
    .last()
    .dispatchEvent(type, { pointerType: 'touch', isPrimary: true, pointerId: 1 });
}

async function wait(page: Page, ms: number) {
  await page.clock.runFor(ms);
}

/** Inspects for `inspectMs`, holds, starts, solves for `solveMs`, and stops. */
async function timeASolve(page: Page, inspectMs: number, solveMs: number) {
  await touch(page, 'pointerdown');
  await touch(page, 'pointerup');
  await wait(page, inspectMs - 300);
  await touch(page, 'pointerdown');
  await wait(page, 300);
  await touch(page, 'pointerup');
  await wait(page, solveMs);
  await touch(page, 'pointerdown');
  await touch(page, 'pointerup');
}

test('times a solve with inspection, by touch', async ({ page }) => {
  await touch(page, 'pointerdown');
  await touch(page, 'pointerup');
  await expect(readout(page)).toHaveText('15');
  await wait(page, 2100);
  await expect(readout(page)).toHaveText('13');

  await touch(page, 'pointerdown');
  await wait(page, 100);
  await expect(readout(page)).toHaveClass(/text-danger-ink/);
  await wait(page, 250);
  await expect(readout(page)).toHaveClass(/text-good-ink/);
  await touch(page, 'pointerup');

  await wait(page, 9876);
  await expect(readout(page)).toHaveText(/^9\.[89]\d$/);
  await touch(page, 'pointerdown');
  await touch(page, 'pointerup');

  await expect(readout(page)).toHaveText(/^9\.[89]\d$/);
  await expect(page.getByRole('status').filter({ hasText: 'saved' })).toHaveText(
    /^9\.[89]\d, saved\.$/,
  );
  const today = page.getByRole('region', { name: 'Today' });
  await expect(today.getByRole('definition')).toHaveText([
    '1',
    /^9\.[89]\d$/,
    '-',
    '-',
    /^9\.[89]\d$/,
  ]);
  await expect(page.getByRole('button', { name: /^Solve 1: 9\.[89]\d$/ })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Sessions' })
    .click();
  await wait(page, 100);
  const session = page.getByRole('main').getByRole('listitem');
  await expect(session).toHaveCount(1);
  await expect(session).toContainText('3x3x3');
  await expect(session).toContainText('1 solve');
});

test('gives a +2 for starting after 15 seconds, and a DNF at 17 (A4d1, A4d2)', async ({ page }) => {
  await timeASolve(page, 15_500, 10_000);
  await expect(readout(page)).toContainText(/12\.[01]\d/);
  await expect(page.getByRole('button', { name: /^Solve 1: 12\.[01]\d \(\+2\)$/ })).toBeVisible();

  await touch(page, 'pointerdown');
  await touch(page, 'pointerup');
  await wait(page, 15_200);
  await expect(readout(page)).toHaveText('+2');
  await wait(page, 2_000);
  await expect(page.getByRole('button', { name: 'Solve 2: DNF' })).toBeVisible();
});

test('times with the space bar, with inspection turned off', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'WCA inspection (15 seconds)' }).uncheck();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.keyboard.down(' ');
  await wait(page, 300);
  await page.keyboard.up(' ');
  await wait(page, 12_340);
  await page.keyboard.down(' ');
  await page.keyboard.up(' ');
  await expect(page.getByRole('button', { name: /^Solve 1: 12\.[34]\d$/ })).toBeVisible();

  // Escape calls an attempt off, saving nothing.
  await page.keyboard.down(' ');
  await wait(page, 300);
  await page.keyboard.up(' ');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('region', { name: 'Today' }).getByRole('definition').first(),
  ).toHaveText('1');
});

test('changes a penalty, and deletes with undo', async ({ page }) => {
  await timeASolve(page, 3_000, 10_000);
  await expect(page.getByRole('button', { name: /^Solve 1: 10\.[01]\d$/ })).toBeVisible();

  await page.getByRole('button', { name: '+2', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Solve 1: 12\.[01]\d \(\+2\)$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '+2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: /^Solve 1: 12\.[01]\d \(\+2\)$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Solve 1' });
  await sheet.getByRole('button', { name: 'DNF' }).click();
  await expect(sheet).toContainText('DNF');
  await sheet.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No solves yet today.')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Solve 1: DNF' })).toBeVisible();
});

test('changes and deletes the latest solve from the keyboard, as the desktop does', async ({
  page,
}) => {
  await timeASolve(page, 3_000, 10_000);
  await expect(page.getByRole('button', { name: /^Solve 1: 10\.[01]\d$/ })).toBeVisible();

  await page.keyboard.press('Alt+2');
  await expect(page.getByRole('button', { name: /^Solve 1: 12\.[01]\d \(\+2\)$/ })).toBeVisible();
  await page.keyboard.press('Control+3');
  await expect(page.getByRole('button', { name: 'Solve 1: DNF' })).toBeVisible();
  await page.keyboard.press('Alt+1');
  await expect(page.getByRole('button', { name: /^Solve 1: 10\.[01]\d$/ })).toBeVisible();

  await page.keyboard.press('Control+z');
  await expect(page.getByText('No solves yet today.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /^Solve 1: 10\.[01]\d$/ })).toBeVisible();
});

test('times into a session picked from the menu, or a new one', async ({ page }) => {
  await timeASolve(page, 3_000, 10_000);
  await expect(page.getByRole('button', { name: /^Solve 1: 10\.[01]\d$/ })).toBeVisible();
  const session = page.getByLabel('Session');
  await expect(session.locator('option:checked')).toHaveText('Today (1 solve)');

  // A new session for today starts empty, and the timer times into it.
  await session.selectOption({ label: '+ New session' });
  await expect(page.getByText('No solves yet today.')).toBeVisible();
  await expect(session.locator('option:checked')).toHaveText('Today (0 solves)');
  await timeASolve(page, 3_000, 11_000);
  await expect(page.getByRole('button', { name: /^Solve 1: 11\.[01]\d$/ })).toBeVisible();

  // Picking the earlier one times into it, and it stays picked after visiting another tab.
  await session.selectOption({ index: 2 });
  await expect(page.getByRole('button', { name: /^Solve 1: 10\.[01]\d$/ })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Sessions' }).click();
  await nav.getByRole('link', { name: 'Timer' }).click();
  await expect(session.locator('option:checked')).toHaveText('Today (1 solve)');
  await timeASolve(page, 3_000, 12_000);
  // The slower of the two is the session's worst, and its name says so.
  await expect(page.getByRole('button', { name: /^Solve 2: 12\.[01]\d, worst$/ })).toBeVisible();
  await expect(session.locator('option:checked')).toHaveText('Today (2 solves)');
});

test("shows the Ao5 and Ao12 at a solve in its sheet, not in the phone's chips", async ({
  page,
}) => {
  await timeASolve(page, 3_000, 10_000);
  const solves = page.getByRole('list', { name: 'Latest solves' });
  await expect(solves.getByRole('button')).toHaveAccessibleName(/^Solve 1: 10\.[01]\d$/);
  // The chips show only the result: the averages and their header row are in the page, unseen.
  await expect(solves.getByText('-', { exact: true })).toHaveCount(2);
  await expect(solves.getByText('-', { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText('Ao12', { exact: true }).filter({ visible: true })).toHaveCount(1);

  // Before their windows fill, the sheet shows a dash for both.
  await solves.getByRole('button').click();
  const sheet = page.getByRole('dialog', { name: 'Solve 1' });
  await expect(sheet.getByRole('term')).toHaveText(['Ao5', 'Ao12']);
  await expect(sheet.getByRole('definition')).toHaveText(['-', '-']);
});

test('shows the Ao5 and Ao12 at a solve of a session picked from the menu', async ({ page }) => {
  await restore(page);
  await page.goto('./');
  await page.getByLabel('Session').selectOption({ label: '12 Oct 2026 (25 solves)' });
  await page.getByRole('button', { name: /^Solve 14: / }).click();
  // Solve 14 of the practice backup's 12 October: its Ao5 drops solve 13's DNF as the worst
  // (Regulation 9f8), and its Ao12 drops the DNF and the best, solve 9's 12.60.
  const sheet = page.getByRole('dialog', { name: 'Solve 14' });
  await expect(sheet.getByRole('definition')).toHaveText(['13.44', '13.71']);
});

test('hides all but the scramble and time in fullscreen, as the desktop does', async ({ page }) => {
  await page.getByRole('button', { name: 'Fullscreen' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByLabel('Event')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Today' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Scramble' })).toBeVisible();

  await timeASolve(page, 3_000, 10_000);
  await expect(page.locator('.touch-pad').first()).toContainText(/10\.[01]\d/);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Solve 1: 10\.[01]\d$/ })).toBeVisible();

  // Escape calls off an attempt first, and only then leaves fullscreen, as on the desktop.
  await page.getByRole('button', { name: 'Fullscreen' }).click();
  await touch(page, 'pointerdown');
  await touch(page, 'pointerup');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Event')).toBeHidden();
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect(page.getByLabel('Event')).toBeVisible();

  // Leaving the tab (here, through the browser's history) leaves fullscreen too.
  await page.getByRole('button', { name: 'Fullscreen' }).click();
  await page.goto('./#/sessions');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('keeps the event, and gives blindfolded events no inspection (B1a)', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Event' }).selectOption('333bf');
  await expect(page.getByText('Hold the time until it turns green')).toBeVisible();
  await touch(page, 'pointerdown');
  await wait(page, 300);
  await touch(page, 'pointerup');
  // The hold started the solve straight away: with inspection, it would have started inspecting.
  await wait(page, 8_000);
  await touch(page, 'pointerdown');
  await expect(page.getByRole('button', { name: /^Solve 1: 8\.[01]\d$/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Event' })).toHaveValue('333bf');
});

for (const colorScheme of ['dark', 'light'] as const) {
  test(`has no detectable WCAG 2.2 AA violations with solves, in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await timeASolve(page, 3_000, 10_000);
    await expect(page.getByRole('button', { name: /^Solve 1: 10\.[01]\d$/ })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
