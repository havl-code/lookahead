"""The Sessions tab's routes: listing, adding, and deleting sessions and solves."""

import pytest

from helpers import api_add_solves, query, seed_cube, seed_session


class TestSessionList:
    def test_newest_first_with_stats_in_seconds(self, app, client):
        old = seed_session(app, [10, 11, 12, 13, 14], date='2026-09-01', notes='old')
        new = seed_session(app, [20], date='2026-09-02', event='222')
        sessions = client.get('/api/sessions').get_json()
        assert [s['id'] for s in sessions] == [new, old]
        assert sessions[1] == {'id': old, 'date': '2026-09-01', 'event_id': '333', 'cube_id': None,
                               'cube': None, 'solve_count': 5, 'best_single': 10.0,
                               'session_mean': 12.0, 'ao5': 12.0, 'ao12': None, 'notes': 'old'}

    def test_each_session_comes_with_its_cube(self, app, client):
        cube = seed_cube(app, '333', 'GAN', '14 MagLev', active=False)
        seed_session(app, [10], cube_id=cube)
        assert client.get('/api/sessions').get_json()[0]['cube'] == {
            'id': cube, 'cube_type': '333', 'brand': 'GAN', 'model': '14 MagLev', 'is_active': False}

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


    def test_for_an_earlier_day(self, app, client, set_today):
        set_today('2026-10-08')
        sid = client.post('/api/sessions/add', json={'date': '2026-09-30'}).get_json()['session_id']
        assert query(app, 'SELECT date FROM sessions WHERE id = ?', (sid,)) == [{'date': '2026-09-30'}]

    @pytest.mark.parametrize('date', ['2026-10-09', '30/09/2026', '2026-02-30'])
    def test_not_for_a_later_day_or_a_bad_date(self, client, set_today, date):
        set_today('2026-10-08')
        assert client.post('/api/sessions/add', json={'date': date}).status_code == 400


class TestEditSession:
    def test_date_cube_and_notes_can_change(self, app, client, set_today):
        set_today('2026-10-08')
        sid = seed_session(app, [10, 11, 12, 13, 14], date='2026-10-08')
        cube = seed_cube(app)
        response = client.put(f'/api/sessions/{sid}', json={'date': '2026-10-01', 'cube_id': cube,
                                                            'notes': '  Morning  '})
        assert response.get_json() == {'success': True, 'message': 'Session updated'}
        assert query(app, 'SELECT date, cube_id, notes, solve_count, ao5 FROM sessions WHERE id = ?', (sid,)) == [
            {'date': '2026-10-01', 'cube_id': cube, 'notes': 'Morning', 'solve_count': 5, 'ao5': 12000}]

    def test_only_what_is_sent_changes(self, app, client):
        cube = seed_cube(app)
        sid = seed_session(app, [10], date='2026-09-01', cube_id=cube, notes='keep')
        client.put(f'/api/sessions/{sid}', json={'notes': 'changed'})
        assert query(app, 'SELECT date, cube_id, notes FROM sessions WHERE id = ?', (sid,)) == [
            {'date': '2026-09-01', 'cube_id': cube, 'notes': 'changed'}]

    def test_the_cube_can_be_cleared(self, app, client):
        sid = seed_session(app, [10], cube_id=seed_cube(app))
        client.put(f'/api/sessions/{sid}', json={'cube_id': None})
        assert query(app, 'SELECT cube_id FROM sessions') == [{'cube_id': None}]

    def test_an_inactive_cube_can_stay(self, app, client):
        cube = seed_cube(app, active=False)
        sid = seed_session(app, [10])
        assert client.put(f'/api/sessions/{sid}', json={'cube_id': cube}).status_code == 200

    @pytest.mark.parametrize('body, status', [
        ({}, 400), ({'colour': 'red'}, 400), ({'date': ''}, 400), ({'date': '2999-01-01'}, 400),
        ({'cube_id': 999}, 404), ({'notes': 'x' * 1001}, 400)])
    def test_bad_changes_are_refused(self, app, client, body, status):
        sid = seed_session(app, [10], date='2026-09-01')
        assert client.put(f'/api/sessions/{sid}', json=body).status_code == status
        assert query(app, 'SELECT date FROM sessions') == [{'date': '2026-09-01'}]

    def test_a_missing_session(self, client):
        assert client.put('/api/sessions/999', json={'notes': 'x'}).status_code == 404


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
