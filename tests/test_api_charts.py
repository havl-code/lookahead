"""The Analytics tab's chart routes, for a whole event and for one session."""

import pytest

from helpers import seed_session


def get(client, url):
    response = client.get(url)
    return response.status_code, response.get_json()


class TestProgress:
    def test_sessions_of_five_or_more_in_date_order(self, app, client):
        seed_session(app, [10, 11, 12, 13, 14], date='2026-09-02')
        seed_session(app, [20, 21, 22, 23, 24], date='2026-09-01')
        seed_session(app, [5, 5], date='2026-09-03')  # too short to plot
        status, data = get(client, '/api/charts/progress?event_id=333')
        assert status == 200
        assert data['data'] == [
            {'date': '2026-09-01', 'best': 20.0, 'mean': 22.0, 'ao5': 22.0},
            {'date': '2026-09-02', 'best': 10.0, 'mean': 12.0, 'ao5': 12.0},
        ]

    def test_needs_a_session(self, client):
        assert get(client, '/api/charts/progress?event_id=333') == (
            200, {'message': 'Need at least 1 session for this event'})


class TestSessionProgress:
    def test_times_running_mean_and_ao5(self, app, client):
        sid = seed_session(app, [10, 11, 12, 13, 14, 15])
        status, data = get(client, f'/api/charts/session-progress?session_id={sid}')
        assert status == 200
        points = data['data']
        assert [p['solve_number'] for p in points] == [1, 2, 3, 4, 5, 6]
        assert [p['ao5'] for p in points] == [None, None, None, None, 12.0, 13.0]
        assert points[-1]['mean'] == 12.5

    def test_needs_a_session_id(self, client):
        assert get(client, '/api/charts/session-progress') == (400, {'error': 'Missing session_id parameter'})

    def test_needs_a_solve(self, app, client):
        sid = seed_session(app, [])
        assert get(client, f'/api/charts/session-progress?session_id={sid}') == (
            200, {'message': 'No solves in this session'})


class TestDistribution:
    def test_event_times_sorted(self, app, client):
        seed_session(app, [14, 10, 12, 11, 13, 'DNF'])
        status, data = get(client, '/api/charts/distribution?event_id=333')
        assert status == 200 and data['times'] == [10.0, 11.0, 12.0, 13.0, 14.0]

    def test_session_times_sorted(self, app, client):
        sid = seed_session(app, [14, 10, 12, 11, 13])
        assert get(client, f'/api/charts/session-distribution?session_id={sid}')[1]['times'] == [
            10.0, 11.0, 12.0, 13.0, 14.0]

    @pytest.mark.parametrize('url', ['/api/charts/distribution?event_id=333',
                                     '/api/charts/session-distribution?session_id={sid}'])
    def test_needs_five_solves(self, app, client, url):
        sid = seed_session(app, [10, 11, 12, 13])
        assert get(client, url.format(sid=sid)) == (200, {'message': 'Need at least 5 solves'})


class TestRolling:
    @pytest.mark.parametrize('url', ['/api/charts/rolling-average?event_id=333',
                                     '/api/charts/session-rolling?session_id={sid}'])
    def test_rolling_lines_oldest_first(self, app, client, url):
        sid = seed_session(app, list(range(1, 13)))
        status, data = get(client, url.format(sid=sid))
        assert status == 200
        assert data['times'] == [float(t) for t in range(1, 13)]
        assert data['rolling5'][4] == 3 and data['rolling12'][-1] == 6.5

    @pytest.mark.parametrize('url', ['/api/charts/rolling-average?event_id=333',
                                     '/api/charts/session-rolling?session_id={sid}'])
    def test_needs_twelve_solves(self, app, client, url):
        sid = seed_session(app, list(range(1, 12)))
        assert get(client, url.format(sid=sid)) == (200, {'message': 'Need at least 12 solves'})


class TestConsistency:
    def test_box_plots_for_recent_sessions(self, app, client):
        ids = [seed_session(app, [10 + i, 11 + i, 12 + i, 13 + i, 14 + i], date=f'2026-09-{i + 1:02d}')
               for i in range(12)]
        status, data = get(client, '/api/charts/consistency?event_id=333')
        assert status == 200
        assert [s['session_id'] for s in data['sessions']] == ids[-10:]  # the latest 10, in date order
        assert data['sessions'][0]['median'] == 14.0
        assert set(data['sessions'][0]) >= {'q1', 'median', 'q3', 'lowerfence', 'upperfence', 'mean', 'sd', 'date'}

    def test_sessions_need_five_completed_solves(self, app, client):
        seed_session(app, [10, 11, 12, 13, 14], date='2026-09-01')
        seed_session(app, [10, 11, 'DNF', 'DNF', 12], date='2026-09-02')
        assert get(client, '/api/charts/consistency?event_id=333') == (200, {'message': 'Need at least 2 sessions'})
