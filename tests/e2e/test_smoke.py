"""A walk through every tab in a real browser: timer, sessions, cubes, import, and analytics."""

import pytest

from e2e_helpers import open_tab, solves_in, time_a_solve
from helpers import FIXTURES, seed_session

pytestmark = pytest.mark.e2e


def test_the_dashboard_loads_cleanly(app_page):
    assert app_page.text_content('#greeting-text') == 'Welcome to Speedcube Training Explorer'
    assert app_page.text_content('#stat-solves') == '0'
    assert app_page.is_hidden('#update-banner')
    assert app_page.errors == []


def test_timer(app_page, live_app):
    page = app_page
    open_tab(page, 'timer')
    page.wait_for_selector('.solves-list-container .empty-note')
    assert len(page.text_content('#scramble-text').split()) >= 20

    time_a_solve(page, 9.87)
    page.wait_for_selector('.solve-item')
    # The saved time includes a few milliseconds of key handling, so compare with what was saved
    saved = solves_in(live_app)[0]['time_ms'] / 1000
    assert 9.87 <= saved < 9.9
    assert float(page.text_content('.solve-item .solve-time')) == pytest.approx(saved, abs=0.01)

    # Mark it +2
    page.select_option('.solve-action-select', '+2')
    page.wait_for_function("document.querySelector('.solve-time').textContent.includes('(+2)')")
    assert float(page.text_content('#stat-best')) == pytest.approx(saved + 2, abs=0.01)

    # Esc cancels a solve in progress, and nothing is saved
    page.keyboard.press('Space')
    page.clock.run_for(1000)
    page.keyboard.down('Space')
    page.clock.run_for(400)
    page.keyboard.up('Space')
    page.clock.run_for(3000)
    page.keyboard.press('Escape')
    page.clock.run_for(100)
    assert page.text_content('#timer-display') == '0.00'
    assert len(solves_in(live_app)) == 1
    assert page.errors == []


def test_sessions(app_page, live_app):
    page = app_page
    open_tab(page, 'sessions')
    page.click('#tab-sessions .section-actions .btn-primary')
    page.fill('#new-session-notes', 'Smoke test')
    page.click('#add-session-form button[type=submit]')
    page.wait_for_selector('#sessions-tbody tr td.num')

    page.click('#sessions-tbody button:has-text("View")')
    page.fill('#new-solve-time', '12.34')
    page.click('#add-solve-form button[type=submit]')
    page.wait_for_selector('#solves-tbody tr td.num')
    assert '12.34s' in page.text_content('#solves-tbody')

    page.click('#solves-tbody button:has-text("Delete")')
    page.wait_for_selector('#solves-tbody td.loading')
    assert solves_in(live_app) == []
    assert page.errors == []


def test_cubes(app_page):
    page = app_page
    open_tab(page, 'cubes')
    page.click('#tab-cubes .section-header .btn-primary')
    page.select_option('#new-cube-type', 'other')
    page.fill('#new-cube-custom-type', 'Mirror blocks')
    page.fill('#new-cube-brand', 'QiYi')
    page.click('#add-cube-form button[type=submit]')
    page.wait_for_selector('#cubes-tbody td strong')
    assert 'Mirror blocks' in page.text_content('#cubes-tbody')

    page.click('#cubes-tbody button:has-text("Edit")')
    page.fill('#edit-cube-brand', 'MoYu')
    page.click('#edit-cube-form button[type=submit]')
    page.wait_for_function("document.getElementById('cubes-tbody').textContent.includes('MoYu')")

    page.click('#cubes-tbody button:has-text("Deactivate")')
    page.wait_for_selector('#cubes-tbody button:has-text("Reactivate")')
    page.click('#cubes-tbody button:has-text("Reactivate")')
    page.wait_for_selector('#cubes-tbody button:has-text("Deactivate")')
    assert page.errors == []


def test_import(app_page, live_app):
    page = app_page
    open_tab(page, 'import')
    page.set_input_files('#file-input', str(FIXTURES / 'cstimer_export.txt'))
    page.click('#preview-btn')
    page.wait_for_selector('.session-checkbox')
    assert page.locator('.session-checkbox').count() == 3
    page.click('#session-selection .btn-primary')
    page.wait_for_selector('#import-status.success')
    assert 'Imported 10 solves' in page.text_content('#import-status')
    assert len(solves_in(live_app)) == 10


def test_analytics_draws_every_chart(app_page, live_app):
    for day in range(1, 13):
        seed_session(live_app, [12 + ((i * 733) % 3000) / 1000 for i in range(25)],
                     date=f'2026-09-{day:02d}')
    page = app_page
    open_tab(page, 'analytics')
    for chart in ('progress-chart', 'distribution-chart', 'breakdown-chart', 'consistency-chart'):
        page.wait_for_selector(f'#{chart} .main-svg')
    assert page.text_content('#metric-speed') != '--'

    page.select_option('#analytics-session-select', index=1)
    for chart in ('progress-chart', 'distribution-chart', 'breakdown-chart'):
        page.wait_for_selector(f'#{chart} .main-svg')
    page.wait_for_selector('#consistency-chart >> text=compares sessions')
    assert page.errors == []
