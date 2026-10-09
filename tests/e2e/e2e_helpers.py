"""Helpers for the browser tests."""

from contextlib import contextmanager

from helpers import query


def open_tab(page, name):
    page.click(f'.tab[data-tab="{name}"]')


def open_timer(page):
    """Open the Timer tab and wait until it's ready for the space bar. Its last setup step is
    showing a scramble, so wait for one rather than for anything that's in the page from the
    start."""
    open_tab(page, 'timer')
    page.wait_for_function("() => document.getElementById('scramble-text').textContent.split(' ').length >= 20")


@contextmanager
def paused_clock(page):
    """Hold the page's clock still, so only page.clock.run_for() moves it on. Otherwise it also
    runs in real time between steps, and on a slow or busy computer that can push a 16 second
    inspection past 17 (a DNF instead of a +2). It runs again afterwards, since charts and the
    like need it to."""
    # pause_at takes seconds (Date.now() is in milliseconds) and can only move the clock on, so
    # aim a second ahead: on a busy computer, time passes between reading the clock and pausing
    page.clock.pause_at((page.evaluate('() => Date.now()') + 1000) / 1000)
    try:
        yield
    finally:
        page.clock.resume()


def time_a_solve(page, seconds, inspection_seconds=2):
    """Time one solve with the space bar, the way a person does: start inspection, hold until
    the time turns green, let go, and press again to stop. The clock is held still meanwhile,
    so the solve takes exactly `seconds` and inspection exactly `inspection_seconds` (plus the
    0.4 second hold)."""
    with paused_clock(page):
        page.keyboard.press('Space')
        page.clock.run_for(inspection_seconds * 1000)
        page.keyboard.down('Space')
        page.clock.run_for(400)
        page.keyboard.up('Space')
        page.clock.run_for(round(seconds * 1000))
        page.keyboard.down('Space')
        page.keyboard.up('Space')


def solves_in(flask_app):
    """Every solve the app has saved, oldest first."""
    return query(flask_app, 'SELECT session_id, solve_number, time_ms, penalty, dnf FROM solves ORDER BY id')
