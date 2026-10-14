import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// A backup from the desktop app (tests/fixtures/backup_v3.json, kept in the golden file).
const desktop = JSON.parse(
  readFileSync(new URL('../../src/features/backup/golden/backup-v3.json', import.meta.url), 'utf8'),
).backup;
const desktopFile = {
  name: 'lookahead-backup-2026-10-01.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(desktop)),
};

async function restoreFile(page: Page, file: typeof desktopFile | string) {
  await page.goto('./#/more');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from a backup' }).click();
  await (await chooser).setFiles(file);
}

test.beforeEach(async ({ page }) => {
  // Without file sharing, the backup downloads instead, which Playwright can catch.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
  });
});

test('restores a desktop backup and shows its sessions', async ({ page }) => {
  await page.goto('./#/sessions');
  await expect(page.getByText(/No sessions yet/)).toBeVisible();

  await restoreFile(page, desktopFile);
  const sheet = page.getByRole('dialog', { name: 'Restore backup' });
  await expect(sheet).toContainText('This backup has 2 sessions, 7 solves, and 2 cubes');
  await sheet.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Restored 2 sessions and 7 solves.')).toBeVisible();
  await expect(page.getByText('On this device: 2 sessions, 7 solves, and 2 cubes.')).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Sessions' })
    .click();
  const cards = page.getByRole('main').getByRole('listitem');
  await expect(cards).toHaveCount(2);
  const morning = cards.filter({ hasText: '3x3x3' });
  await expect(morning).toContainText('1 Oct 2026, 3x3x3');
  await expect(morning).toContainText('GAN 14 MagLev · Morning');
  // The same numbers the desktop app shows for this session.
  await expect(morning.getByRole('definition')).toHaveText(['10.99', '13.23', '-', '12.61']);
});

test('backs up and restores on another device, then undoes a restore', async ({
  page,
  browser,
}) => {
  await restoreFile(page, desktopFile);
  await page
    .getByRole('dialog', { name: 'Restore backup' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(page.getByText(/No backup yet\./)).toBeVisible();

  await page.getByRole('button', { name: 'Make backup' }).click();
  await expect(page.getByText('Backup ready: 2 sessions and 7 solves.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save or share backup' }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^lookahead-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const file = await (await download).path();
  await expect(page.getByText(/Last backup:/)).toBeVisible();

  // A separate context has its own empty storage, like a new phone.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await restoreFile(other, file);
  await other
    .getByRole('dialog', { name: 'Restore backup' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(other.getByText('On this device: 2 sessions, 7 solves, and 2 cubes.')).toBeVisible();

  // Restoring over data replaces it, and can be undone.
  const smaller = {
    ...desktop,
    sessions: desktop.sessions.slice(1),
    solves: desktop.solves.slice(-1),
  };
  await restoreFile(other, { ...desktopFile, buffer: Buffer.from(JSON.stringify(smaller)) });
  const sheet = other.getByRole('dialog', { name: 'Restore backup' });
  await expect(sheet).toContainText(
    'Restoring replaces the 2 sessions, 7 solves, and 2 cubes on this device.',
  );
  await sheet.getByRole('button', { name: 'Replace' }).click();
  await expect(other.getByText('On this device: 1 session, 1 solve, and 2 cubes.')).toBeVisible();

  await other.getByRole('button', { name: 'Undo the last restore' }).click();
  await other.getByRole('button', { name: 'Put back' }).click();
  await expect(other.getByText('Put back 2 sessions and 7 solves.')).toBeVisible();
  await expect(other.getByText('On this device: 2 sessions, 7 solves, and 2 cubes.')).toBeVisible();
  await expect(other.getByRole('button', { name: 'Undo the last restore' })).toHaveCount(0);
  await fresh.close();
});

test('explains why a file is not a backup', async ({ page }) => {
  await restoreFile(page, {
    ...desktopFile,
    buffer: Buffer.from(JSON.stringify({ ...desktop, app: 'cstimer' })),
  });
  await expect(page.getByRole('alert')).toHaveText(
    'This file is a backup from another app, not Lookahead.',
  );

  await restoreFile(page, { ...desktopFile, name: 'notes.json', buffer: Buffer.from('not JSON') });
  await expect(page.getByRole('alert')).toHaveText('This file does not look like a valid backup.');
});

test('has no detectable WCAG 2.2 AA violations with sessions restored', async ({ page }) => {
  await restoreFile(page, desktopFile);
  await page
    .getByRole('dialog', { name: 'Restore backup' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(page.getByText('Restored 2 sessions and 7 solves.')).toBeVisible();
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const tab of ['sessions', 'more']) {
      await page.goto(`./#/${tab}`);
      await expect(page.getByText(/2 sessions/).first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations, `${tab} in ${colorScheme} mode`).toEqual([]);
    }
  }
});
