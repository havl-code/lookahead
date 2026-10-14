# Roadmap

Where Lookahead stands after version 3.3, what it can't do yet, and what
could come next, roughly in order. It's a plan, not a promise: ideas and pull requests are
welcome (see [Contributing](../README.md#-contributing)).

Sizes are rough: **S** is a few hours, **M** is a day or two, and **L** is a week or more.

---

## Done in 3.2

Version 3.2 came from an audit of every feature, a test suite, fixes for everything the audit
found, and six new features, followed by the work in From This Roadmap below. It was released
as [v3.2.0](https://github.com/havl-code/lookahead/releases/tag/v3.2.0) on
10 October 2026.

### Safety and Security

- [`8bacd6f`](https://github.com/havl-code/lookahead/commit/8bacd6f) Other
  websites can no longer change or read your data, or keep the app running (cross-site
  requests and DNS rebinding are refused)
- [`6a64dce`](https://github.com/havl-code/lookahead/commit/6a64dce) Inline
  event handlers moved into scripts, so the page can forbid inline scripts
- [`797f982`](https://github.com/havl-code/lookahead/commit/797f982) Input is
  checked before it's stored, and missing records give a clear 404
- [`dd14068`](https://github.com/havl-code/lookahead/commit/dd14068) A safety
  copy of the database before a restore or a data update

### Fixes to Existing Features

- [`dcd3150`](https://github.com/havl-code/lookahead/commit/dcd3150) CSTimer
  imports keep each solve's date, penalty, and comment, keep session names, and skip solves
  already imported
- [`7f88fb6`](https://github.com/havl-code/lookahead/commit/7f88fb6) A world
  rank only shows when the WCA's rankings support it
- [`0e6acd5`](https://github.com/havl-code/lookahead/commit/0e6acd5),
  [`e4ae826`](https://github.com/havl-code/lookahead/commit/e4ae826),
  [`1b5954d`](https://github.com/havl-code/lookahead/commit/1b5954d), and
  [`25360c0`](https://github.com/havl-code/lookahead/commit/25360c0) The
  timer: a steady clock, WCA inspection, fairer scrambles, and a clear message when a solve
  can't be saved
- [`e8250fd`](https://github.com/havl-code/lookahead/commit/e8250fd) and
  [`75be816`](https://github.com/havl-code/lookahead/commit/75be816) Charts
  and averages follow the WCA rules for DNFs and rounding
- [`5be760c`](https://github.com/havl-code/lookahead/commit/5be760c) and
  [`d397b01`](https://github.com/havl-code/lookahead/commit/d397b01) The PB
  window names the right event, and Average Time is for one event at a time
- [`47c013a`](https://github.com/havl-code/lookahead/commit/47c013a) Toasts
  and an in-page confirm instead of pop-ups that freeze the page

### New Features

- [`606456e`](https://github.com/havl-code/lookahead/commit/606456e) Timer
  settings that stick
- [`fed1d17`](https://github.com/havl-code/lookahead/commit/fed1d17) Solves of
  up to 2 hours, with a notice at the WCA's 60 minute limit
- [`f253039`](https://github.com/havl-code/lookahead/commit/f253039) Edit a
  session's date, cube, and notes
- [`7a11348`](https://github.com/havl-code/lookahead/commit/7a11348) Best Ao5,
  Ao12, Ao50, and Ao100 for each event
- [`8eb96d4`](https://github.com/havl-code/lookahead/commit/8eb96d4) Stats for
  each cube
- [`99fd50f`](https://github.com/havl-code/lookahead/commit/99fd50f) CSV
  export of solves
- [`ca042b5`](https://github.com/havl-code/lookahead/commit/ca042b5) Solve
  notes, shortcuts, and Undo
- [`972ea5c`](https://github.com/havl-code/lookahead/commit/972ea5c) Timers
  for 2x2x2 and 4x4x4

### From This Roadmap

- [`8949b92`](https://github.com/havl-code/lookahead/commit/8949b92) Every event menu built from one list (and 4x4x4 and 5x5x5
  Blindfolded added to them)
- [`9173d8c`](https://github.com/havl-code/lookahead/commit/9173d8c) A copy of the database each day, keeping the newest seven
- [`cf63d97`](https://github.com/havl-code/lookahead/commit/cf63d97) The Scores explanation inside the app, so it works offline
- [`0485edb`](https://github.com/havl-code/lookahead/commit/0485edb) Everything works from the keyboard, windows behave alike, and text meets
  WCAG 2.1 AA contrast in both themes
- [`dba3fa2`](https://github.com/havl-code/lookahead/commit/dba3fa2) Charts without enough data say so without the browser logging an error
- [`e3d1686`](https://github.com/havl-code/lookahead/commit/e3d1686) Each chart described in words for screen readers
- [`4e67f3c`](https://github.com/havl-code/lookahead/commit/4e67f3c) Timers for 5x5x5, 6x6x6, and 7x7x7 (60, 80, and 100 moves, as in the 2009
  Regulations, Article 4f)
- [`730c226`](https://github.com/havl-code/lookahead/commit/730c226) Timing on a touchscreen: hold the time, let go to start, and tap to stop
- [`cec369f`](https://github.com/havl-code/lookahead/commit/cec369f) Each CSTimer session's event picked from its scramble type, with a menu for
  each session in the import
- [`a86cce2`](https://github.com/havl-code/lookahead/commit/a86cce2) A One-Handed timer

### Tests, Tooling, and Docs

- [`6593f1e`](https://github.com/havl-code/lookahead/commit/6593f1e) to
  [`786f93e`](https://github.com/havl-code/lookahead/commit/786f93e) A pytest
  suite with coverage, browser tests in Playwright, regression tests for every audit finding,
  and GitHub Actions on Windows, macOS, and Ubuntu with Python 3.11 and 3.14
- [`4c04814`](https://github.com/havl-code/lookahead/commit/4c04814) Checks
  on the docs' links, anchors, and writing style
- [`f9e9ddb`](https://github.com/havl-code/lookahead/commit/f9e9ddb) Browser tests that hold the page's clock still, so a busy computer can't
  make a timing test fail
- [`4088bed`](https://github.com/havl-code/lookahead/commit/4088bed) The ZIP
  download and `uv run app.py` leave out everything only developers need
- [`e99ff42`](https://github.com/havl-code/lookahead/commit/e99ff42),
  [`5f81716`](https://github.com/havl-code/lookahead/commit/5f81716), and
  [`3fa5ba4`](https://github.com/havl-code/lookahead/commit/3fa5ba4) Docs for
  3.2, the version number, and a new screenshot

## Done in 3.3

Version 3.3 added timers for the blindfolded events and Megaminx, and finished AA contrast. It
was released as [v3.3.0](https://github.com/havl-code/lookahead/releases/tag/v3.3.0)
on 11 October 2026.

- [`7828f84`](https://github.com/havl-code/lookahead/commit/7828f84) Timers for 3x3x3, 4x4x4, and 5x5x5
  Blindfolded, with no inspection (Regulation B1a) and scrambles that end in a random
  orientation, each of the 24 equally likely (4b3a)
- [`88f66c4`](https://github.com/havl-code/lookahead/commit/88f66c4) A Megaminx timer, with 70 move
  scrambles (4b3e, and the 2008 Regulations, Article 4f) in seven lines, as TNoodle writes them
- [`b94e87e`](https://github.com/havl-code/lookahead/commit/b94e87e) Fields, buttons, and switches stand
  out at 3:1 (WCAG 2.1 1.4.11), which finishes AA contrast

## Done Since 3.3

Not released yet.

- [`f205221`](https://github.com/havl-code/lookahead/commit/f205221) The Scores' comparison rebuilt from
  the latest WCA results export each month, by a GitHub Actions workflow that opens a pull
  request (the scoring method stays the same)
- The app is now called Lookahead (it was Speedcube Training Explorer). Backups made under
  the old name still restore
- An early preview of Lookahead for phones, an offline app for the Home Screen, at
  https://havl-code.github.io/lookahead/. It's being rebuilt to do everything the desktop app
  does, and then replaces it

---

## Known Limitations

- **Scrambles are random-move.** Official WCA scrambles for 2x2x2 to 4x4x4 are random-state
  (Regulation 4b3), so these mix the cube well for practice but aren't spread over positions in
  exactly the same way. (The WCA scrambles 5x5x5 to 7x7x7 and Megaminx with random moves too,
  4b3e.)
- **Eleven events have a timer:** every cube from 2x2x2 to 7x7x7, 3x3x3 One-Handed, the three
  blindfolded events (3x3x3, 4x4x4, and 5x5x5), and Megaminx. Clock, Pyraminx, Skewb, and
  Square-1 can be added by hand or imported, but not timed in the app.
- **The timer takes the space bar or a touchscreen,** but not a Stackmat timer or a Bluetooth
  smart cube. On the Timer tab the space bar always belongs to the timer, even with a button
  focused, so buttons there are pressed with Enter.
- **Ctrl+1 to Ctrl+3 are often taken by the browser** for switching tabs, so the hint shows
  Alt+1 to Alt+3, which always work.
- **World rank stops at the top 1,000.** The rankings come from a community-run copy of the
  WCA's results export, which lists the fastest 1,000 people in each event. If it stops
  loading, the Dashboard shows No data.
- **The Analytics scores move on once a month.** The summary of WCA results they compare with
  is rebuilt each month, but only reaches the app once its pull request is merged and the app
  is updated, so scores can shift a little from one version to the next.
- **Undo lasts 8 seconds** and is lost if the page reloads. Deleting a whole session can't be
  undone (the app asks first, and backups and safety copies are the way back).
- **Averages never span two sessions,** and Ao50 and Ao100 follow the community's convention,
  since the WCA only defines Ao5 and Mo3 (Regulation 9f).
- **One person on one computer.** There are no profiles and no syncing; moving to another
  computer means copying the database or a backup.
- **CSV is export only.**
- **CSTimer only says a session's event when that session has its own scramble type** (set in
  the session's options). Sessions that use the overall one start as the import menu's event.

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
  ones, for pages opened before 3.2, and could go in a later version.

---

## Now

Nothing small is left: the borders and the blindfolded and Megaminx timers are done (see
[Done in 3.3](#done-in-33)). Each item below needs a decision or some design first.

## Next

Bigger features, once the basics above are in.

| # | What | Why | Size |
| --- | --- | --- | --- |
| 1 | Goals and streaks: a daily solve target, days in a row, and a target average | Builds on a session a day, and gives a reason to come back | M |
| 2 | Random-state scrambles, bundled so they work offline | Matches competition scrambles (Regulation 4b3); needs a scrambler whose licence fits the app's MIT Licence | L |
| 3 | A world rank model for the whole field, beyond the top 1,000 | Most people are outside the top 1,000, so they see no rank at all today | M |

## Later

Larger changes to how the app works, each worth a design discussion first.

| # | What | Why | Size |
| --- | --- | --- | --- |
| 4 | Timers for every WCA event | Pyraminx, Skewb, Square-1, and Clock need scramblers of their own (3 is a start), and Fewest Moves and Multi-Blind need new flows | L |
| 5 | Per-event training plans | Turns the insights into a weekly plan you can follow | L |
| 6 | Stackmat timer support, through the computer's audio input | The timer cubers already own and use at competitions | L |
| 7 | Bluetooth smart cubes, through Web Bluetooth | Move-by-move solve data, but only in Chromium-based browsers | L |
| 8 | Multiple user profiles | Families and clubs sharing one computer | L |
| 9 | A packaged desktop build | Would remove the uv step; less needed once the phone app, which also installs on a computer, replaces the desktop one | L |

---

## Open Questions

1. **Random-state scrambles:** is it fine to bundle a third-party scrambler, and which licences
   are acceptable alongside the MIT Licence?
2. **Profiles:** one database file per person (simplest, and backups stay separate), or one
   database with profiles inside it?
3. **Packaging:** is removing the uv step worth a much bigger download for each system?
4. **Deleting sessions:** should they get Undo as well, so the app never needs to ask first?
5. **Old timer routes:** remove the timer's own solve routes in a later version, or keep them
   for good?
