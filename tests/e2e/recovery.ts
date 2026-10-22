import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { restore } from './practice.ts';

/** Exercises recovery through visible controls with failed IndexedDB solve writes. */
export async function checkAttemptRecovery(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'WCA inspection (15 seconds)' }).uncheck();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'solves') throw new DOMException('Storage full', 'QuotaExceededError');
      return Reflect.apply(add, this, args);
    };
    Object.assign(window, {
      restoreSolveWrites: () => {
        IDBObjectStore.prototype.add = add;
      },
    });
  });
  for (const count of [1, 2]) {
    await page.keyboard.down(' ');
    await page.clock.runFor(350);
    await page.keyboard.up(' ');
    await page.clock.runFor(count * 3_000);
    await page.keyboard.down(' ');
    await page.keyboard.up(' ');
    await expect(
      page.getByRole('button', { name: new RegExp(`Recover ${count} unsaved`) }),
    ).toBeVisible();
  }
  await page.clock.runFor(9_000);
  await expect(
    page.getByText("Couldn't save that solve. This device may be out of space."),
  ).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Sessions' }).click();
  await expect(page.getByRole('heading', { name: 'Sessions', exact: true })).toBeAttached();
  await nav.getByRole('link', { name: 'Timer' }).click();
  await page.getByRole('button', { name: 'Recover 2 unsaved attempts' }).click();
  const sheet = page.getByRole('dialog', { name: 'Unsaved attempts' });
  await expect(sheet.getByRole('listitem')).toHaveCount(2);
  await expect(sheet).toContainText('3x3x3');
  await expect(sheet).toContainText('Destination:');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Recover 2 unsaved attempts' }).click();
  await sheet.getByRole('button', { name: 'Discard' }).last().click();
  await expect(sheet.getByRole('listitem')).toHaveCount(1);
  await page.evaluate(() => {
    (window as unknown as { restoreSolveWrites: () => void }).restoreSolveWrites();
  });
  await sheet.getByRole('button', { name: 'Retry' }).click();
  await expect(sheet.getByText('No unsaved attempts.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: /^Solve 1:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Recover/ })).toHaveCount(0);
}

/** Checks renumbering, averages, and editing after an older attempt is recovered. */
export async function checkRecoveredOrder(page: Page) {
  await restore(page, 100);
  await page.goto('./#/timer');
  await page.getByRole('combobox', { name: 'Session', exact: true }).selectOption({
    label: '12 Oct 2026 (100 solves)',
  });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'WCA inspection (15 seconds)' }).uncheck();
  await page.getByRole('button', { name: 'Close' }).click();
  async function time(seconds: number) {
    await page.keyboard.down(' ');
    await page.clock.runFor(350);
    await page.keyboard.up(' ');
    await page.clock.runFor(seconds * 1_000);
    await page.keyboard.down(' ');
    await page.keyboard.up(' ');
  }
  for (const [index, seconds] of [10, 11, 12, 13].entries()) {
    await time(seconds);
    await expect(
      page.getByRole('button', { name: new RegExp(`^Solve ${index + 101}:`) }),
    ).toBeVisible();
  }
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'solves') {
        IDBObjectStore.prototype.add = add;
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return Reflect.apply(add, this, args);
    };
  });
  await time(14);
  await expect(page.getByRole('button', { name: 'Recover 1 unsaved attempt' })).toBeVisible();
  await time(30);
  await expect(page.getByRole('button', { name: /^Solve 105: 30\./ })).toBeVisible();
  const readout = page.locator('.touch-pad').last().locator('p').first();
  await expect(readout).toHaveText(/^30\.[01]\d$/);
  const newerResult = await readout.textContent();
  await page.getByRole('button', { name: 'Recover 1 unsaved attempt' }).click();
  const recovery = page.getByRole('dialog', { name: 'Unsaved attempts' });
  await recovery.getByRole('button', { name: 'Retry' }).click();
  await expect(recovery.getByText('No unsaved attempts.')).toBeVisible();
  await recovery.getByRole('button', { name: 'Close' }).click();
  await expect(readout).toHaveText(newerResult ?? '');
  await expect(page.getByRole('button', { name: /^Solve 106: 30\./ })).toBeVisible();
  await page.getByRole('button', { name: /^Solve 105: 14\./ }).click();
  const a = page.getByRole('dialog', { name: 'Solve 105' });
  await expect(a.getByRole('definition').first()).toHaveText(/^12\.[01]\d$/);
  await a.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /^Solve 106: 30\./ }).click();
  const b = page.getByRole('dialog', { name: 'Solve 106' });
  await expect(b.getByRole('definition').first()).toHaveText(/^13\.[01]\d$/);
  await b.getByRole('button', { name: 'Close' }).click();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Sessions' })
    .click();
  await page.getByRole('link').filter({ hasText: '106 solves' }).click();
  await page.getByLabel('Order', { exact: true }).selectOption('fastest');
  await expect(page.getByRole('button', { name: /^Solve 105: 14\..*, Ao5 12\./ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Solve 106:/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show more solves' }).click();
  await expect(page.getByRole('button', { name: /^Solve 106: 30\..*, Ao5 13\./ })).toBeVisible();
  await page.getByRole('button', { name: /^Solve 105: 14\./ }).click();
  await a.getByRole('button', { name: '+2', exact: true }).click();
  await expect(a).toContainText('(+2)');
  await a.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(a).toBeHidden();
  await expect(page.getByRole('button', { name: /^Solve 105: 30\..*, Ao5 12\./ })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /^Solve 105: 16\..*\(\+2\), Ao5 12\./ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Solve 106: 30\..*, Ao5 13\.[67]\d/ }),
  ).toBeVisible();
}

/** Keeps real shortcuts attached to the latest result through recovery and deletion. */
export async function checkResultShortcuts(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'WCA inspection (15 seconds)' }).uncheck();
  await page.getByRole('button', { name: 'Close' }).click();
  const readout = page.locator('.touch-pad').last().locator('p').first();
  const time = async (milliseconds: number) => {
    await page.keyboard.down(' ');
    await page.clock.runFor(350);
    await page.keyboard.up(' ');
    await page.clock.runFor(milliseconds);
    await page.keyboard.down(' ');
    await page.keyboard.up(' ');
  };
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'solves') {
        IDBObjectStore.prototype.add = add;
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return Reflect.apply(add, this, args);
    };
  });
  await time(12_340);
  await expect(page.getByRole('button', { name: 'Recover 1 unsaved attempt' })).toBeVisible();
  await time(3_000);
  await expect(page.getByRole('group', { name: 'Solve 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Recover 1 unsaved attempt' }).click();
  const recovery = page.getByRole('dialog', { name: 'Unsaved attempts' });
  await recovery.getByRole('button', { name: 'Retry' }).click();
  await expect(recovery.getByText('No unsaved attempts.')).toBeVisible();
  await recovery.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('group', { name: 'Solve 2' })).toBeVisible();
  await expect(readout).toHaveText(/^3\.\d\d$/);
  await page.keyboard.press('Alt+2');
  await expect(page.getByRole('button', { name: /^Solve 2: 5\..*\(\+2\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Solve 1: 12\./ })).toBeVisible();
  await expect(readout).toHaveText(/^5\.\d\d\+2$/);

  await page.getByRole('button', { name: /^Solve 2: 5\./ }).click();
  const sheet = page.getByRole('dialog', { name: 'Solve 2' });
  await sheet.getByRole('textbox', { name: 'Note' }).fill('Keep this draft');
  await page.keyboard.press('Alt+1');
  await page.keyboard.press('Control+z');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: '+2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Delete' })).toBeEnabled();
  await page.keyboard.press('Alt+1');
  await expect(page.getByRole('button', { name: /^Solve 2: 3\./ })).toBeVisible();
  await page.getByRole('button', { name: '+2', exact: true }).click();
  await expect(readout).toHaveText(/^5\.\d\d\+2$/);
  // The list can update before an edit finishes, and shortcuts wait for it, so wait for its
  // enabled controls and its Undo before the next shortcut.
  await expect(page.getByRole('button', { name: 'Delete' })).toBeEnabled();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: /^Solve 2:/ })).toHaveCount(0);
  await expect(page.getByText('Solve 2 deleted.')).toBeVisible();
  await page.keyboard.press('Alt+2');
  await expect(page.getByRole('button', { name: /^Solve 1: 14\..*\(\+2\)/ })).toBeVisible();

  await page.keyboard.down(' ');
  await page.clock.runFor(350);
  await page.keyboard.up(' ');
  await page.keyboard.press('Alt+3');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Solve 1: 14\./ })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('link').filter({ hasText: '1 solve' }).click();
  await expect(page.getByRole('button', { name: /^Solve 1: 14\..*\(\+2\)/ })).toBeVisible();
  await nav.getByRole('link', { name: 'Timer' }).click();
  // Sessions shows the same row, so wait for the Timer's own list before the shortcut.
  const latest = page.getByRole('list', { name: 'Latest solves' });
  await expect(latest.getByRole('button', { name: /^Solve 1: 14\./ })).toBeVisible();
  await page.keyboard.press('Alt+1');
  await expect(page.getByRole('button', { name: /^Solve 1: 12\./ })).toBeVisible();
}
