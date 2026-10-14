# Lookahead for phones

An early preview of Lookahead as an offline web app for the Home Screen, served by GitHub Pages
at https://havl-code.github.io/lookahead/. Your solves stay on the device: there is no account,
no server, and no tracking. Once it does everything the desktop app does, it replaces it.

## Install

- **iPhone or iPad:** open the link in **Safari**, tap the Share button, then **Add to Home
  Screen**, and open Lookahead from the Home Screen from then on. A Safari tab keeps its own
  separate data, and Safari may clear it after a week without a visit.
- **Android:** open the link in Chrome, then choose **Install app** (or **Add to Home screen**)
  from the menu.
- **Computer:** in Chrome or Edge, use the install button in the address bar.

It works offline after the first visit, and updates itself the next time you leave the app.

## Development

Requirements: Node 22.12 or later (CI uses Node 24) and pnpm. From this folder:

```sh
pnpm install
pnpm dev                # local dev server
pnpm check              # Biome lint and format check
pnpm typecheck          # TypeScript
pnpm test               # unit tests (Vitest)
pnpm build && pnpm size # production build and bundle size budget
pnpm test:e2e           # end-to-end tests in WebKit with an iPhone viewport
```

Playwright's WebKit build needs Ubuntu or Debian system libraries. On other Linux
distributions, run `pnpm test:e2e:chromium` locally instead; CI always runs the WebKit suite.

`.github/workflows/pwa.yml` runs all of these on every push and pull request that touches this
folder, and deploys `main` to GitHub Pages once they pass.

The app icons are made from `public/favicon.svg`; see `pwa-assets.config.js` to remake them.
The Space Grotesk font in `src/assets/fonts/` is under the SIL Open Font License 1.1
(`OFL.txt`).
