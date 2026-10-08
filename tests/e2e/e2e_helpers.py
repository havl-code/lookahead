"""Helpers for the browser tests."""

from helpers import query


def open_tab(page, name):
    page.click(f'.tab[data-tab="{name}"]')


def open_timer(page):
    """Open the Timer tab and wait until it's ready for the space bar. Its last setup step is
    showing a scramble, so wait for one rather than for anything that's in the page from the
    start."""
    open_tab(page, 'timer')
    page.wait_for_function("() => document.getElementById('scramble-text').textContent.split(' ').length >= 20")


def time_a_solve(page, seconds, inspection_seconds=2):
    """Time one solve with the space bar, the way a person does: start inspection, hold until
    the time turns green, let go, and press again to stop."""
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
