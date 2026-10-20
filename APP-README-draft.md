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

- **Timer:** pick an event, then touch the time to inspect, hold until it turns green, and let go to
  start; touch anywhere to stop. Everything but the time hides while you solve, and the screen stays
  on; **Fullscreen** keeps only the scramble and the time showing until you leave it. WCA inspection
  gives a +2 from 15 seconds and a DNF at 17 (Regulations A4d1 and A4d2), with optional sounds at 8
  and 12 seconds, and the blindfolded events have none (B1a). Solves go into today's session, or one
  picked from the menu beside the event (where **+ New session** starts another for today), with OK,
  +2, DNF, and Delete (with Undo) after each one; tap a recent solve to add a note. On a computer or
  an iPad with a keyboard, the space bar works too, Escape calls an attempt off (or leaves
  fullscreen), Alt+1 to Alt+3 (or Ctrl) make the last solve OK, +2, or DNF, and Ctrl+Z (Cmd+Z on a
  Mac) deletes it, as on the desktop.
- **Backups:** on the More tab, **Restore from a backup** takes a backup from the desktop app
  (**Export backup** on its **Import and Export** tab) or from here, and **Make backup** saves one to share or keep.
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
  website. It travels with your backups.
- **Analytics:** for each event, your best single and where it would rank in the world, the
  average of every solve, your best Ao5 to Ao100 (tap a best for its scramble or solves, and its
  session), and the Speed, Consistency, and Overall scores against WCA competitors, with the same
  insights as the desktop app. Four charts (progress, how your times spread out, rolling Ao5 and
  Ao12, and consistency across sessions) cover the whole event or a single session, each with a
  sentence saying what it shows. The scores use the same summary of WCA results as the desktop
  app, and **How the scores work** explains them, both bundled so they work offline.
- **Import and export:** on the More tab, **Import from CSTimer** reads a CSTimer export (TXT or
  JSON) and shows its sessions to pick from, each with its event (CSTimer's scramble type picks
  it where it can). Every solve keeps its date, penalty, and comment, each session can be split
  into one a day, and solves already here are skipped, so importing the same file again only
  adds new ones. **Export solves (CSV)** saves every solve, or one session's (from the session's
  page), for a spreadsheet, in the same columns as the desktop app's.
- **World rank:** worked out the same way as the desktop app's, from the WCA rankings the
  [Unofficial WCA Public API](https://wca-rest-api.robiningelbrecht.be/) publishes. They list
  the fastest 1,000 people in each event, so a slower single shows as outside the top 1,000
  rather than a guess. The phone keeps the rankings it fetches, gets new ones once a day when
  it's online, and uses the ones it has when it isn't, so only the first look at each event, and
  the WCA ID lookup, need the internet.
- **Light or dark:** dark by default, as in the desktop app, unless your phone is set to light.
  **Appearance** on the More tab keeps it light or dark whatever the phone does, or **System**
  follows the phone again. The choice stays on this phone, apart from your backups.

Picking an older session in the timer comes next.

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

The stats, scores, backup, CSTimer import, and CSV export code is checked against the desktop
app's: `tools/build_pwa_golden.py` writes the answers the Python code gives to `src/lib/golden/`,
`src/features/backup/golden/`, and `src/features/import/golden/`, and the tests compare. Run
`uv run tools/build_pwa_golden.py` from the project folder after changing any of those in the
desktop app.

The app icons are made from `public/favicon.svg`; see `pwa-assets.config.js` to remake them.
The Space Grotesk font in `src/assets/fonts/` is under the SIL Open Font License 1.1
(`OFL.txt`).
