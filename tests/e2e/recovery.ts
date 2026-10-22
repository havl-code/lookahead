import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

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
