"""The Dashboard's routes (/api/events, /api/stats, /api/pb-details) and serving the page."""

from helpers import seed_cube, seed_session


def content_type(client, path):
    with client.get(path) as response:  # files are streamed, so close the response
        assert response.status_code == 200
        return response.content_type


def test_the_page_and_its_files_are_served(client):
    with client.get('/') as page:
        assert page.status_code == 200 and b'Speedcube Training Explorer' in page.data
    assert content_type(client, '/js/config.js').startswith('text/javascript')
    assert content_type(client, '/css/style.css').startswith('text/css')
    assert content_type(client, '/vendor/fonts/space-grotesk-latin-wght-normal.woff2') == 'font/woff2'


def test_unknown_api_routes_get_json(client):
    response = client.get('/api/nope')
    assert response.status_code == 404 and response.get_json() == {'error': 'Not Found'}


def test_unknown_pages_get_the_usual_404(client):
    response = client.get('/nope')
    assert response.status_code == 404 and response.content_type.startswith('text/html')


def test_events_lists_logged_events_once(app, client):
    seed_session(app, [10], event='333')
    seed_session(app, [3], event='222')
    seed_session(app, [11], event='333')
    assert client.get('/api/events').get_json() == ['222', '333']


class TestStats:
    def test_an_empty_app(self, client):
        data = client.get('/api/stats').get_json()
        assert data == {'pb': None, 'average': None, 'total_solves': 0, 'total_sessions': 0,
                        'total_cubes': 0, 'active_cubes': 0, 'wca_rank': None,
                        'wca_percentile': None, 'wca_outside_top': None, 'event_id': '333',
                        'best_averages': {'ao5': None, 'ao12': None, 'ao50': None, 'ao100': None}}

    def test_totals_for_one_event(self, app, client, fake_wca):
        fake_wca.replies['rank/world/single/333.json'] = OSError('offline')
        seed_cube(app)
        seed_cube(app, active=False)
        seed_session(app, [10, (11, '+2'), 'DNF'])
        seed_session(app, [3], event='222')
        data = client.get('/api/stats?event_id=333').get_json()
        assert (data['pb'], data['average'], data['total_solves'], data['total_sessions']) == (10.0, 11.5, 3, 1)
        assert (data['total_cubes'], data['active_cubes']) == (2, 1)

    def test_all_events(self, app, client):
        seed_session(app, [10], event='333')
        seed_session(app, [3], event='222')
        data = client.get('/api/stats?event_id=all').get_json()
        assert (data['pb'], data['total_solves'], data['total_sessions']) == (3.0, 2, 2)
        assert data['average'] is None  # a 3x3x3 and a 2x2x2 time don't average into anything
        assert data['wca_rank'] is None  # no rank across events

    def test_world_rank_within_the_top_1000(self, app, client, fake_wca):
        fake_wca.replies['rank/world/single/333.json'] = {
            'items': [{'best': t} for t in (400, 500, 900, 1100)], 'total': 200000}
        seed_session(app, [10])
        data = client.get('/api/stats?event_id=333').get_json()
        assert data['wca_rank'] == 4  # 4, 5, and 9 s are faster than the 10 s PB

    def test_events_without_rankings_have_no_rank(self, app, client, fake_wca):
        seed_session(app, [600], event='333mbf')
        data = client.get('/api/stats?event_id=333mbf').get_json()
        assert data['wca_rank'] is None and fake_wca.calls == []

    def test_a_failing_rank_never_breaks_the_dashboard(self, app, client, monkeypatch):
        from speedcube import wca

        def broken(*args, **kwargs):
            raise RuntimeError('unexpected')
        monkeypatch.setattr(wca, 'estimate_rank', broken)
        seed_session(app, [10])
        response = client.get('/api/stats?event_id=333')
        assert response.status_code == 200 and response.get_json()['wca_rank'] is None


class TestPbDetails:
    def test_the_fastest_solve_with_its_scramble(self, app, client):
        from contextlib import closing

        from speedcube import db
        seed_session(app, [12, 11], date='2026-09-01')
        sid = seed_session(app, [(9.5, '+2'), 10.5], date='2026-09-02')  # 9.5 + 2 = 11.5
        with closing(db.connect(app.config['DATABASE'])) as conn, conn:
            conn.execute("UPDATE solves SET scramble = 'R U F' WHERE session_id = ? AND solve_number = 2", (sid,))
        assert client.get('/api/pb-details?event_id=333').get_json() == {
            'session_id': sid, 'date': '2026-09-02', 'scramble': 'R U F', 'event_id': '333'}

    def test_dnfs_are_never_a_pb(self, app, client):
        seed_session(app, ['DNF', 12])
        assert client.get('/api/pb-details?event_id=333').get_json()['scramble'] is None

    def test_no_solves(self, client):
        response = client.get('/api/pb-details?event_id=333')
        assert response.status_code == 404 and 'error' in response.get_json()
