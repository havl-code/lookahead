"""The Sessions tab's routes: listing, adding, and deleting sessions and solves."""

import pytest

from helpers import api_add_solves, query, seed_cube, seed_session


class TestSessionList:
    def test_newest_first_with_stats_in_seconds(self, app, client):
        old = seed_session(app, [10, 11, 12, 13, 14], date='2026-09-01', notes='old')
        new = seed_session(app, [20], date='2026-09-02', event='222')
        sessions = client.get('/api/sessions').get_json()
        assert [s['id'] for s in sessions] == [new, old]
        assert sessions[1] == {'id': old, 'date': '2026-09-01', 'event_id': '333', 'solve_count': 5,
                               'best_single': 10.0, 'session_mean': 12.0, 'ao5': 12.0,
                               'ao12': None, 'notes': 'old'}

    def test_same_day_newest_first(self, app, client):
        first = seed_session(app, [10], date='2026-09-01')
        second = seed_session(app, [10], date='2026-09-01')
        assert [s['id'] for s in client.get('/api/sessions').get_json()] == [second, first]


class TestAddSession:
    def test_defaults(self, client, set_today):
        set_today('2026-10-08')
        response = client.post('/api/sessions/add', json={})
        assert response.get_json()['success'] is True
        session = client.get('/api/sessions').get_json()[0]
        assert (session['date'], session['event_id'], session['notes']) == ('2026-10-08', '333', '')

    def test_with_event_cube_and_notes(self, app, client):
        cube = seed_cube(app)
        sid = client.post('/api/sessions/add', json={'event_id': '444', 'cube_id': cube,
                                                     'notes': 'Big cube day'}).get_json()['session_id']
        assert query(app, 'SELECT event_id, cube_id, notes FROM sessions WHERE id = ?', (sid,)) == [
            {'event_id': '444', 'cube_id': cube, 'notes': 'Big cube day'}]


def test_delete_session_takes_its_solves(app, client):
    sid = seed_session(app, [10, 11])
    response = client.delete(f'/api/sessions/{sid}')
    assert response.get_json() == {'success': True, 'message': 'Session deleted'}
    assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 0}]


class TestSolvePages:
    @pytest.fixture
    def session(self, app):
        # Solves 1 to 5: 12, 10 (8 + 2), DNF, 9, and 11
        return seed_session(app, [12, (8, '+2'), 'DNF', 9, 11])

    def solves(self, client, session, **params):
        query_string = '&'.join(f'{k}={v}' for k, v in params.items())
        return client.get(f'/api/sessions/{session}/solves?{query_string}').get_json()

    def test_in_solve_order_with_results_in_seconds(self, client, session):
        data = self.solves(client, session)
        assert data['total'] == 5
        assert [s['result_seconds'] for s in data['solves']] == [12.0, 10.0, None, 9.0, 11.0]
        assert data['solves'][1]['penalty'] == '+2'

    def test_fastest_first_puts_dnfs_last(self, client, session):
        data = self.solves(client, session, sort='time', dir='asc')
        assert [s['solve_number'] for s in data['solves']] == [4, 2, 5, 1, 3]

    def test_slowest_first_puts_dnfs_first(self, client, session):
        data = self.solves(client, session, sort='time', dir='desc')
        assert [s['solve_number'] for s in data['solves']] == [3, 1, 5, 2, 4]

    def test_sort_by_penalty(self, client, session):
        data = self.solves(client, session, sort='penalty', dir='desc')
        assert [s['solve_number'] for s in data['solves']][:2] == [3, 2]

    def test_paging(self, client, session):
        data = self.solves(client, session, offset=1, limit=2)
        assert data['total'] == 5 and [s['solve_number'] for s in data['solves']] == [2, 3]

    @pytest.mark.parametrize('params, expected', [
        ({'limit': 0}, 1), ({'limit': 100000}, 5), ({'offset': -3}, 5), ({'limit': 'abc'}, 5),
        ({'sort': 'evil', 'dir': 'sideways'}, 5),
    ])
    def test_odd_parameters_are_tamed(self, client, session, params, expected):
        assert len(self.solves(client, session, **params)['solves']) == expected


class TestAddAndDeleteSolves:
    def test_adding_updates_the_stats(self, app, client):
        sid = seed_session(app, [])
        api_add_solves(client, sid, [10, 11, (10, '+2'), 'DNF', 13])
        session = client.get('/api/sessions').get_json()[0]
        # 10, 11, 12, DNF, 13: drop the 10 and the DNF
        assert (session['solve_count'], session['best_single'], session['ao5']) == (5, 10.0, 12.0)

    def test_add_with_scramble_and_notes(self, app, client):
        sid = seed_session(app, [])
        client.post(f'/api/sessions/{sid}/solves/add',
                    json={'time_seconds': 9.87, 'scramble': 'R U', 'notes': 'PB!'})
        assert query(app, 'SELECT time_ms, scramble, notes FROM solves') == [
            {'time_ms': 9870, 'scramble': 'R U', 'notes': 'PB!'}]

    def test_delete_renumbers(self, app, client):
        sid = seed_session(app, [10, 11, 12])
        middle = query(app, 'SELECT id FROM solves WHERE solve_number = 2')[0]['id']
        assert client.delete(f'/api/solves/{middle}').get_json()['success'] is True
        assert [s['solve_number'] for s in client.get(f'/api/sessions/{sid}/solves').get_json()['solves']] == [1, 2]
