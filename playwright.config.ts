import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const isCi = Boolean(process.env.CI);
const base = process.env.BASE_PATH ?? '/lookahead/';
// The wide layout's spec runs only at a computer's size, and the rest only on the iPhone.
const wideSpec = 'wide.spec.ts';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}${base}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // WebKit with an iPhone viewport. Not the same as iOS Safari; see the on-device checklist.
      // Runs in CI. Needs Ubuntu or Debian system libraries to run locally.
      name: 'iphone-webkit',
      use: { ...devices['iPhone 17'] },
      testIgnore: wideSpec,
    },
    {
      // Local stand-in for hosts that cannot run Playwright's WebKit build.
      name: 'iphone-chromium',
      use: { ...devices['iPhone 17'], browserName: 'chromium' },
      testIgnore: wideSpec,
    },
    {
      // The wide layout, at a computer's size with a mouse. Runs in CI and locally.
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testMatch: wideSpec,
    },
  ],
  webServer: {
    // Test the production build so the Content Security Policy is in force.
    command: `pnpm build && pnpm preview --port ${port} --strictPort`,
    url: `http://localhost:${port}${base}`,
    reuseExistingServer: !isCi,
  },
});
