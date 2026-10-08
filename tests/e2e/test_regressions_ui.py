"""The page-side findings from the Phase 1 audit, tested in a real browser. Like
tests/test_regressions.py, each starts as a strict expected failure, and the fix removes it."""

import pytest

from e2e_helpers import open_tab, solves_in, time_a_solve
from helpers import seed_session

pytestmark = pytest.mark.e2e


def finding(number, reason):
    return pytest.mark.xfail(strict=True, reason=f'finding {number}: {reason}')


@finding('5', 'running out of inspection is an instant DNF, with no +2 window (A4d1)')
def test_starting_between_15_and_17_seconds_is_a_plus_two(app_page, live_app):
    open_tab(app_page, 'timer')
    app_page.wait_for_selector('.solves-list-container .empty-note')
    time_a_solve(app_page, 10.0, inspection_seconds=16)
    app_page.wait_for_selector('.solve-item')
    solve = solves_in(live_app)[-1]
    assert (solve['penalty'], solve['dnf'], solve['time_ms']) == ('+2', 0, 10000)


@finding('6', 'timer settings are lost on reload')
def test_timer_settings_survive_a_reload(app_page):
    open_tab(app_page, 'timer')
    app_page.click('#timer-settings-btn')
    app_page.click('#timer-settings-modal .setting-item:has-text("Hide Stats") .setting-toggle')
    app_page.keyboard.press('Escape')
    app_page.reload()
    open_tab(app_page, 'timer')
    app_page.wait_for_timeout(300)
    assert app_page.evaluate('TimerState.settings.hideStats') is True


@finding('8', 'scrambles never have two moves on the same axis in a row, such as R L')
def test_scrambles_allow_opposite_faces_but_never_cancel(app_page):
    counts = app_page.evaluate("""() => {
        const make = typeof generateScramble === 'function'
            ? () => generateScramble('333') : generate333Scramble;
        const axis = face => ({R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z'})[face];
        let pairs = 0, sameAxis = 0, sameFace = 0, aba = 0;
        for (let k = 0; k < 2000; k++) {
            const faces = make().split(' ').map(move => move[0]);
            for (let i = 1; i < faces.length; i++) {
                pairs++;
                if (axis(faces[i]) === axis(faces[i - 1])) sameAxis++;
                if (faces[i] === faces[i - 1]) sameFace++;
                if (i > 1 && faces[i] === faces[i - 2] && axis(faces[i]) === axis(faces[i - 1])) aba++;
            }
        }
        return {share: sameAxis / pairs, sameFace, aba};
    }""")
    assert counts['sameFace'] == 0 and counts['aba'] == 0
    assert 0.1 < counts['share'] < 0.3  # about 1 pair in 5 shares an axis in a fair scramble


@finding('10', 'adding a cube pops up an alert')
def test_no_blocking_dialogs_when_adding_a_cube(app_page):
    open_tab(app_page, 'cubes')
    app_page.click('#tab-cubes .section-header .btn-primary')
    app_page.select_option('#new-cube-type', '333')
    app_page.click('#add-cube-form button[type=submit]')
    app_page.wait_for_selector('#cubes-tbody td strong')
    app_page.wait_for_timeout(300)
    assert app_page.dialogs == []


@finding('10', 'a save the server rejects is silently lost')
def test_a_rejected_save_is_reported(app_page):
    app_page.route('**/api/timer/solve', lambda route: route.fulfill(
        status=500, content_type='application/json', body='{"error": "An unexpected error occurred"}'))
    open_tab(app_page, 'timer')
    app_page.wait_for_selector('.solves-list-container .empty-note')
    time_a_solve(app_page, 8.0)
    app_page.wait_for_selector('[role="alert"]', timeout=3000)
    assert app_page.dialogs == []


@finding('11', 'the PB window names the event "all"')
def test_pb_details_name_the_real_event(app_page, live_app):
    seed_session(live_app, [12, 13])
    seed_session(live_app, [3], event='222')
    app_page.reload()
    app_page.wait_for_function("() => document.getElementById('stat-solves').textContent === '3'")
    app_page.select_option('#event-select', 'all')
    app_page.wait_for_function("() => document.getElementById('stat-pb').textContent === '3.00s'")
    app_page.click('#stat-pb')
    app_page.wait_for_selector('#pb-modal')
    assert app_page.text_content('.pb-event') == '2x2x2'


@finding('12', 'penalties can only be changed from the timer')
def test_penalties_can_be_changed_from_the_sessions_tab(app_page, live_app):
    seed_session(live_app, [12, 13])
    open_tab(app_page, 'sessions')
    app_page.click('#sessions-tbody button:has-text("View")')
    app_page.wait_for_selector('#solves-tbody tr td.num')
    assert app_page.locator('#solves-tbody select').count() == 2


@finding('13', 'the timer rounds 12.345 s up to 12.35 (Regulation 9f1 truncates to 12.34)')
def test_the_timer_list_truncates_singles(app_page, live_app):
    seed_session(live_app, [12.345], date=app_page.evaluate('localToday()'))
    open_tab(app_page, 'timer')
    app_page.wait_for_selector('.solve-item')
    assert app_page.text_content('.solve-item .solve-time').strip() == '12.34'
