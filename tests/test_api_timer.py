"""The Timer tab's routes, including "a session a day"."""

from helpers import query, seed_cube, seed_session


def save(client, **body):
    return client.post('/api/timer/solve', json={'follow_today': True, 'event_id': '333',
                                                 'scramble': 'R U', 'penalty': 'OK', **body})


class TestNewSession:
    def test_create_keeps_the_last_cube(self, app, client, set_today):
        set_today('2026-10-08')
        cube = seed_cube(app)
        seed_session(app, [10], date='2026-10-01', cube_id=cube)
        sid = client.post('/api/timer/session', json={'event_id': '333'}).get_json()['session_id']
        assert query(app, 'SELECT date, cube_id, notes FROM sessions WHERE id = ?', (sid,)) == [
            {'date': '2026-10-08', 'cube_id': cube, 'notes': 'Live timer session'}]

    def test_defaults_to_3x3x3(self, app, client):
        sid = client.post('/api/timer/session').get_json()['session_id']
        assert query(app, 'SELECT event_id FROM sessions WHERE id = ?', (sid,)) == [{'event_id': '333'}]


class TestSaveSolve:
    def test_first_solve_of_the_day_starts_a_session(self, app, client, set_today):
        set_today('2026-10-08')
        result = save(client, session_id=None, time=12.34).get_json()
        assert result['success'] is True
        assert query(app, 'SELECT date FROM sessions WHERE id = ?', (result['session_id'],)) == [
            {'date': '2026-10-08'}]

    def test_later_solves_join_todays_session(self, client, set_today):
        set_today('2026-10-08')
        first = save(client, session_id=None, time=12).get_json()['session_id']
        assert save(client, session_id=first, time=13).get_json()['session_id'] == first

    def test_a_new_day_starts_a_new_session(self, client, set_today):
        set_today('2026-10-07')
        yesterday = save(client, session_id=None, time=12).get_json()['session_id']
        set_today('2026-10-08')
        assert save(client, session_id=yesterday, time=13).get_json()['session_id'] != yesterday

    def test_a_picked_session_stays_picked(self, app, client, set_today):
        set_today('2026-10-08')
        old = seed_session(app, [10], date='2026-09-01')
        result = save(client, session_id=old, follow_today=False, time=13).get_json()
        assert result['session_id'] == old
        assert query(app, 'SELECT solve_count FROM sessions WHERE id = ?', (old,)) == [{'solve_count': 2}]

    def test_a_picked_session_must_exist(self, client):
        response = save(client, session_id=999, follow_today=False, time=13)
        assert response.status_code == 404

    def test_a_time_is_required(self, client):
        response = save(client, session_id=None)
        assert response.status_code == 400 and response.get_json() == {'error': 'Missing required fields'}

    def test_plus_two_is_stored_once(self, app, client):
        # The page sends the time with the 2 seconds already added; the raw time is stored
        result = save(client, session_id=None, time=12.5, penalty='+2').get_json()
        assert query(app, 'SELECT time_ms, penalty, dnf FROM solves WHERE id = ?', (result['solve_id'],)) == [
            {'time_ms': 10500, 'penalty': '+2', 'dnf': 0}]
        sessions = client.get('/api/sessions').get_json()
        assert sessions[0]['best_single'] == 12.5

    def test_dnf(self, app, client):
        result = save(client, session_id=None, time=0, penalty='DNF', dnf=True).get_json()
        assert query(app, 'SELECT dnf, penalty FROM solves WHERE id = ?', (result['solve_id'],)) == [
            {'dnf': 1, 'penalty': 'DNF'}]

    def test_follows_the_session_event_into_a_new_day(self, app, client, set_today):
        set_today('2026-10-07')
        old = save(client, session_id=None, event_id='222', time=3).get_json()['session_id']
        set_today('2026-10-08')
        new = save(client, session_id=old, event_id='222', time=3).get_json()['session_id']
        assert query(app, 'SELECT event_id FROM sessions WHERE id = ?', (new,)) == [{'event_id': '222'}]


class TestEditSolves:
    def test_change_a_penalty(self, app, client):
        result = save(client, session_id=None, time=12).get_json()
        assert client.put(f'/api/timer/solve/{result["solve_id"]}/penalty',
                          json={'penalty': 'DNF'}).get_json() == {'success': True}
        assert query(app, 'SELECT dnf FROM solves') == [{'dnf': 1}]

    def test_a_missing_penalty_means_ok(self, app, client):
        result = save(client, session_id=None, time=12, penalty='+2').get_json()
        client.put(f'/api/timer/solve/{result["solve_id"]}/penalty', json={})
        assert query(app, 'SELECT penalty FROM solves') == [{'penalty': 'OK'}]

    def test_penalty_on_a_missing_solve(self, client):
        assert client.put('/api/timer/solve/999/penalty', json={'penalty': 'OK'}).status_code == 404

    def test_delete(self, app, client):
        result = save(client, session_id=None, time=12).get_json()
        reply = client.delete(f'/api/timer/solve/{result["solve_id"]}').get_json()
        assert reply['success'] is True and reply['deleted']['time_ms'] == 12000
        assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 0}]

    def test_an_inspection_dnf_stays_a_dnf(self, client):
        result = save(client, session_id=None, time=0, penalty='DNF', dnf=True).get_json()
        response = client.put(f'/api/timer/solve/{result["solve_id"]}/penalty', json={'penalty': 'OK'})
        assert response.status_code == 400 and 'only be a DNF' in response.get_json()['error']

    def test_delete_a_missing_solve(self, client):
        assert client.delete('/api/timer/solve/999').status_code == 404


class TestRecentSolves:
    def test_newest_first_with_stats(self, app, client):
        sid = seed_session(app, [10, (11, '+2'), 'DNF', 12, 14])
        data = client.get(f'/api/timer/session/{sid}/solves').get_json()
        assert [s['solve_number'] for s in data['solves']] == [5, 4, 3, 2, 1]
        plus_two = data['solves'][3]
        assert (plus_two['time'], plus_two['penalty'], plus_two['dnf']) == (13.0, '+2', False)
        assert all(s['notes'] == '' for s in data['solves'])
        assert data['solves'][2]['dnf'] is True
        assert data['stats'] == {'solve_count': 5, 'best': 10.0, 'worst': 14.0,
                                 'mean': 12.25, 'ao5': 13.0}

    def test_only_the_latest_ones(self, app, client):
        sid = seed_session(app, list(range(1, 61)))
        data = client.get(f'/api/timer/session/{sid}/solves').get_json()
        assert len(data['solves']) == 50 and data['solves'][0]['solve_number'] == 60
        assert len(client.get(f'/api/timer/session/{sid}/solves?limit=5').get_json()['solves']) == 5
