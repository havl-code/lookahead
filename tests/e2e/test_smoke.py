"""A walk through every tab in a real browser: timer, sessions, cubes, import, and analytics."""

import pytest

from e2e_helpers import open_tab, open_timer, solves_in, time_a_solve
from helpers import FIXTURES, seed_session

pytestmark = pytest.mark.e2e


def test_the_dashboard_loads_cleanly(app_page):
    response = app_page.reload()
    assert "script-src 'self'" in response.headers['content-security-policy']
    app_page.wait_for_function("() => document.getElementById('stat-solves').textContent !== '--'")
    assert app_page.text_content('#greeting-text') == 'Welcome to Speedcube Training Explorer'
    assert app_page.text_content('#stat-solves') == '0'
    assert app_page.is_hidden('#update-banner')
    assert app_page.errors == []


def test_world_rank(app_page, live_app, fake_wca):
    """Inside the top 1,000 a best single gets its rank and percentile; beyond, no guess; and
    with no rankings at all, no data."""
    fake_wca.replies['rank/world/single/333.json'] = {
        'items': [{'best': t} for t in range(300, 1300)], 'total': 250000}
    fake_wca.replies['rank/world/single/222.json'] = {
        'items': [{'best': t} for t in range(100, 1100)], 'total': 150000}
    fake_wca.replies['rank/world/single/444.json'] = OSError('offline')
    seed_session(live_app, [5.0], date='2026-09-01')
    seed_session(live_app, [30.0], event='222', date='2026-09-01')
    seed_session(live_app, [60.0], event='444', date='2026-09-01')
    page = app_page
    page.reload()
    page.wait_for_function("() => document.getElementById('stat-rank').textContent.startsWith('~')")
    assert page.text_content('#stat-rank') == '~201'
    assert page.text_content('#stat-rank-note') == 'Top 0.08% worldwide, by best single'

    page.select_option('#event-select', '222')
    page.wait_for_function("() => document.getElementById('stat-rank').textContent === '1,000+'")
    assert page.text_content('#stat-rank-note') == 'Outside the top 1,000, so no estimate'

    page.select_option('#event-select', '444')
    page.wait_for_function("() => document.getElementById('stat-rank').textContent === 'No data'")
    assert page.text_content('#stat-rank-note') == 'based on your best single'
    assert page.errors == []


def test_timer(app_page, live_app):
    page = app_page
    open_timer(page)
    assert len(page.text_content('#scramble-text').split()) >= 20

    time_a_solve(page, 9.87)
    page.wait_for_selector('.solve-item')
    # The saved time includes a few milliseconds of key handling, so compare with what was saved
    saved = solves_in(live_app)[0]['time_ms'] / 1000
    assert 9.87 <= saved < 9.9
    assert float(page.text_content('.solve-item .solve-time')) == pytest.approx(saved, abs=0.01)

    # Mark it +2
    page.select_option('.solve-action-select', '+2')
    page.wait_for_function("() => document.querySelector('.solve-time').textContent.includes('(+2)')")
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


def test_wca_inspection(app_page, live_app):
    """Regulations A3 and A4: 15 seconds to start, +2 from 15 to 17, DNF at 17, with calls at
    8 and 12 seconds."""
    page = app_page
    open_timer(page)
    assert page.evaluate("[14.99, 15, 16.99, 17, 20].map(inspectionPenalty)") == ['OK', '+2', '+2', 'DNF', 'DNF']

    page.keyboard.press('Space')
    page.clock.run_for(2000)
    assert page.text_content('#timer-display') == '13'
    page.clock.run_for(6200)
    assert page.text_content('#inspection-call') == '8 seconds'
    page.clock.run_for(4000)
    assert page.text_content('#inspection-call') == '12 seconds'
    page.clock.run_for(3500)
    assert page.text_content('#timer-display') == '+2'
    page.clock.run_for(2000)  # now past 17 seconds without starting
    page.wait_for_selector('.solve-item')
    solve = solves_in(live_app)[-1]
    assert (solve['penalty'], solve['dnf'], solve['time_ms']) == ('DNF', 1, 0)
    assert page.text_content('#timer-display') == 'DNF'
    assert page.text_content('#inspection-call') == ''

    page.click('#timer-settings-btn')
    assert page.locator('#timer-settings-modal select option').all_text_contents() == ['Off', 'Beep', 'Voice']
    assert 'WCA Inspection (15 seconds)' in page.text_content('#timer-settings-modal')
    assert page.errors == []


def test_a_failed_save_can_be_retried(app_page, live_app):
    """A solve the app can't save isn't lost: the error says why, and Retry sends it again."""
    page = app_page
    open_timer(page)
    page.route('**/api/timer/solve', lambda route: route.abort())
    time_a_solve(page, 7.5)
    page.wait_for_selector("[role=\"alert\"] >> text=the app isn't responding")
    assert solves_in(live_app) == []
    page.unroute('**/api/timer/solve')
    page.click('.toast >> text=Retry')
    page.wait_for_selector('.solve-item')
    assert len(solves_in(live_app)) == 1 and 7500 <= solves_in(live_app)[0]['time_ms'] < 7600
    assert page.dialogs == []


def test_the_two_hour_limit(app_page, live_app):
    """Past 60 minutes (the WCA's longest limit) there's a notice; at 2 hours the timer stops and
    saves a DNF, as a judge does at a time limit (Regulation A1a4)."""
    page = app_page
    open_timer(page)
    page.keyboard.press('Space')
    page.clock.run_for(1000)
    page.keyboard.down('Space')
    page.clock.run_for(400)
    page.keyboard.up('Space')
    page.clock.fast_forward(60 * 60 * 1000 + 1000)
    page.wait_for_selector('.toast >> text=This solve has passed 60 minutes')
    assert solves_in(live_app) == []  # still going
    page.clock.fast_forward(60 * 60 * 1000)
    page.wait_for_selector('.solve-item')
    solve = solves_in(live_app)[0]
    assert (solve['penalty'], solve['dnf'], solve['time_ms']) == ('DNF', 1, 2 * 60 * 60 * 1000)
    assert page.text_content('#timer-display') == 'DNF'
    assert page.locator('[role="alert"] >> text=reached 2 hours').count() == 1


def test_long_solves_added_by_hand(app_page, live_app):
    seed_session(live_app, [], date='2026-09-01')
    page = app_page
    open_tab(page, 'sessions')
    page.click('#sessions-tbody button:has-text("View")')
    page.fill('#new-solve-time', '3900')
    page.click('#add-solve-form button[type=submit]')
    page.wait_for_selector(".toast >> text=It's past 60 minutes")
    page.fill('#new-solve-time', '7300')
    page.click('#add-solve-form button[type=submit]')
    page.wait_for_selector('[role="alert"] >> text=at most 2 hours')
    assert [s['time_ms'] for s in solves_in(live_app)] == [3900000]


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
    page.click('.confirm-dialog [data-choice="confirm"]')
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
    page.wait_for_function("() => document.getElementById('cubes-tbody').textContent.includes('MoYu')")

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
    assert page.text_content('.session-checkbox strong') == 'Main 3x3'  # CSTimer's own name
    assert "can't be read" in page.text_content('.session-checkbox')
    assert page.is_checked('#import-split-by-day')
    page.click('#session-selection .btn-primary')
    page.wait_for_selector('#import-status.success')
    assert 'Imported 10 solves into 4 sessions' in page.text_content('#import-status')
    assert len(solves_in(live_app)) == 10

    # The same file again: everything is marked as already in the app, and nothing is added
    page.set_input_files('#file-input', str(FIXTURES / 'cstimer_export.txt'))
    page.click('#preview-btn')
    page.wait_for_selector('.session-checkbox.imported')
    assert page.locator('.session-checkbox.imported').count() == 2
    assert page.locator('#session-checkboxes input:checked').count() == 0
    assert len(solves_in(live_app)) == 10


def test_buttons_menus_and_windows(app_page, live_app):
    """Every kind of control the page wires up: links, buttons, menus, forms, and windows."""
    page = app_page
    theme = page.evaluate('document.documentElement.dataset.theme')
    page.click('.theme-toggle')
    assert page.evaluate('document.documentElement.dataset.theme') != theme

    page.click('.quick-actions >> text=Add Session')
    assert page.is_visible('#tab-sessions #add-session-form')
    page.click('#add-session-form >> text=Cancel')
    assert page.is_hidden('#add-session-form')
    page.click('.brand')
    page.click('.quick-actions >> text=Add Cube')
    assert page.is_visible('#add-cube-form')
    page.click('.brand')

    page.click('#wca-setup-prompt button')
    assert page.is_visible('#wca-setup-modal')
    page.click('#wca-setup-modal .modal-close')
    assert page.is_hidden('#wca-setup-modal')

    seed_session(live_app, [12, 13], date='2026-09-01')
    page.reload()
    page.wait_for_function("() => document.getElementById('stat-solves').textContent === '2'")
    page.select_option('#event-select', '333')
    page.click('#stat-pb')
    page.wait_for_selector('#pb-modal')
    page.mouse.click(5, 5)  # the dark area around the window
    assert page.locator('#pb-modal').count() == 0

    page.click('.tab[data-tab="timer"]')
    page.wait_for_selector('#scramble-text')
    before = page.text_content('#scramble-text')
    page.click('.scramble-display')
    assert page.is_visible('.scramble-menu')
    page.click('.scramble-menu >> text=New Scramble')
    assert page.text_content('#scramble-text') != before
    assert page.is_hidden('.scramble-menu')

    page.click('#timer-settings-btn')
    page.click('#timer-settings-modal .setting-item:has-text("Hide Stats") .setting-toggle')
    assert page.evaluate("document.querySelector('.timer-session-stats').classList.contains('hidden')")
    page.click('#timer-settings-modal >> text=Close')
    assert page.locator('#timer-settings-modal').count() == 0

    page.click('.tab[data-tab="sessions"]')
    page.wait_for_selector('#sessions-tbody td.num')
    page.select_option('#filter-event', '333')
    assert page.locator('#sessions-tbody tr').count() == 1

    with page.expect_download() as download:
        page.click('text=Export backup')
    assert download.value.suggested_filename.startswith('speedcube-backup-')
    with page.expect_file_chooser() as chooser:
        page.click('text=Import backup')
    assert chooser.value is not None
    assert page.errors == []


def test_confirms_and_toasts(app_page, live_app):
    """Deleting asks in the page (not with a browser pop-up); Esc keeps things, Enter goes ahead,
    and the outcome shows in a toast that doesn't block anything."""
    seed_session(live_app, [12, 13], date='2026-09-01')
    page = app_page
    page.click('.tab[data-tab="sessions"]')
    page.wait_for_selector('#sessions-tbody td.num')
    delete = page.locator('#sessions-tbody button:has-text("Delete")')

    delete.click()
    page.wait_for_selector('.confirm-dialog')
    assert page.evaluate("document.activeElement.dataset.choice") == 'confirm'
    page.keyboard.press('Escape')
    assert page.locator('.confirm-dialog').count() == 0
    assert len(solves_in(live_app)) == 2
    assert page.evaluate("document.activeElement.dataset.action") == 'delete-session'  # focus is back

    delete.click()
    page.click('.confirm-dialog >> text=Cancel')
    assert len(solves_in(live_app)) == 2

    delete.click()
    page.keyboard.press('Enter')
    page.wait_for_selector('[role="status"].toast >> text=Session deleted')
    assert solves_in(live_app) == []

    # Deactivating a cube is undoable, so it happens at once with an Undo in the toast
    page.click('.tab[data-tab="cubes"]')
    page.click('#tab-cubes .section-header .btn-primary')
    page.select_option('#new-cube-type', '333')
    page.click('#add-cube-form button[type=submit]')
    page.click('#cubes-tbody button:has-text("Deactivate")')
    page.click('.toast >> text=Undo')
    page.wait_for_selector('#cubes-tbody button:has-text("Deactivate")')
    assert page.dialogs == [] and page.errors == []


def test_analytics_draws_every_chart(app_page, live_app):
    for day in range(1, 13):
        # DNFs leave gaps in the charts and count in their averages the WCA way
        results = [12 + ((i * 733) % 3000) / 1000 for i in range(25)]
        results[3] = results[17] = 'DNF'
        seed_session(live_app, results, date=f'2026-09-{day:02d}')
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
