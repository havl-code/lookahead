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

## What works so far

- **Timer:** pick an event, then touch the time to inspect, hold until it turns green, and let go
  to start; touch anywhere to stop. Everything but the time hides while you solve, and the screen
  stays on. WCA inspection gives a +2 from 15 seconds and a DNF at 17 (Regulations A4d1 and A4d2),
  with optional sounds at 8 and 12 seconds, and the blindfolded events have none (B1a). Solves go
  into today's session, with OK, +2, DNF, and Delete (with Undo) after each one. On a computer or
  an iPad with a keyboard, the space bar works too, and Escape calls an attempt off.
- **Backups:** on the More tab, **Restore from a backup** takes a backup from the desktop app
  (its **Export backup** link) or from here, and **Make backup** saves one to share or keep.
  Restoring over what's here can be undone. The same file restores in the desktop app. The Timer
  tab reminds you when 100 solves, or a week's worth, aren't backed up yet.
- **Sessions:** every session, for one event or all of them, newest or oldest first, or by best
  single or best Ao5, with its stats worked out exactly as the desktop app does. Tap a session to
  see its best averages up to Ao100 and every solve (newest, fastest, or slowest first), change a
  solve's penalty or note, delete it (with Undo), and type in solves timed somewhere else, such as
  12.34 or 1:23.45. **Add session** makes one for today or an earlier day, and **Edit session**
  changes its date, cube, and notes. A solve that never started stays a DNF (Regulation A4d2).
- **Cubes:** on the More tab, add your cubes (brand, model, and when you bought them), pick one
  for each session, and see each cube's solves, best, and best Ao5 in the event it's used most
  for. A cube you stop using is retired, so its sessions keep it.
- **WCA ID:** on the More tab, type your WCA ID and Lookahead looks up your name on the WCA
  website (the only thing that needs the internet). It travels with your backups.

Analytics and scores, CSTimer import, and picking an older session in the timer come next.

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

The stats and backup code is checked against the desktop app's: `tools/build_pwa_golden.py`
writes the answers the Python code gives to `src/lib/golden/` and `src/features/backup/golden/`,
and the tests compare. Run `uv run tools/build_pwa_golden.py` from the project folder after
changing the desktop app's stats or backups.

The app icons are made from `public/favicon.svg`; see `pwa-assets.config.js` to remake them.
The Space Grotesk font in `src/assets/fonts/` is under the SIL Open Font License 1.1
(`OFL.txt`).
