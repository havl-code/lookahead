# Roadmap

Where Speedcube Training Explorer stands after version 3.1, what it can't do yet, and what
could come next, roughly in order. It's a plan, not a promise: ideas and pull requests are
welcome (see [Contributing](../README.md#-contributing)).

Sizes are rough: **S** is a few hours, **M** is a day or two, and **L** is a week or more.

---

## Done in 3.1

Version 3.1 came from an audit of every feature, a test suite, fixes for everything the audit
found, and six new features. The commit links work once the branch is on GitHub.

### Safety and Security

- [`c04af90`](https://github.com/havl-code/speedcube-training-explorer/commit/c04af90) Other
  websites can no longer change or read your data, or keep the app running (cross-site
  requests and DNS rebinding are refused)
- [`4d7a23c`](https://github.com/havl-code/speedcube-training-explorer/commit/4d7a23c) Inline
  event handlers moved into scripts, so the page can forbid inline scripts
- [`aa4ef0c`](https://github.com/havl-code/speedcube-training-explorer/commit/aa4ef0c) Input is
  checked before it's stored, and missing records give a clear 404
- [`1bb572b`](https://github.com/havl-code/speedcube-training-explorer/commit/1bb572b) A safety
  copy of the database before a restore or a data update

### Fixes to Existing Features

- [`3f89ec3`](https://github.com/havl-code/speedcube-training-explorer/commit/3f89ec3) CSTimer
  imports keep each solve's date, penalty, and comment, keep session names, and skip solves
  already imported
- [`b2e1c7b`](https://github.com/havl-code/speedcube-training-explorer/commit/b2e1c7b) A world
  rank only shows when the WCA's rankings support it
- [`829966b`](https://github.com/havl-code/speedcube-training-explorer/commit/829966b),
  [`009e94c`](https://github.com/havl-code/speedcube-training-explorer/commit/009e94c),
  [`1f065c8`](https://github.com/havl-code/speedcube-training-explorer/commit/1f065c8), and
  [`5f06c80`](https://github.com/havl-code/speedcube-training-explorer/commit/5f06c80) The
  timer: a steady clock, WCA inspection, fairer scrambles, and a clear message when a solve
  can't be saved
- [`2fb0509`](https://github.com/havl-code/speedcube-training-explorer/commit/2fb0509) and
  [`403b4dd`](https://github.com/havl-code/speedcube-training-explorer/commit/403b4dd) Charts
  and averages follow the WCA rules for DNFs and rounding
- [`4ee2da9`](https://github.com/havl-code/speedcube-training-explorer/commit/4ee2da9) and
  [`de0d60d`](https://github.com/havl-code/speedcube-training-explorer/commit/de0d60d) The PB
  window names the right event, and Average Time is for one event at a time
- [`f5cdde2`](https://github.com/havl-code/speedcube-training-explorer/commit/f5cdde2) Toasts
  and an in-page confirm instead of pop-ups that freeze the page

### New Features

- [`b9a4f0e`](https://github.com/havl-code/speedcube-training-explorer/commit/b9a4f0e) Timer
  settings that stick
- [`61a7b60`](https://github.com/havl-code/speedcube-training-explorer/commit/61a7b60) Solves of
  up to 2 hours, with a notice at the WCA's 60 minute limit
- [`0a876da`](https://github.com/havl-code/speedcube-training-explorer/commit/0a876da) Edit a
  session's date, cube, and notes
- [`172beae`](https://github.com/havl-code/speedcube-training-explorer/commit/172beae) Best Ao5,
  Ao12, Ao50, and Ao100 for each event
- [`3c96829`](https://github.com/havl-code/speedcube-training-explorer/commit/3c96829) Stats for
  each cube
- [`01bd8d1`](https://github.com/havl-code/speedcube-training-explorer/commit/01bd8d1) CSV
  export of solves
- [`19acc0d`](https://github.com/havl-code/speedcube-training-explorer/commit/19acc0d) Solve
  notes, shortcuts, and Undo
- [`2e8f5ec`](https://github.com/havl-code/speedcube-training-explorer/commit/2e8f5ec) Timers
  for 2x2x2 and 4x4x4

### From This Roadmap

- [`ef66a38`](https://github.com/havl-code/speedcube-training-explorer/commit/ef66a38) Every event menu built from one list (and 4x4x4 and 5x5x5
  Blindfolded added to them)
- [`40fc454`](https://github.com/havl-code/speedcube-training-explorer/commit/40fc454) A copy of the database each day, keeping the newest seven
- [`f95d454`](https://github.com/havl-code/speedcube-training-explorer/commit/f95d454) The Scores explanation inside the app, so it works offline
- [`33da1ba`](https://github.com/havl-code/speedcube-training-explorer/commit/33da1ba) Everything works from the keyboard, windows behave alike, and text meets
  WCAG 2.1 AA contrast in both themes
- [`5a9970d`](https://github.com/havl-code/speedcube-training-explorer/commit/5a9970d) Charts without enough data say so without the browser logging an error
- [`cb3cf2b`](https://github.com/havl-code/speedcube-training-explorer/commit/cb3cf2b) Each chart described in words for screen readers
- [`477f9c0`](https://github.com/havl-code/speedcube-training-explorer/commit/477f9c0) Timers for 5x5x5, 6x6x6, and 7x7x7 (60, 80, and 100 moves, as in the 2009
  Regulations, Article 4f)
- [`563bfd1`](https://github.com/havl-code/speedcube-training-explorer/commit/563bfd1) Timing on a touchscreen: hold the time, let go to start, and tap to stop
- [`49d32eb`](https://github.com/havl-code/speedcube-training-explorer/commit/49d32eb) Each CSTimer session's event picked from its scramble type, with a menu for
  each session in the import
- [`e55e523`](https://github.com/havl-code/speedcube-training-explorer/commit/e55e523) A One-Handed timer

### Tests, Tooling, and Docs

- [`3f56928`](https://github.com/havl-code/speedcube-training-explorer/commit/3f56928) to
  [`66929ef`](https://github.com/havl-code/speedcube-training-explorer/commit/66929ef) A pytest
  suite with coverage, browser tests in Playwright, regression tests for every audit finding,
  and GitHub Actions on Windows, macOS, and Ubuntu with Python 3.11 and 3.14
- [`8e54bad`](https://github.com/havl-code/speedcube-training-explorer/commit/8e54bad) Checks
  on the docs' links, anchors, and writing style
- [`9d9cedf`](https://github.com/havl-code/speedcube-training-explorer/commit/9d9cedf) Browser tests that hold the page's clock still, so a busy computer can't
  make a timing test fail
- [`e177c61`](https://github.com/havl-code/speedcube-training-explorer/commit/e177c61) The ZIP
  download and `uv run app.py` leave out everything only developers need
- [`db2b071`](https://github.com/havl-code/speedcube-training-explorer/commit/db2b071),
  [`4199ee1`](https://github.com/havl-code/speedcube-training-explorer/commit/4199ee1), and
  [`b83bb53`](https://github.com/havl-code/speedcube-training-explorer/commit/b83bb53) Docs for
  3.1, the version number, and a new screenshot

---

## Known Limitations

- **Scrambles are random-move.** Official WCA scrambles for 2x2x2 to 4x4x4 are random-state
  (Regulation 4b3), so these mix the cube well for practice but aren't spread over positions in
  exactly the same way. (The WCA scrambles 5x5x5 to 7x7x7 with random moves too, 4b3e.)
- **Seven events have a timer:** every cube from 2x2x2 to 7x7x7, and 3x3x3 One-Handed. Other
  events can be added by hand or imported, but not timed in the app.
- **The timer takes the space bar or a touchscreen,** but not a Stackmat timer or a Bluetooth
  smart cube. On the Timer tab the space bar always belongs to the timer, even with a button
  focused, so buttons there are pressed with Enter.
- **Ctrl+1 to Ctrl+3 are often taken by the browser** for switching tabs, so the hint shows
  Alt+1 to Alt+3, which always work.
- **World rank stops at the top 1,000.** The rankings come from a community-run copy of the
  WCA's results export, which lists the fastest 1,000 people in each event. If it stops
  loading, the Dashboard shows No data.
- **The Analytics scores compare with a fixed snapshot** of WCA results (30 September 2024 to 30
  September 2026). It only moves on when someone rebuilds it with
  [`tools/build_wca_reference.py`](../tools/build_wca_reference.py).
- **Undo lasts 8 seconds** and is lost if the page reloads. Deleting a whole session can't be
  undone (the app asks first, and backups and safety copies are the way back).
- **Averages never span two sessions,** and Ao50 and Ao100 follow the community's convention,
  since the WCA only defines Ao5 and Mo3 (Regulation 9f).
- **One person on one computer.** There are no profiles and no syncing; moving to another
  computer means copying the database or a backup.
- **CSV is export only.**
- **CSTimer only says a session's event when that session has its own scramble type** (set in
  the session's options). Sessions that use the overall one start as the import menu's event.
- **Field and button borders are faint.** Text meets WCAG 2.1 AA, but the edges of fields and
  buttons are about 1.5:1 against the page, short of the 3:1 that 1.4.11 asks for.

### Tech Debt

- The events are listed twice, as `EVENT_NAMES` in `config.js` and in `speedcube/events.py`
  (a test keeps them in step).
- `solves.penalty` stores OK as either `NULL` or `'OK'`, so every reader has to handle both.
- The timer sends a +2 solve's time with the 2 seconds already added, and the server takes them
  off again (documented and tested, but easy to trip over).
- SQLite's `user_version` doubles as `STATS_VERSION`, so schema changes need their own column
  checks (`db.ADDED_COLUMNS`).
- `db.add_solve` numbers solves with `MAX() + 1`, which is fine for one person but racy in
  theory.
- The schema has no foreign keys; they're checked in code instead, since adding them means
  rebuilding the tables of existing databases.
- The add and edit cube forms duplicate their markup (`cubes.js`).
- The timer's own `/api/timer/solve/<id>` routes are kept beside the shared `/api/solves/<id>`
  ones, for pages opened before 3.1, and could go in a later version.

---

## Now

Small, safe steps that build on 3.1.

| # | What | Why | Size |
| --- | --- | --- | --- |
| 1 | Merge the branch and tag a v3.1.0 release | CI passes on Windows, macOS, and Ubuntu, and a release gives people a clean download | S |
| 2 | Field and button borders at 3:1 against the page (WCAG 2.1 1.4.11) | The last part of AA contrast; it changes the look a little, so it waits for the owner's say | S |

## Next

Bigger features, once the basics above are in.

| # | What | Why | Size |
| --- | --- | --- | --- |
| 3 | Timers for the blindfolded events | 3x3x3 scrambles (and 4x4x4 and 5x5x5 ones) already exist; blindfolded solves have no inspection (Regulation B1a), and their scrambles leave the cube in a random orientation (4b3a) | S |
| 4 | A Megaminx timer | The WCA scrambles Megaminx with random moves too (4b3e), 70 of them (2008 Regulations, 4f) | S |
| 5 | Goals and streaks: a daily solve target, days in a row, and a target average | Builds on a session a day, and gives a reason to come back | M |
| 6 | Refresh `wca_reference.json` on a schedule, with CI rebuilding it and opening a pull request | Keeps the scores' comparison current without anyone remembering to do it (the scoring method stays the same) | M |
| 7 | Random-state scrambles, bundled so they work offline | Matches competition scrambles (Regulation 4b3); needs a scrambler whose licence fits the app's MIT Licence | L |
| 8 | A world rank model for the whole field, beyond the top 1,000 | Most people are outside the top 1,000, so they see no rank at all today | M |

## Later

Larger changes to how the app works, each worth a design discussion first.

| # | What | Why | Size |
| --- | --- | --- | --- |
| 9 | Timers for every WCA event | Pyraminx, Skewb, Square-1, and Clock need scramblers of their own (7 is a start), and Fewest Moves and Multi-Blind need new flows | L |
| 10 | Per-event training plans | Turns the insights into a weekly plan you can follow | L |
| 11 | Stackmat timer support, through the computer's audio input | The timer cubers already own and use at competitions | L |
| 12 | Bluetooth smart cubes, through Web Bluetooth | Move-by-move solve data, but only in Chromium-based browsers | L |
| 13 | Multiple user profiles | Families and clubs sharing one computer | L |
| 14 | A PWA or a packaged desktop build | A packaged build would remove the uv step; a PWA adds an app window, but still needs the server | L |

---

## Open Questions

1. **Release:** tag a v3.1.0 release on GitHub once the branch is merged?
2. **Random-state scrambles:** is it fine to bundle a third-party scrambler, and which licences
   are acceptable alongside the MIT Licence?
3. **Profiles:** one database file per person (simplest, and backups stay separate), or one
   database with profiles inside it?
4. **Packaging:** is removing the uv step worth a much bigger download for each system?
5. **Deleting sessions:** should they get Undo as well, so the app never needs to ask first?
6. **Scores data:** is a monthly automatic refresh fine, given that scores shift a little as the
   two-year window moves?
7. **Old timer routes:** remove the timer's own solve routes in 3.2, or keep them for good?
8. **Borders:** is it fine to darken the edges of fields and buttons to 3:1 (WCAG 1.4.11)? It
   makes them noticeably stronger, especially in the dark theme.
