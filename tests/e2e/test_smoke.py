"""A walk through every tab in a real browser: timer, sessions, cubes, import, and analytics."""

import pytest

from e2e_helpers import open_tab, open_timer, paused_clock, solves_in, time_a_solve
from helpers import FIXTURES, query, seed_session

pytestmark = pytest.mark.e2e


def test_the_dashboard_loads_cleanly(app_page):
    response = app_page.reload()
    assert "script-src 'self'" in response.headers['content-security-policy']
    app_page.wait_for_function("() => document.getElementById('stat-solves').textContent !== '--'")
    assert app_page.text_content('#greeting-text') == 'Welcome to Lookahead'
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


def test_best_averages(app_page, live_app):
    """The Dashboard's best averages, and the details of one with its dropped solves in brackets."""
    seed_session(live_app, [20, 9, 'DNF', 10, 11, 12, 30] + [13] * 5, date='2026-09-03')
    page = app_page
    page.reload()
    page.wait_for_function("() => document.getElementById('best-ao5').textContent !== '--'")
    assert page.text_content('#best-ao5') == '11.00s'
    assert page.text_content('#best-ao5-note') == '3 Sept 2026' or page.text_content('#best-ao5-note') == '3 Sep 2026'
    assert page.text_content('#best-ao12') == '14.80s'  # drops only the 9 and the DNF
    assert page.text_content('#best-ao50') == '-'
    assert page.text_content('#best-ao50-note') == 'Needs 50 solves in a session'

    page.click('#best-ao5')
    page.wait_for_selector('#pb-modal')
    assert page.text_content('.pb-event') == 'Best Ao5, 3x3x3'
    assert '(9.00) (DNF) 10.00 11.00 12.00' in page.text_content('#pb-modal')
    page.click('#pb-modal .modal-close')

    page.select_option('#event-select', 'all')
    page.wait_for_function("() => document.getElementById('best-ao5').textContent === '-'")
    assert page.text_content('#best-ao5-note') == 'Choose an event above'
    assert page.errors == []


def test_timer(app_page, live_app):
    page = app_page
    open_timer(page)
    assert len(page.text_content('#scramble-text').split()) >= 20

    time_a_solve(page, 9.87)
    page.wait_for_selector('.solve-item')
    # The clock is held still while timing, so the solve takes exactly as long as it was run for
    assert solves_in(live_app)[0]['time_ms'] == 9870
    assert page.text_content('.solve-item .solve-time').strip() == '9.87'

    # Mark it +2
    page.select_option('.solve-action-select', '+2')
    page.wait_for_function("() => document.querySelector('.solve-time').textContent.includes('(+2)')")
    assert page.text_content('#stat-best') == '11.87'

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

    with paused_clock(page):  # so only run_for moves inspection on, however slow the computer
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
    assert [s['time_ms'] for s in solves_in(live_app)] == [7500]
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

    # Deleting a solve doesn't ask first; it offers Undo, which brings the solve back
    page.click('#solves-tbody button:has-text("Delete")')
    page.wait_for_selector('#solves-tbody td.loading')
    assert solves_in(live_app) == []
    page.click('.toast >> text=Undo')
    page.wait_for_selector('#solves-tbody tr td.num')
    assert [s['time_ms'] for s in solves_in(live_app)] == [12340]
    assert page.errors == []


def test_add_and_edit_a_session(app_page, live_app):
    """A session added by hand can be for an earlier day, and its date, cube, and notes can be
    changed afterwards; the Sessions table shows its cube."""
    from helpers import query, seed_cube
    seed_cube(live_app, '333', 'GAN', '14')
    seed_cube(live_app, '333', 'MoYu', 'RS3M')
    page = app_page
    open_tab(page, 'sessions')
    page.click('#tab-sessions .section-actions .btn-primary')
    today = page.evaluate('localToday()')
    assert page.input_value('#new-session-date') == today
    page.fill('#new-session-date', '2026-09-15')
    page.select_option('#new-cube-id', label='GAN 14 (3x3x3)')
    page.click('#add-session-form button[type=submit]')
    page.wait_for_selector('#sessions-tbody td.num')
    assert 'GAN 14 (3x3x3)' in page.text_content('#sessions-tbody tr')

    page.click('#sessions-tbody button:has-text("Edit")')
    page.fill('#edit-session-date', '2026-09-14')
    page.select_option('#edit-session-cube', label='MoYu RS3M (3x3x3)')
    page.fill('#edit-session-notes', 'Warm-up')
    page.click('#edit-session-form button[type=submit]')
    page.wait_for_function("() => document.getElementById('sessions-tbody').textContent.includes('MoYu')")
    assert query(live_app, 'SELECT date, notes FROM sessions') == [{'date': '2026-09-14', 'notes': 'Warm-up'}]
    assert page.is_hidden('#edit-session-modal')
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


def test_cube_stats(app_page, live_app):
    from helpers import seed_cube
    cube = seed_cube(live_app, '333', 'GAN', '14')
    seed_session(live_app, [12, 11, 13, 14, 12], cube_id=cube, date='2026-09-01')
    seed_session(live_app, [25] * 5, event='333oh', cube_id=seed_cube(live_app, '333', 'QiYi', 'MS'),
                 date='2026-09-02')
    page = app_page
    open_tab(page, 'cubes')
    page.wait_for_selector('#cubes-tbody td.num')
    rows = {r.split()[1]: r for r in page.locator('#cubes-tbody tr').all_inner_texts()}
    assert '12.33s' in rows['GAN'] and '11.00s' in rows['GAN']
    assert '25.00s (3x3x3 One-Handed)' in rows['QiYi']  # used for another event than its type
    page.click('#cubes-table th[data-sort="sessions"]')
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
    # Each session has its own event: session 2's comes from its scramble type in CSTimer
    menus = page.locator('.import-session-event')
    assert [menus.nth(i).input_value() for i in range(3)] == ['333', '333oh', '333']
    assert 'scramble type' in page.locator('.session-checkbox').nth(1).text_content()
    page.select_option('#import-event-select', '222')  # sets them all at once
    assert [menus.nth(i).input_value() for i in range(3)] == ['222', '222', '222']
    page.select_option('#import-event-select', '333')
    menus.nth(1).select_option('333oh')
    page.click('#session-selection .btn-primary')
    page.wait_for_selector('#import-status.success')
    assert 'Imported 10 solves into 4 sessions' in page.text_content('#import-status')
    assert len(solves_in(live_app)) == 10
    assert query(live_app, "SELECT event_id, COUNT(*) AS n FROM sessions GROUP BY event_id ORDER BY event_id") == [
        {'event_id': '333', 'n': 3}, {'event_id': '333oh', 'n': 1}]

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
        page.click('.footer-links >> text=Export backup')
    assert download.value.suggested_filename.startswith('lookahead-backup-')
    with page.expect_file_chooser() as chooser:
        page.click('.footer-links >> text=Import backup')
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


def test_the_import_tab_exports_too(app_page, live_app):
    seed_session(live_app, [12, 13], date='2026-09-01')
    page = app_page
    open_tab(page, 'import')
    with page.expect_download() as download:
        page.click('#export >> text=Export backup')
    assert download.value.suggested_filename.startswith('lookahead-backup-')
    with page.expect_download() as download:
        page.click('#export >> text=Export solves (CSV)')
    assert download.value.suggested_filename.startswith('lookahead-solves-')
    with page.expect_file_chooser() as chooser:
        page.click('#export >> text=Import backup')
    assert chooser.value is not None
    assert page.errors == []


def test_csv_downloads(app_page, live_app):
    seed_session(live_app, [12, 13], date='2026-09-01')
    page = app_page
    with page.expect_download() as download:
        page.click('.footer-links >> text=Export solves (CSV)')
    assert download.value.suggested_filename.startswith('lookahead-solves-')
    open_tab(page, 'sessions')
    page.click('#sessions-tbody button:has-text("View")')
    with page.expect_download() as download:
        page.click('#solve-details-modal >> text=Export CSV')
    assert download.value.suggested_filename.startswith('lookahead-solves-session-')
    text = open(download.value.path(), encoding='utf-8-sig').read()
    assert text.splitlines()[0].startswith('session_id,session_date,event_id') and len(text.splitlines()) == 3
    assert page.errors == []


def test_timers_for_2x2x2_and_4x4x4(app_page, live_app):
    """2x2x2 and 4x4x4 have timers with their own scrambles, and their solves go into a session
    for their own event; other events still show a notice."""
    page = app_page
    open_timer(page)
    page.select_option('#timer-event-select', '222')
    page.wait_for_function("() => /^([RUF]['2]? ?){25}$/.test(document.getElementById('scramble-text').textContent + ' ')")
    time_a_solve(page, 3.0)
    page.wait_for_selector('.solve-item')
    assert query(live_app, 'SELECT event_id, solve_count FROM sessions') == [{'event_id': '222', 'solve_count': 1}]

    page.select_option('#timer-event-select', '444')
    page.wait_for_function("() => document.getElementById('scramble-text').textContent.split(' ').length === 40")
    assert page.is_visible('#timer-display') and page.is_hidden('#timer-under-construction')
    assert page.locator('.solve-item').count() == 0  # the 2x2x2 solve isn't in 4x4x4's list

    page.select_option('#timer-event-select', '777')
    page.wait_for_function("() => document.getElementById('scramble-text').textContent.split(' ').length === 100")
    assert 'long' in page.get_attribute('#scramble-text', 'class')  # set smaller, so it fits

    page.select_option('#timer-event-select', 'clock')
    page.wait_for_selector('#timer-under-construction')
    assert ('ready for 2x2x2, 3x3x3, 4x4x4, 5x5x5, 6x6x6, 7x7x7, 3x3x3 One-Handed, 3x3x3 Blindfolded, '
            'Megaminx, 4x4x4 Blindfolded, and 5x5x5 Blindfolded' in page.inner_text('#timer-under-construction'))
    assert page.errors == []


def test_blindfolded_timers_have_no_inspection(app_page, live_app):
    """Regulation B1a: blindfolded solves have no inspection, so the first press of the space
    bar gets ready to start, and memorisation is part of the time, even with inspection on."""
    page = app_page
    open_timer(page)
    page.select_option('#timer-event-select', '444bf')
    page.wait_for_function("() => document.getElementById('scramble-text').textContent.split(' ').length >= 40")
    assert page.evaluate('TimerState.settings.inspectionEnabled') is True
    with paused_clock(page):
        page.keyboard.down('Space')
        assert page.evaluate('TimerState.inspection') is False
        page.clock.run_for(400)
        page.keyboard.up('Space')
        assert page.evaluate('TimerState.running') is True
        page.clock.run_for(95000)
        page.keyboard.down('Space')
        page.keyboard.up('Space')
    page.wait_for_selector('.solve-item')
    assert [(s['time_ms'], s['penalty']) for s in solves_in(live_app)] == [(95000, 'OK')]
    assert query(live_app, 'SELECT event_id FROM sessions') == [{'event_id': '444bf'}]
    assert page.errors == []


def test_megaminx_scrambles_show_in_lines(app_page):
    """A Megaminx scramble is seven lines of moves, set smaller like the big cubes' scrambles."""
    page = app_page
    open_timer(page)
    page.select_option('#timer-event-select', 'minx')
    page.wait_for_function("() => document.getElementById('scramble-text').textContent.includes('R++') "
                           "|| document.getElementById('scramble-text').textContent.includes('R--')")
    lines = page.inner_text('#scramble-text').split('\n')
    assert len(lines) == 7 and all(line.endswith(('U', "U'")) for line in lines)
    assert 'long' in page.get_attribute('#scramble-text', 'class')
    assert page.errors == []


def test_every_event_menu_comes_from_one_list(app_page):
    """Each menu of events lists the same events from EVENT_NAMES (every one but Multi-Blind,
    which is scored in points), with 3x3x3 chosen where a menu has a default."""
    page = app_page
    menus = ['#timer-event-select', '#new-event-id', '#new-cube-type', '#import-event-select']
    events = page.evaluate("() => MENU_EVENTS")
    assert len(events) == 15 and '444bf' in events and '333mbf' not in events
    for menu in menus:
        values = page.eval_on_selector(menu, "s => [...s.options].map(o => o.value).filter(v => v && v !== 'other')")
        assert values == events, menu
    assert [page.input_value(m) for m in menus] == ['333', '333', '', '333']
    # A form reset goes back to the default, since it's the option's own default
    page.eval_on_selector('#new-event-id', "s => { s.value = '444bf'; s.form.reset(); }")
    assert page.input_value('#new-event-id') == '333'
    open_tab(page, 'cubes')
    page.wait_for_selector('#cubes-tbody')
    assert page.errors == []


def test_the_scores_explanation_opens_offline(app_page, live_app):
    """How the scores work opens in the app, from the app's own copy of docs/SCORES.md, with
    nothing fetched from the internet."""
    page = app_page
    outside = []
    page.route(lambda url: not url.startswith(live_app.config['BASE_URL']),
               lambda route: (outside.append(route.request.url), route.abort()))
    # Enough for every chart to draw, so nothing on the tab answers "not enough data yet"
    seed_session(live_app, [12 + i / 10 for i in range(12)], date='2026-10-01')
    seed_session(live_app, [11 + i / 10 for i in range(12)], date='2026-10-02')
    page.reload()
    open_tab(page, 'analytics')
    page.click('#scores-note a:has-text("How the scores work")')
    page.wait_for_selector('#doc-modal-body table')
    assert page.text_content('#doc-modal-title').startswith('How the Analytics Scores Work')
    assert page.locator('#doc-modal-body h2').count() >= 8
    assert page.get_attribute('#doc-modal-github', 'href').endswith('/docs/SCORES.md')
    page.keyboard.press('Escape')
    assert page.is_hidden('#doc-modal')
    assert outside == [] and page.errors == []


def test_charts_without_enough_data_say_so_quietly(app_page, live_app):
    """A chart with too little data says what it needs, and the browser logs no errors (the
    routes answer normally rather than with a 400)."""
    page = app_page
    seed_session(live_app, [12, 13, 14])
    page.reload()
    open_tab(page, 'analytics')
    page.wait_for_function("() => document.getElementById('consistency-chart').textContent.includes('Need at least')")
    assert 'Need at least 5 solves' in page.text_content('#distribution-chart')
    assert 'Need at least 12 solves' in page.text_content('#breakdown-chart')
    assert page.errors == []


def test_charts_are_described_in_words(app_page, live_app):
    """Each drawn chart is one image to a screen reader, named with what it shows; a chart that
    shows a message instead is read as that message."""
    seed_session(live_app, list(range(10, 22)), date='2026-09-01')
    seed_session(live_app, list(range(9, 21)), date='2026-09-02')
    page = app_page
    open_tab(page, 'analytics')
    for chart in ('progress-chart', 'distribution-chart', 'breakdown-chart', 'consistency-chart'):
        page.wait_for_selector(f'#{chart}[role="img"]')
    label = lambda chart: page.get_attribute(f'#{chart}', 'aria-label')
    assert label('progress-chart') == ('Progress over 2 sessions, from 2026-09-01 to 2026-09-02. '
                                       'The last Ao5 went from 19.00s to 18.00s. Best single 9.00s, on 2026-09-02.')
    assert label('distribution-chart') == ('How 24 solves spread out: fastest 9.00s, median 15.00s, '
                                           'mean 15.00s, and slowest 21.00s.')
    assert label('breakdown-chart').startswith('The last 24 solves with rolling averages: Ao5 now ')
    assert 'Median times ranged from 14.50s to 15.50s. The steadiest was on 2026-09-0' in label('consistency-chart')

    # One session: the consistency chart shows a message, so it's no longer an image
    page.select_option('#analytics-session-select', index=1)
    page.wait_for_selector('#consistency-chart >> text=compares sessions')
    assert page.get_attribute('#consistency-chart', 'role') is None
    page.wait_for_function("() => (document.getElementById('progress-chart').getAttribute('aria-label') || '')"
                           ".startsWith('Solves 1 to 12 of this session')")
    assert page.errors == []


def test_a_new_scramble_after_switching_to_an_event_without_a_timer(app_page):
    """A solve asks for its next scramble a moment after it stops. If the event has been switched
    to one without a timer in the meantime, that's not an error (it used to throw, which CI
    caught when its slower machine switched events within the moment)."""
    page = app_page
    open_timer(page)
    page.select_option('#timer-event-select', 'clock')
    page.wait_for_selector('#timer-under-construction')
    page.evaluate('() => generateNewScramble()')  # as the timer does 100 ms after a solve
    assert page.errors == []
