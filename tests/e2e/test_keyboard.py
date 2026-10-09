"""Using the app with the keyboard alone: the Dashboard's clickable stats, the windows (focus goes
in, Tab stays in, Esc closes, focus comes back), the timer settings' switches, the scramble
menu, and sorting a table."""

import pytest

from e2e_helpers import open_tab, open_timer
from helpers import seed_session

pytestmark = pytest.mark.e2e


def focused(page):
    return page.evaluate("() => document.activeElement.id || document.activeElement.className")


def inside(page, selector):
    return page.evaluate(f"() => document.querySelector('{selector}').contains(document.activeElement)")


def test_a_stat_opens_its_details_from_the_keyboard(app_page, live_app):
    page = app_page
    seed_session(live_app, [12, 13])
    page.reload()
    page.wait_for_function("() => document.getElementById('stat-pb').getAttribute('role') === 'button'")
    assert page.get_attribute('#stat-pb', 'aria-label') == 'Personal Best 12.00s'
    page.focus('#stat-pb')
    page.keyboard.press('Enter')
    page.wait_for_selector('#pb-modal')
    assert inside(page, '#pb-modal')
    for _ in range(3):  # Tab stays inside the window
        page.keyboard.press('Tab')
        assert inside(page, '#pb-modal')
    page.keyboard.press('Escape')
    assert page.locator('#pb-modal').count() == 0
    assert focused(page) == 'stat-pb'  # back where it was
    assert page.errors == []


def test_timer_settings_from_the_keyboard(app_page):
    page = app_page
    open_timer(page)
    page.focus('#timer-settings-btn')
    page.keyboard.press('Enter')
    page.wait_for_selector('#timer-settings-modal')
    assert inside(page, '#timer-settings-modal')
    switch = page.locator('[role="switch"][data-setting="hideStats"]')
    assert switch.get_attribute('aria-checked') == 'false'
    assert switch.get_attribute('aria-labelledby') == 'setting-hide-stats'
    switch.focus()
    page.keyboard.press('Enter')
    assert switch.get_attribute('aria-checked') == 'true'
    assert page.evaluate('TimerState.settings.hideStats') is True
    # Esc closes the window, and focus goes back to the button that opened it
    page.keyboard.press('Escape')
    assert page.locator('#timer-settings-modal').count() == 0
    assert focused(page) == 'timer-settings-btn'
    assert page.errors == []


def test_the_scramble_menu_from_the_keyboard(app_page):
    page = app_page
    open_timer(page)
    before = page.text_content('#scramble-text')
    page.focus('.scramble-options-btn')
    page.keyboard.press('Enter')
    assert page.get_attribute('.scramble-options-btn', 'aria-expanded') == 'true'
    assert page.is_visible('#scramble-menu')
    assert page.evaluate("() => document.activeElement.dataset.action") == 'copy-scramble'
    page.keyboard.press('Tab')
    page.keyboard.press('Enter')  # New Scramble
    assert page.text_content('#scramble-text') != before
    assert page.is_hidden('#scramble-menu')
    assert page.get_attribute('.scramble-options-btn', 'aria-expanded') == 'false'
    # Esc closes it too, and goes back to its button
    page.focus('.scramble-options-btn')
    page.keyboard.press('Enter')
    page.keyboard.press('Escape')
    assert page.is_hidden('#scramble-menu') and focused(page) == 'scramble-options-btn'
    assert page.errors == []


def test_sorting_with_space(app_page, live_app):
    page = app_page
    seed_session(live_app, [12], date='2026-09-01')
    open_tab(page, 'sessions')
    page.wait_for_selector('#sessions-tbody button:has-text("View")')
    heading = page.locator('#sessions-table th[data-sort="solves"]')
    assert heading.get_attribute('aria-sort') == 'none'
    heading.focus()
    page.keyboard.press('Space')
    assert heading.get_attribute('aria-sort') == 'descending'
    page.keyboard.press('Enter')
    assert heading.get_attribute('aria-sort') == 'ascending'


def test_windows_move_focus_in_and_back(app_page, live_app):
    page = app_page
    seed_session(live_app, [12, 13], date='2026-09-01')
    open_tab(page, 'sessions')
    view = page.locator('#sessions-tbody button:has-text("View")')
    view.focus()
    page.keyboard.press('Enter')
    page.wait_for_selector('#solves-tbody select')
    assert inside(page, '#solve-details-modal')
    page.keyboard.press('Escape')
    assert page.is_hidden('#solve-details-modal')
    assert page.evaluate("() => document.activeElement.dataset.action") == 'view-session'
    assert page.errors == []
