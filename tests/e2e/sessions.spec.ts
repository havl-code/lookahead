import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

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
  await sheet.getByRole('button', { name: 'Close' }).click();

  const session = page.getByRole('region', { name: 'Session' });
  await expect(session.getByRole('definition')).toHaveText(['3', '12.00', '1:02.50', '28.95']);
  const solves = page.getByRole('main').getByRole('listitem');
  const names = () =>
    solves
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')));
  await expect.poll(names).toEqual(['Solve 3: 12.00 (+2)', 'Solve 2: 1:02.50', 'Solve 1: 12.34']);
  await page.getByLabel('Order').selectOption('Fastest first');
  await expect.poll(names).toEqual(['Solve 3: 12.00 (+2)', 'Solve 1: 12.34', 'Solve 2: 1:02.50']);

  await solves.filter({ hasText: '12.34' }).getByRole('button').click();
  const solve = page.getByRole('dialog', { name: 'Solve 1' });
  await solve.getByRole('button', { name: 'DNF' }).click();
  await solve.getByLabel('Note').fill('Popped');
  await solve.getByRole('button', { name: 'Save note' }).click();
  await expect(solve.getByRole('status')).toHaveText('Note saved.');
  await solve.getByRole('button', { name: 'Close' }).click();
  await expect
    .poll(names)
    .toEqual(['Solve 3: 12.00 (+2)', 'Solve 2: 1:02.50', 'Solve 1: DNF, Popped']);
  await expect(session.getByRole('definition').nth(1)).toHaveText('12.00');

  // Delete, then Undo.
  await solves.filter({ hasText: '1:02.50' }).getByRole('button').click();
  await page
    .getByRole('dialog', { name: 'Solve 2' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(solves).toHaveCount(2);
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(solves).toHaveCount(3);

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
