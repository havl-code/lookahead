import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fakeRankings, restore } from './practice.ts';

test.beforeEach(({ page }) => fakeRankings(page));

test('says what to do before there are any sessions', async ({ page }) => {
  await page.goto('./#/analytics');
  await expect(page.getByText(/Nothing to analyse yet/)).toBeVisible();
});

test('shows bests, scores, insights, and charts for an event', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The faked rankings answer other events as if offline (see beforeEach), which the browser logs.
  page.on(
    'console',
    (message) =>
      message.type() === 'error' &&
      !message.text().includes('ERR_INTERNET_DISCONNECTED') &&
      errors.push(message.text()),
  );
  await restore(page);
  await page.goto('./#/analytics');

  await expect(
    page.getByText(/^Good (morning|afternoon|evening|night), Test Person\.$/),
  ).toBeVisible();
  await expect(page.getByLabel('Event')).toHaveValue('333');
  await expect(page.getByText('300 solves in 12 sessions')).toBeVisible();
  // The best single, 12.60, is 961st of the 1,000 listed (3.00 to 12.99).
  await expect(page.getByText('~961')).toBeVisible();
  await expect(page.getByText('Top 0.48% worldwide, by best single')).toBeVisible();

  // Each PB opens its details, as the desktop dashboard does: the single's scramble (solve 9 of
  // 12 Oct), and an average's solves with the dropped ones in brackets.
  await page.getByRole('button', { name: /^Best single 12\.60/ }).click();
  const details = page.getByRole('dialog', { name: 'Best single' });
  await expect(details.getByText("R U2 F' 284")).toBeVisible();
  await expect(details.getByRole('link', { name: 'Open its session' })).toBeVisible();
  await details.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /^Best Ao5 / }).click();
  const average = page.getByRole('dialog', { name: 'Best Ao5' });
  await expect(average.getByText('The dropped ones are in brackets.')).toBeVisible();
  await expect(average.getByText(/^(\(?\d+\.\d\d\)? ){4}\(?\d+\.\d\d\)?$/)).toBeVisible();
  await average.getByRole('button', { name: 'Close' }).click();

  const scores = page.getByRole('region', { name: 'Scores' });
  await expect(scores.getByRole('listitem')).toHaveCount(3);
  for (const name of ['Speed', 'Consistency', 'Overall'])
    await expect(scores.getByRole('heading', { name })).toBeVisible();
  await expect(scores.getByText(/^Up [\d.]+ on the 10 sessions before$/).first()).toBeVisible();
  await expect(scores.getByText(/Latest session: typical Ao5 /)).toBeVisible();
  await expect(scores.getByText(/World Cube Association/)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Insights' }).getByRole('listitem').first(),
  ).toBeVisible();

  const charts = page.getByRole('figure');
  await expect(charts).toHaveCount(4);
  await expect(charts.filter({ hasText: 'Progress' })).toContainText(
    '12 sessions, from 1 Oct to 12 Oct.',
  );
  await expect(charts.filter({ hasText: 'How your times spread out' })).toContainText(
    /How 288 solves spread out/,
  );
  await expect(charts.filter({ hasText: 'Rolling averages' })).toContainText('The last 300 solves');
  await expect(charts.filter({ hasText: 'Consistency across sessions' })).toContainText(
    'in the last 10 sessions',
  );
  await expect(page.locator('figure canvas')).toHaveCount(4);

  // One session: its own progress, with no comparison across sessions.
  await page.getByLabel('Charts for').selectOption({ index: 1 });
  await expect(charts).toHaveCount(3);
  await expect(charts.filter({ hasText: 'Progress' })).toContainText(
    'Solves 1 to 25 of this session',
  );
  await expect(charts.filter({ hasText: 'Progress' })).toContainText('1 DNF');

  // An event the WCA reference can score, but with too few solves.
  await page.getByLabel('Event').selectOption({ label: '2x2x2' });
  await expect(scores.getByText('Needs a full Ao5 of solves')).toBeVisible();
  await expect(page.getByText('Needs 12 solves or more.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('keeps the rankings for offline use, and says when it has none', async ({ page }) => {
  await restore(page);
  await page.goto('./#/analytics');
  await expect(page.getByText('~961')).toBeVisible();

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('~961')).toBeVisible();
  // 2x2x2's rankings were never fetched.
  await page.getByLabel('Event').selectOption({ label: '2x2x2' });
  await expect(
    page.getByText("Needs the internet once, to fetch the WCA's rankings"),
  ).toBeVisible();

  // How the scores work comes with the app, as on the desktop.
  await page.getByRole('link', { name: 'How the scores work' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: /How the Analytics Scores Work/ }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /Speed/ })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByLabel('Event')).toBeVisible();
});

test('has no detectable WCAG 2.2 AA violations', async ({ page }) => {
  await restore(page);
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('./#/analytics');
    await expect(page.locator('figure canvas')).toHaveCount(4);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, colorScheme).toEqual([]);
  }
});
