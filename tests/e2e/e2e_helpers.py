"""Helpers for the browser tests."""

from helpers import query


def open_tab(page, name):
    page.click(f'.tab[data-tab="{name}"]')


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
