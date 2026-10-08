"""Changing one solve's penalty and notes, deleting it, and putting it back (Undo). The timer
and the Sessions tab share these routes."""

import pytest

from helpers import query, seed_session


def solve_ids(app):
    return [row['id'] for row in query(app, 'SELECT id FROM solves ORDER BY solve_number')]


def change(client, solve_id, **body):
    return client.put(f'/api/solves/{solve_id}', json=body)


class TestChange:
    def test_a_penalty_changes_the_result_and_stats(self, app, client):
        seed_session(app, [10, 11])
        first = solve_ids(app)[0]
        reply = change(client, first, penalty='+2').get_json()
        assert reply['success'] is True
        assert (reply['solve']['penalty'], reply['solve']['result_seconds']) == ('+2', 12.0)
        assert client.get('/api/sessions').get_json()[0]['best_single'] == 11.0

    def test_a_dnf(self, app, client):
        seed_session(app, [10])
        reply = change(client, solve_ids(app)[0], penalty='DNF').get_json()
        assert reply['solve']['result_seconds'] is None
        assert query(app, 'SELECT penalty, dnf FROM solves') == [{'penalty': 'DNF', 'dnf': 1}]

    def test_notes_are_trimmed_and_can_be_cleared(self, app, client):
        seed_session(app, [(10, '+2')])
        solve = solve_ids(app)[0]
        assert change(client, solve, notes='  bad cross  ').get_json()['solve']['notes'] == 'bad cross'
        assert query(app, 'SELECT penalty, notes FROM solves') == [{'penalty': '+2', 'notes': 'bad cross'}]
        change(client, solve, notes='')
        assert query(app, 'SELECT notes FROM solves') == [{'notes': ''}]

    def test_both_at_once(self, app, client):
        seed_session(app, [10])
        change(client, solve_ids(app)[0], penalty='+2', notes='slow start')
        assert query(app, 'SELECT penalty, notes FROM solves') == [{'penalty': '+2', 'notes': 'slow start'}]

    def test_a_note_doesnt_touch_the_stats(self, app, client, monkeypatch):
        from speedcube import db
        seed_session(app, [10])
        calls = []
        monkeypatch.setattr(db, 'recompute_session_stats', lambda *args, **kwargs: calls.append(args))
        change(client, solve_ids(app)[0], notes='fine')
        assert calls == []

    @pytest.mark.parametrize('body, status, message', [
        ({}, 400, 'Send a penalty, notes, or both.'),
        ({'penalty': 'oops'}, 400, 'A penalty must be OK, +2, or DNF.'),
        ({'notes': 12}, 400, 'Notes must be text.'),
        ({'notes': 'x' * 1001}, 400, 'Notes can be at most 1000 characters.'),
    ])
    def test_bad_changes_are_refused(self, app, client, body, status, message):
        seed_session(app, [10])
        response = change(client, solve_ids(app)[0], **body)
        assert (response.status_code, response.get_json()['error']) == (status, message)
        assert query(app, 'SELECT penalty, notes FROM solves') == [{'penalty': None, 'notes': ''}]

    def test_a_missing_solve(self, client):
        assert change(client, 999, penalty='OK').status_code == 404

    @pytest.mark.parametrize('penalty', ['OK', '+2'])
    def test_a_solve_with_no_time_stays_a_dnf(self, app, client, penalty):
        sid = seed_session(app, [])
        client.post(f'/api/sessions/{sid}/solves/add', json={'time_seconds': 0, 'penalty': 'DNF'})
        response = change(client, solve_ids(app)[0], penalty=penalty)
        assert response.status_code == 400
        assert query(app, 'SELECT dnf FROM solves') == [{'dnf': 1}]
        # Its note can still change
        assert change(client, solve_ids(app)[0], notes='too slow').status_code == 200


class TestUndoDelete:
    def test_delete_hands_back_the_solve(self, app, client):
        sid = seed_session(app, [10, 11])
        client.put(f'/api/solves/{solve_ids(app)[1]}', json={'notes': 'nice'})
        (stored,) = query(app, 'SELECT * FROM solves WHERE solve_number = 2')
        reply = client.delete(f'/api/solves/{stored["id"]}').get_json()
        assert reply == {'success': True, 'message': 'Solve deleted', 'deleted': {
            'session_id': sid, 'solve_number': 2, 'time_ms': 11000, 'scramble': stored['scramble'],
            'penalty': None, 'dnf': False, 'notes': 'nice', 'timestamp': stored['timestamp']}}

    @pytest.mark.parametrize('number', [1, 2, 3])
    def test_undo_puts_it_back_exactly(self, app, client, number):
        sid = seed_session(app, [10, (11, '+2'), 'DNF'])
        client.put(f'/api/solves/{solve_ids(app)[number - 1]}', json={'notes': 'keep me'})
        columns = 'solve_number, time_ms, scramble, penalty, dnf, notes, timestamp'
        before = query(app, f'SELECT {columns} FROM solves ORDER BY solve_number')
        session_before = client.get('/api/sessions').get_json()
        deleted = client.delete(f'/api/solves/{solve_ids(app)[number - 1]}').get_json()['deleted']
        reply = client.post('/api/solves/restore', json=deleted).get_json()
        assert reply['success'] is True and reply['solve_id'] in solve_ids(app)
        assert query(app, f'SELECT {columns} FROM solves ORDER BY solve_number') == before
        assert client.get('/api/sessions').get_json() == session_before
        assert query(app, 'SELECT DISTINCT session_id FROM solves') == [{'session_id': sid}]

    def test_two_deletes_undone_in_either_order(self, app, client):
        seed_session(app, [10, 11, 12, 13])
        before = query(app, 'SELECT solve_number, time_ms FROM solves ORDER BY solve_number')
        # The latest solve twice over, as Ctrl+Z twice does, then Undo on the first toast first
        first = client.delete(f'/api/solves/{solve_ids(app)[-1]}').get_json()['deleted']
        second = client.delete(f'/api/solves/{solve_ids(app)[-1]}').get_json()['deleted']
        client.post('/api/solves/restore', json=first)
        client.post('/api/solves/restore', json=second)
        assert query(app, 'SELECT solve_number, time_ms FROM solves ORDER BY solve_number') == before

    def test_solves_done_since_move_along(self, app, client):
        sid = seed_session(app, [10, 11])
        deleted = client.delete(f'/api/solves/{solve_ids(app)[-1]}').get_json()['deleted']
        client.post(f'/api/sessions/{sid}/solves/add', json={'time_seconds': 12})
        client.post('/api/solves/restore', json=deleted)
        assert query(app, 'SELECT solve_number, time_ms FROM solves ORDER BY solve_number') == [
            {'solve_number': 1, 'time_ms': 10000}, {'solve_number': 2, 'time_ms': 11000},
            {'solve_number': 3, 'time_ms': 12000}]

    def test_undo_after_the_end_matches_a_full_recalculation(self, app, client):
        """Putting the latest solve back uses the quick way of updating the best averages, so
        check it agrees with working them out again from scratch."""
        from contextlib import closing
        from speedcube import db
        times = [10 + (i * 7 % 13) / 4 for i in range(120)]
        sid = seed_session(app, times[:-1] + ['DNF'])
        deleted = client.delete(f'/api/solves/{solve_ids(app)[-1]}').get_json()['deleted']
        client.post('/api/solves/restore', json=deleted)
        quick = query(app, 'SELECT * FROM sessions WHERE id = ?', (sid,))
        with closing(db.connect(app.config['DATABASE'])) as conn, conn:
            db.recompute_session_stats(conn, sid)
        assert query(app, 'SELECT * FROM sessions WHERE id = ?', (sid,)) == quick

    def test_not_if_the_session_has_gone(self, app, client):
        sid = seed_session(app, [10])
        deleted = client.delete(f'/api/solves/{solve_ids(app)[0]}').get_json()['deleted']
        client.delete(f'/api/sessions/{sid}')
        response = client.post('/api/solves/restore', json=deleted)
        assert response.status_code == 404 and 'session has been deleted' in response.get_json()['error']
        assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 0}]

    @pytest.mark.parametrize('change, message', [
        ({'solve_number': 0}, 'Solve number must be a number.'),
        ({'solve_number': None}, 'Solve number is required.'),
        ({'dnf': 'no'}, 'dnf must be true or false.'),
        ({'time_ms': 1.5}, 'time_ms must be a whole number of milliseconds.'),
        ({'time_ms': 0}, 'A time must be more than 0 seconds.'),
        ({'time_ms': 7_200_001}, 'A solve can be at most 2 hours long.'),
        ({'penalty': 'oops'}, 'A penalty must be OK, +2, or DNF.'),
        ({'notes': 'x' * 1001}, 'Notes can be at most 1000 characters.'),
        ({'timestamp': 'x' * 41}, 'Timestamp can be at most 40 characters.'),
    ])
    def test_a_bad_solve_is_refused(self, app, client, change, message):
        seed_session(app, [10])
        deleted = client.delete(f'/api/solves/{solve_ids(app)[0]}').get_json()['deleted']
        response = client.post('/api/solves/restore', json={**deleted, **change})
        assert (response.status_code, response.get_json()['error']) == (400, message)
        assert solve_ids(app) == []

    def test_a_dnf_with_no_time_can_come_back(self, app, client):
        sid = seed_session(app, [])
        client.post(f'/api/sessions/{sid}/solves/add', json={'time_seconds': 0, 'penalty': 'DNF'})
        deleted = client.delete(f'/api/solves/{solve_ids(app)[0]}').get_json()['deleted']
        assert client.post('/api/solves/restore', json=deleted).status_code == 200
        assert query(app, 'SELECT time_ms, dnf FROM solves') == [{'time_ms': 0, 'dnf': 1}]

    def test_a_solve_without_a_timestamp_gets_one(self, app, client):
        seed_session(app, [10])
        deleted = client.delete(f'/api/solves/{solve_ids(app)[0]}').get_json()['deleted']
        client.post('/api/solves/restore', json={**deleted, 'timestamp': None})
        assert query(app, 'SELECT timestamp FROM solves')[0]['timestamp']

    def test_another_site_cant_put_one_in(self, app, raw_client):
        sid = seed_session(app, [])
        response = raw_client.post('/api/solves/restore', json={
            'session_id': sid, 'solve_number': 1, 'time_ms': 1000, 'dnf': False},
            headers={'Origin': 'https://evil.example'})
        assert response.status_code == 403 and solve_ids(app) == []
