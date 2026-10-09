"""Changing and deleting single solves in the browser: the timer's shortcuts and notes, Undo, and
the Sessions tab's penalty menus and notes."""

import pytest

from e2e_helpers import open_tab, open_timer, time_a_solve
from helpers import query, seed_session

pytestmark = pytest.mark.e2e


def solves(flask_app):
    return query(flask_app, 'SELECT solve_number, time_ms, penalty, dnf, notes FROM solves ORDER BY solve_number')


def time_and_wait(page, seconds, count):
    """Time a solve and wait until the timer has saved it and listed it."""
    time_a_solve(page, seconds)
    page.wait_for_function(f"() => !TimerState.savingSolve && TimerState.currentSolves.length === {count}")


def test_shortcuts_change_and_delete_the_last_solve(app_page, live_app):
    page = app_page
    open_timer(page)
    time_and_wait(page, 10.0, 1)
    time_and_wait(page, 11.0, 2)
    display = page.locator('#timer-display')
    assert display.text_content() == '11.00'

    page.keyboard.press('Alt+2')
    page.wait_for_function("() => TimerState.currentSolves[0].penalty === '+2'")
    assert display.text_content() == '13.00 (+2)'
    assert [(s['penalty'], s['dnf']) for s in solves(live_app)] == [('OK', 0), ('+2', 0)]

    page.keyboard.press('Control+3')
    page.wait_for_function("() => TimerState.currentSolves[0].dnf")
    assert display.text_content() == 'DNF'
    page.keyboard.press('Alt+1')
    page.wait_for_function("() => TimerState.currentSolves[0].penalty === 'OK'")
    assert display.text_content() == '11.00'

    # Ctrl+Z deletes the last solve and clears it off the screen; Undo puts it back
    page.keyboard.press('Control+z')
    page.wait_for_function("() => TimerState.currentSolves.length === 1")
    assert display.text_content() == '0.00'
    assert [s['time_ms'] for s in solves(live_app)] == [10000]
    page.click('.toast >> text=Undo')
    page.wait_for_function("() => TimerState.currentSolves.length === 2")
    assert [(s['solve_number'], s['time_ms']) for s in solves(live_app)] == [(1, 10000), (2, 11000)]
    assert page.errors == []


def test_shortcuts_wait_while_a_solve_is_being_timed(app_page, live_app):
    page = app_page
    open_timer(page)
    time_and_wait(page, 10.0, 1)
    page.keyboard.press('Space')  # inspection starts
    page.keyboard.press('Control+z')
    page.keyboard.press('Alt+3')
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    assert [(s['penalty'], s['dnf']) for s in solves(live_app)] == [('OK', 0)]


def test_a_note_from_the_timer(app_page, live_app):
    page = app_page
    open_timer(page)
    time_and_wait(page, 10.0, 1)
    page.click('.solve-item button:has-text("Note")')
    field = page.locator('.prompt-dialog textarea')
    assert page.evaluate("() => document.activeElement.id") == 'prompt-field'
    # Typing a space in the note doesn't start the timer, and Enter saves
    field.type('good cross')
    assert page.evaluate('TimerState.inspection') is False
    page.keyboard.press('Enter')
    page.wait_for_selector('.solve-item .solve-note')
    assert page.text_content('.solve-note') == 'good cross'
    assert solves(live_app)[0]['notes'] == 'good cross'

    # Esc cancels without changing it, and an empty note removes it
    page.click('.solve-item button:has-text("Note")')
    assert field.input_value() == 'good cross'
    page.keyboard.press('Escape')
    assert page.locator('.prompt-dialog').count() == 0
    page.click('.solve-item button:has-text("Note")')
    field.fill('')
    page.click('.prompt-dialog >> text=Save Note')
    page.wait_for_function("() => !document.querySelector('.solve-note')")
    assert solves(live_app)[0]['notes'] == ''
    assert page.errors == []


def test_penalties_and_notes_in_the_sessions_tab(app_page, live_app):
    page = app_page
    seed_session(live_app, [12, 13, 14])
    open_tab(page, 'sessions')
    page.wait_for_selector('#sessions-tbody button:has-text("View")')
    page.click('#sessions-tbody button:has-text("View")')
    page.wait_for_selector('#solves-tbody select')

    page.select_option('#solves-tbody tr:nth-child(2) select', '+2')
    page.wait_for_function("() => document.querySelector('#solves-tbody tr:nth-child(2) td.num:nth-child(2)').textContent === '15.00s'")
    assert [s['penalty'] for s in solves(live_app)] == [None, '+2', None]
    # The session's stats follow (the best single is still 12.00)
    page.wait_for_function("() => AppState.allSessions[0] && AppState.allSessions[0].session_mean > 13.6")

    page.click('#solves-tbody tr:nth-child(3) button:has-text("Note")')
    page.fill('.prompt-dialog textarea', 'popped')
    page.keyboard.press('Enter')
    page.wait_for_selector('#solves-tbody tr:nth-child(3) td.note-cell:has-text("popped")')
    assert solves(live_app)[2]['notes'] == 'popped'

    # A solve with no time (an inspection DNF) can't be made OK; the menu goes back to DNF
    sid = query(live_app, 'SELECT id FROM sessions')[0]['id']
    page.evaluate(f"""() => apiFetch('/sessions/{sid}/solves/add', {{method: 'POST',
        headers: {{'Content-Type': 'application/json'}}, body: JSON.stringify({{time_seconds: 0, penalty: 'DNF'}})}})""")
    page.click('#solve-details-modal .modal-close')
    page.click('#sessions-tbody button:has-text("View")')
    page.wait_for_selector('#solves-tbody tr:nth-child(4) select')
    page.select_option('#solves-tbody tr:nth-child(4) select', 'OK')
    page.wait_for_selector('[role="alert"].toast >> text=only be a DNF')
    assert page.input_value('#solves-tbody tr:nth-child(4) select') == 'DNF'
    # The browser logs the refusal (a 400) itself; nothing else went wrong
    assert [e for e in page.errors if 'status of 400' not in e] == []
