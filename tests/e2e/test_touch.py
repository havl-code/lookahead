"""The timer on a touchscreen: touch the time to start inspection, hold it until it turns green,
let go to start, and tap it to stop, the same as the space bar."""

import pytest

from e2e_helpers import open_timer, paused_clock, solves_in

pytestmark = pytest.mark.e2e


def touch(page, kind, pointer='touch'):
    page.dispatch_event('#timer-display', f'pointer{kind}', {'pointerType': pointer, 'pointerId': 7, 'isPrimary': True})


def test_a_solve_timed_by_touch(app_page, live_app):
    page = app_page
    open_timer(page)
    with paused_clock(page):
        touch(page, 'down')
        touch(page, 'up')
        assert page.evaluate('TimerState.inspection') is True
        page.clock.run_for(2000)
        touch(page, 'down')
        page.clock.run_for(400)
        assert 'ready' in page.get_attribute('#timer-display', 'class')
        touch(page, 'up')
        assert page.evaluate('TimerState.running') is True
        page.clock.run_for(8000)
        touch(page, 'down')
        touch(page, 'up')
    page.wait_for_selector('.solve-item')
    assert [(s['time_ms'], s['penalty']) for s in solves_in(live_app)] == [(8000, 'OK')]
    assert page.errors == []


def test_letting_go_too_soon_doesnt_start(app_page):
    page = app_page
    open_timer(page)
    with paused_clock(page):
        touch(page, 'down')
        touch(page, 'up')  # inspection
        touch(page, 'down')
        page.clock.run_for(100)  # not long enough to turn green
        touch(page, 'up')
        assert page.evaluate('TimerState.running') is False
        touch(page, 'down')
        page.clock.run_for(400)
        touch(page, 'cancel')  # the browser took the touch back
        assert page.evaluate('TimerState.running') is False
        assert 'ready' not in page.get_attribute('#timer-display', 'class')
    page.keyboard.press('Escape')


def test_a_mouse_click_on_the_time_does_nothing(app_page):
    page = app_page
    open_timer(page)
    touch(page, 'down', pointer='mouse')
    touch(page, 'up', pointer='mouse')
    assert page.evaluate('TimerState.inspection || TimerState.running') is False
