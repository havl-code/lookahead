import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { restore } from './practice.ts';

const wcag = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function noViolations(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(wcag).analyze();
  expect(results.violations, what).toEqual([]);
}

/** Adds a session for 1 Oct 2026 from the Sessions tab, and opens it. */
async function addSession(page: Page, eventName = '3x3x3') {
  await page.goto('./#/sessions');
  await page.getByRole('button', { name: 'Add session' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add session' });
  await sheet.getByLabel('Event').selectOption({ label: eventName });
  await sheet.getByLabel('Date').fill('2026-10-01');
  await sheet.getByLabel('Notes').fill('Club night');
  await sheet.getByRole('button', { name: 'Add session' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: `1 Oct 2026, ${eventName}` }),
  ).toBeVisible();
}

async function typeSolve(page: Page, time: string, penalty: 'OK' | '+2' | 'DNF' = 'OK') {
  const sheet = page.getByRole('dialog', { name: 'Add a solve' });
  await sheet.getByLabel('Time').fill(time);
  await sheet.getByRole('button', { name: penalty, exact: true }).click();
  await sheet.getByRole('button', { name: 'Add solve' }).click();
  await expect(sheet.getByRole('status')).toHaveText('Solve added.');
}

test('adds a session by hand, types in solves, and edits them', async ({ page }) => {
  await addSession(page);
  await expect(page.getByText('Club night')).toBeVisible();
  await expect(page.getByText(/No solves yet/)).toBeVisible();

  await page.getByRole('button', { name: 'Add a solve' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a solve' });
  await sheet.getByRole('button', { name: 'Add solve' }).click();
  await expect(sheet.getByText('A time is required.')).toBeVisible();
  await expect(sheet.getByLabel('Time')).toHaveAttribute('aria-invalid', 'true');
  await typeSolve(page, '12.34');
  await typeSolve(page, '1:02.5');
  await typeSolve(page, '10', '+2');
  await typeSolve(page, '14');
  await typeSolve(page, '13');
  await sheet.getByRole('button', { name: 'Close' }).click();

  const session = page.getByRole('region', { name: 'Session' });
  await expect(session.getByRole('definition')).toHaveText(['5', '12.00', '1:02.50', '22.77']);
  const solves = page.getByRole('main').getByRole('listitem');
  const names = () =>
    solves
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')));
  await expect
    .poll(names)
    .toEqual([
      'Solve 5: 13.00, Ao5 13.11, Ao12 -',
      'Solve 4: 14.00, Ao5 -, Ao12 -',
      'Solve 3: 12.00 (+2), Ao5 -, Ao12 -',
      'Solve 2: 1:02.50, Ao5 -, Ao12 -',
      'Solve 1: 12.34, Ao5 -, Ao12 -',
    ]);
  const newest = solves.getByRole('button', { name: /^Solve 5:/ });
  await newest.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Solve 5' })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Solve 5' })
    .getByRole('button', { name: 'Close' })
    .click();
  await page.getByLabel('Order').selectOption('Fastest first');
  await expect
    .poll(names)
    .toEqual([
      'Solve 3: 12.00 (+2), Ao5 -, Ao12 -',
      'Solve 1: 12.34, Ao5 -, Ao12 -',
      'Solve 5: 13.00, Ao5 13.11, Ao12 -',
      'Solve 4: 14.00, Ao5 -, Ao12 -',
      'Solve 2: 1:02.50, Ao5 -, Ao12 -',
    ]);

  await solves.filter({ hasText: '12.34' }).getByRole('button').click();
  const solve = page.getByRole('dialog', { name: 'Solve 1' });
  await solve.getByRole('button', { name: 'DNF' }).click();
  await solve.getByLabel('Note').fill('Popped');
  await solve.getByRole('button', { name: 'Save note' }).click();
  await expect(solve.getByRole('status')).toHaveText('Note saved.');
  await solve.getByRole('button', { name: 'Close' }).click();
  await expect
    .poll(names)
    .toEqual([
      'Solve 3: 12.00 (+2), Ao5 -, Ao12 -',
      'Solve 5: 13.00, Ao5 29.83, Ao12 -',
      'Solve 4: 14.00, Ao5 -, Ao12 -',
      'Solve 2: 1:02.50, Ao5 -, Ao12 -',
      'Solve 1: DNF, Ao5 -, Ao12 -, Popped',
    ]);
  await expect(solves.filter({ hasText: 'Popped' })).toHaveCount(1);
  await expect(session.getByRole('definition').nth(1)).toHaveText('12.00');

  // Delete, then Undo.
  await solves.filter({ hasText: '1:02.50' }).getByRole('button').click();
  await page
    .getByRole('dialog', { name: 'Solve 2' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(solves).toHaveCount(4);
  await expect(solves.getByRole('button', { name: 'Solve 4: 13.00, Ao5 -, Ao12 -' })).toBeVisible();
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(solves).toHaveCount(5);
  await expect(
    solves.getByRole('button', { name: 'Solve 5: 13.00, Ao5 29.83, Ao12 -' }),
  ).toBeVisible();

  // Edit the session's date and notes. Its event stays.
  await page.getByRole('button', { name: 'Edit session' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit session' });
  await expect(edit.getByText('Event: 3x3x3')).toBeVisible();
  await edit.getByLabel('Date').fill('2099-01-01');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit.getByText("The date can't be in the future.")).toBeVisible();
  await edit.getByLabel('Date').fill('2026-10-02');
  await edit.getByLabel('Notes').fill('Practice');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '2 Oct 2026, 3x3x3' })).toBeVisible();
  await expect(page.getByText('Practice')).toBeVisible();

  await page.getByRole('link', { name: 'Sessions' }).first().click();
  await expect(page.getByRole('main').getByRole('listitem')).toContainText(['2 Oct 2026, 3x3x3']);
});

test('loads more solves without changing their averages or losing the loaded count on sort', async ({
  page,
}) => {
  await restore(page, 120);
  await page.goto('./#/sessions');
  await page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ hasText: '12 Oct 2026, 3x3x3' })
    .getByRole('link')
    .click();

  const rows = page.getByRole('main').getByRole('listitem');
  await expect(rows).toHaveCount(100);
  const solve21 = rows.getByRole('button', { name: /^Solve 21:/ });
  const originalName = await solve21.getAttribute('aria-label');
  expect(originalName).toMatch(/, Ao5 (?!-)[^,]+, Ao12 (?!-)[^,]+$/);

  await page.getByRole('button', { name: 'Show more solves' }).click();
  await expect(rows).toHaveCount(120);
  await expect(rows.getByRole('button', { name: originalName as string })).toBeVisible();
  await page.getByLabel('Order').selectOption('Fastest first');
  await expect(rows).toHaveCount(120);
  await expect(rows.getByRole('button', { name: originalName as string })).toBeVisible();
});

test('filters and sorts the session list, and deletes a session', async ({ page }) => {
  await addSession(page, '2x2x2');
  await addSession(page, '3x3x3');
  await page.getByRole('button', { name: 'Add a solve' }).click();
  await typeSolve(page, '15');
  await page.goto('./#/sessions');

  const cards = page.getByRole('main').getByRole('listitem');
  await expect(cards).toHaveCount(2);
  await page.getByLabel('Event').selectOption({ label: '2x2x2' });
  await expect(cards).toHaveCount(1);
  await expect(page.getByText('1 session', { exact: true })).toBeVisible();
  await page.getByLabel('Event').selectOption({ label: 'All events' });
  await page.getByLabel('Order').selectOption('Best single');
  await expect(cards.first()).toContainText('3x3x3');

  await cards.filter({ hasText: '3x3x3' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Delete session' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete session' });
  await expect(confirm).toContainText('Delete 1 Oct 2026, 3x3x3 and its 1 solve?');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sessions' })).toBeVisible();
  await expect(cards).toHaveCount(1);
});

test('adds cubes, picks one for a session, and retires it', async ({ page }) => {
  await page.goto('./#/more');
  await page.getByRole('link', { name: /Cubes/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cubes' })).toBeVisible();
  await page.getByRole('button', { name: 'Add cube' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add cube' });
  await sheet.getByLabel('Brand').fill('GAN');
  await sheet.getByLabel('Model').fill('14 MagLev');
  await sheet.getByLabel('Bought on (optional)').fill('2026-01-15');
  await sheet.getByRole('button', { name: 'Add cube' }).click();
  const cubes = page.getByRole('main').getByRole('listitem');
  await expect(cubes).toContainText(['GAN 14 MagLev3x3x3, bought 15 Jan 2026No sessions']);

  await page.getByRole('button', { name: 'Add cube' }).click();
  await sheet.getByLabel('Type').selectOption('Something else');
  await sheet.getByRole('button', { name: 'Add cube' }).click();
  await expect(sheet.getByText('The cube type is required.')).toBeVisible();
  await sheet.getByLabel('What kind of puzzle').fill('Mirror blocks');
  await sheet.getByRole('button', { name: 'Add cube' }).click();
  await expect(cubes).toHaveCount(2);
  await noViolations(page, 'cubes');

  await addSession(page);
  await page.getByRole('button', { name: 'Edit session' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit session' });
  await edit.getByLabel('Cube').selectOption({ label: 'GAN 14 MagLev, 3x3x3' });
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('GAN 14 MagLev · Club night')).toBeVisible();
  await page.getByRole('button', { name: 'Add a solve' }).click();
  await typeSolve(page, '11.11');

  await page.goto('./#/more/cubes');
  const gan = cubes.filter({ hasText: 'GAN' });
  await expect(gan).toContainText('1 solve');
  await expect(gan).toContainText('11.11');
  await gan.getByRole('button').click();
  await page.getByRole('button', { name: 'Retire cube' }).click();
  await expect(cubes).toHaveCount(1);
  await page.getByRole('button', { name: 'Show retired cubes (1)' }).click();
  await expect(cubes).toHaveCount(2);

  // The session keeps its cube, marked as retired in the menu.
  await page.goto('./#/sessions');
  await page.getByRole('main').getByRole('link').first().click();
  await page.getByRole('button', { name: 'Edit session' }).click();
  await expect(edit.getByLabel('Cube')).toHaveValue(/\d+/);
  await expect(edit.getByLabel('Cube').locator('option:checked')).toHaveText(
    'GAN 14 MagLev, 3x3x3 (retired)',
  );
});

test('saves a WCA ID with the name the WCA has for it', async ({ page }) => {
  await page.route('https://www.worldcubeassociation.org/api/v0/persons/*', (route) => {
    const id = route.request().url().split('/').pop();
    return id === '2003POCH01'
      ? route.fulfill({ json: { person: { name: 'Test Person' } } })
      : route.fulfill({ status: 404, json: {} });
  });
  await page.goto('./#/more');
  const field = page.getByLabel('Your WCA ID');
  await field.fill('2003poch1');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/A WCA ID is four digits/)).toBeVisible();
  await field.fill('2099NONE01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    page.getByText('The WCA has no one with that ID. Check it and try again.'),
  ).toBeVisible();
  await field.fill('2003poch01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Test Person (2003POCH01)')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Your WCA profile' })).toHaveAttribute(
    'href',
    'https://www.worldcubeassociation.org/persons/2003POCH01',
  );
  await noViolations(page, 'more with a WCA ID');

  await page.reload();
  await expect(page.getByText('Test Person (2003POCH01)')).toBeVisible();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByLabel('Your WCA ID')).toBeVisible();
});

test('shows the Ao5 and Ao12 at a solve in its sheet, and DNF for an Ao5 with two DNFs', async ({
  page,
}) => {
  await restore(page);
  await page.goto('./#/sessions');
  await page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ hasText: '12 Oct 2026, 3x3x3' })
    .getByRole('link')
    .click();
  await expect(
    page.getByText('Ao5 and Ao12 use the solves in this session up to and including each solve.'),
  ).toBeVisible();
  const solveRow = page.getByRole('button', { name: /^Solve 14: / });
  await expect(solveRow).toHaveAccessibleName('Solve 14: 13.86, Ao5 13.44, Ao12 13.71');
  await page.setViewportSize({ width: 1200, height: 900 });
  const columnHeader = page.getByText('Solve', { exact: true });
  await expect(columnHeader).toBeVisible();
  await expect(page.getByText('Result', { exact: true })).toBeVisible();
  const solveList = columnHeader.locator('..');
  await solveList.evaluate((element) => {
    element.scrollTop = 400;
  });
  await expect
    .poll(async () => {
      const headerBox = await columnHeader.boundingBox();
      const listBox = await solveList.boundingBox();
      return headerBox && listBox ? Math.abs(headerBox.y - listBox.y) : null;
    })
    .toBeLessThanOrEqual(12);
  await solveList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(async () => {
      const headerBox = await columnHeader.boundingBox();
      const listBox = await solveList.boundingBox();
      return headerBox && listBox ? Math.abs(headerBox.y - listBox.y) : null;
    })
    .toBeLessThanOrEqual(12);
  const appScroll = page.getByRole('main').locator('..');
  await appScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(async () => {
      const headerBox = await columnHeader.boundingBox();
      const listBox = await solveList.boundingBox();
      return headerBox && listBox ? Math.abs(headerBox.y - listBox.y) : null;
    })
    .toBeLessThanOrEqual(12);
  await solveRow.click();
  // Solve 14 of the practice backup's 12 October: its Ao5 drops solve 13's DNF as the worst
  // (Regulation 9f8), and its Ao12 drops the DNF and the best, solve 9's 12.60.
  const sheet = page.getByRole('dialog', { name: 'Solve 14' });
  await expect(sheet.getByRole('term')).toHaveText(['Ao5', 'Ao12']);
  await expect(sheet.getByRole('definition')).toHaveText(['13.44', '13.71']);

  const close = sheet.getByRole('button', { name: 'Close' });
  await close.focus();
  await page.setViewportSize({ width: 1023, height: 900 });
  await expect(close).toBeFocused();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(sheet).toBeVisible();
  await expect(close).toBeFocused();

  // A DNF for solve 14 as well puts two DNFs in both windows, so both are DNFs (Regulation 9f9).
  await sheet.getByRole('button', { name: 'DNF' }).click();
  await expect(sheet.getByRole('definition')).toHaveText(['DNF', 'DNF']);
});

test('has no detectable WCAG 2.2 AA violations on a session and its sheets', async ({ page }) => {
  await addSession(page);
  await page.getByRole('button', { name: 'Add a solve' }).click();
  await typeSolve(page, '9.99');
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    await noViolations(page, `add a solve in ${colorScheme} mode`);
  }
  await page
    .getByRole('dialog', { name: 'Add a solve' })
    .getByRole('button', { name: 'Close' })
    .click();
  await noViolations(page, 'session');
  await page.getByRole('main').getByRole('listitem').getByRole('button').click();
  await noViolations(page, 'solve sheet');
});
