# Coding Standards

The judgement calls a review checks in a diff. Mechanical rules live in the checks instead:
Biome, `tsc`, and `tools/tests/test_docs.py` (dashes, NZ spelling, links, and the wrap at 100).

## Re-entry

For every `await` reached from a touch, a key, or a browser event (saving a solve, any Dexie
write, `fullscreenchange`), ask what happens when the same input, or another one, arrives
before it settles. A second tap, a shortcut, a session pick, or Escape can all land mid-save.

- Guard the window with a ref that says what's in flight, as the timer's `pending` ref does
  (`'saving'`, then the new solve's id, then `null`), and check it before acting.
- A state change that cancels an attempt (leaving full screen, switching tabs) cancels it
  before anything else runs.
- A fix for a re-entry bug comes with a test that fires the second input mid-flight.

## Parity With 3.3

Statistics, scores, backups, and CSV were ported from the 3.x desktop app, and the files in
`src/**/golden/` hold 3.3's answers.

- A change to ported logic keeps its golden test passing. Never regenerate a golden file to
  make a test pass; a real change of behaviour is the owner's call (see `docs/SCORES.md`).
- A comment naming where code came from says "the 3.x desktop app's" and its path, such as
  `speedcube/cstimer.py` or `web/js/charts.js`.

## Tests

- Tests check behaviour through the module's exported functions or the screen, never its
  internals.
- Expected values come from somewhere other than the code under test: a golden file, a
  worked example, or a WCA Regulation.
- Browser tests wait for what the person would see before acting, such as the menu's text
  rather than a fixed delay.
