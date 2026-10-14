import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// The desktop app's test fixture: "Main 3x3" (5 readable solves on 3 days, 2 unreadable rows),
// "2" (5 solves, a One-Handed session in CSTimer), and "Empty".
const fixture = readFileSync(
  new URL('../../../tests/fixtures/cstimer_export.txt', import.meta.url),
);

// The fixture's solves fall on these days in UTC.
test.use({ timezoneId: 'UTC' });

async function chooseFile(page: Page) {
  await page.goto('./#/more');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import from CSTimer' }).click();
  await (await chooser).setFiles({
    name: 'cstimer_20260905.txt',
    mimeType: 'text/plain',
    buffer: fixture,
  });
  return page.getByRole('dialog', { name: 'Import from CSTimer' });
}

test('imports CSTimer sessions, a session a day, and skips them the second time', async ({
  page,
}) => {
  const sheet = await chooseFile(page);
  await expect(sheet.getByRole('checkbox', { name: 'Main 3x3' })).toBeChecked();
  await expect(sheet.getByRole('checkbox', { name: 'Main 3x3' })).toHaveAccessibleDescription(
    "5 solves, 1 Sept 2026 to 3 Sept 2026 (3 days). Best 12.34, mean 13.09. 2 rows can't be read and will be left out.",
  );
  await expect(sheet.getByRole('checkbox', { name: 'Empty' })).toBeDisabled();
  // CSTimer's scramble type says what the second session is for.
  await expect(sheet.getByLabel('Event for 2')).toHaveValue('333oh');
  await expect(sheet.getByText('Event from its scramble type in CSTimer')).toBeVisible();

  await sheet.getByRole('button', { name: 'Import 10 solves' }).click();
  await expect(
    page.getByText("Imported 10 solves into 4 sessions (skipped 2 that couldn't be read)."),
  ).toBeVisible();

  await page.goto('./#/sessions');
  await expect(page.getByText('4 sessions, 10 solves')).toBeVisible();
  for (const name of ['1 Sept 2026, 3x3x3', '3 Sept 2026, 3x3x3', '4 Sept 2026, 3x3x3 One-Handed'])
    await expect(page.getByRole('heading', { name })).toBeVisible();

  // The same file again: nothing new.
  const again = await chooseFile(page);
  await expect(again.getByRole('checkbox', { name: 'Main 3x3' })).not.toBeChecked();
  await expect(again.getByText(/Already in the app/).first()).toBeVisible();
  await again.getByRole('checkbox', { name: 'Main 3x3' }).check();
  await again.getByRole('button', { name: /^Import/ }).click();
  await expect(again.getByRole('alert')).toHaveText(
    "Everything you picked is already in the app, so there's nothing new to import.",
  );
});

test('turns down a file that is not a CSTimer export', async ({ page }) => {
  await page.goto('./#/more');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import from CSTimer' }).click();
  await (await chooser).setFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not json'),
  });
  await expect(page.getByRole('alert')).toHaveText(
    "This file isn't a CSTimer export. In CSTimer, use Export, then Export to file.",
  );
});

test('exports every solve, or one session, as CSV', async ({ page }) => {
  const sheet = await chooseFile(page);
  await sheet.getByRole('button', { name: 'Import 10 solves' }).click();
  await expect(page.getByText(/^Imported 10 solves/)).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export solves (CSV)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^lookahead-solves-\d{4}-\d\d-\d\d\.csv$/);
  const text = readFileSync(await file.path(), 'utf-8');
  expect(text.startsWith('﻿session_id,session_date,event_id,event,cube,')).toBe(true);
  expect(text.trim().split('\r\n')).toHaveLength(11);
  await expect(page.getByText('Solves exported.')).toBeVisible();

  await page.goto('./#/sessions');
  await page.getByRole('heading', { name: '4 Sept 2026, 3x3x3 One-Handed' }).click();
  const one = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export solves (CSV)' }).click();
  expect((await one).suggestedFilename()).toMatch(/^lookahead-solves-session-\d+-/);
});

test('has no detectable WCAG 2.2 AA violations in the picker', async ({ page }) => {
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    const sheet = await chooseFile(page);
    await expect(sheet).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, colorScheme).toEqual([]);
    await sheet.getByRole('button', { name: 'Cancel' }).click();
  }
});
