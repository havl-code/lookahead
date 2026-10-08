"""PB averages: each session's best Ao5, Ao12, Ao50, and Ao100, and each event's best ones.

The WCA defines only the average of 5 (Regulation 9f8). Longer averages drop 5% from each end,
rounded up (the community convention): 1 for an Ao12, 3 for an Ao50, and 5 for an Ao100.
"""

import random
import sqlite3
import time
from contextlib import closing

import pytest

from helpers import APP_URL, query, seed_session
from speedcube import create_app, db, stats

OLD_SCHEMA = """
    CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, event_id TEXT,
        cube_id INTEGER, solve_count INTEGER NOT NULL DEFAULT 0, best_single NUMERIC,
        worst_single NUMERIC, session_mean NUMERIC, ao5 NUMERIC, ao12 NUMERIC, notes TEXT,
        created_at TEXT);
    CREATE TABLE solves (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL,
        solve_number INTEGER NOT NULL, time_ms INTEGER NOT NULL, scramble TEXT, penalty TEXT,
        dnf INTEGER NOT NULL DEFAULT 0, notes TEXT, timestamp TEXT);
    INSERT INTO sessions (id, date, event_id) VALUES (1, '2025-01-01', '333');
    PRAGMA user_version = 2;
"""


def brute_force_best(results, size):
    """The best average by working out every window from scratch, to check the fast version."""
    best = None
    for end in range(size - 1, len(results)):
        average = stats.trimmed_average(results[end - size + 1:end + 1], stats.trim_for(size))
        if average is not None and (best is None or average < best):
            best = average
    return best


class TestBestAverage:
    @pytest.mark.parametrize('size, trim', [(5, 1), (12, 1), (50, 3), (100, 5)])
    def test_how_much_each_average_drops(self, size, trim):
        assert stats.trim_for(size) == trim

    def test_the_best_window_and_where_it_ends(self):
        results = [15000, 14000, 10000, 11000, 12000, 13000, 20000]
        # Windows: 15 14 10 11 12 (12.33), 14 10 11 12 13 (12.00), 10 11 12 13 20 (12.00)
        assert stats.best_average(results, 5) == (12000, 5)  # the first of the tied windows

    def test_too_few_results(self):
        assert stats.best_average([10000] * 4, 5) == (None, None)

    def test_windows_with_too_many_dnfs_are_skipped(self):
        results = [None, None, 10000, 10000, 10000, 12000, 12000, 12000, 12000]
        best, end = stats.best_average(results, 5)
        # DNF, DNF, 10, 10, 10 is a DNF; DNF, 10, 10, 10, 12 has one DNF, dropped as the worst,
        # so it's (10 + 10 + 12) / 3, and the next window ties with it
        assert best == pytest.approx(32000 / 3) and end == 5

    def test_every_window_a_dnf(self):
        assert stats.best_average([None, 10000] * 5, 5) == (None, None)

    def test_ao50_allows_three_dnfs(self):
        assert stats.best_average([None] * 3 + [10000] * 47, 50)[0] == 10000
        assert stats.best_average([None] * 4 + [10000] * 46, 50)[0] is None

    def test_singles_are_truncated_first(self):
        assert stats.best_average([10009] * 5, 5)[0] == 10000

    @pytest.mark.parametrize('size', stats.AVERAGE_SIZES)
    def test_matches_working_out_every_window(self, size):
        rng = random.Random(size)
        results = [None if rng.random() < 0.04 else rng.randint(8000, 16000) for _ in range(400)]
        assert stats.best_average(results, size)[0] == brute_force_best(results, size)

    def test_dropped_positions(self):
        assert stats.dropped_in_window([12000, 10000, None, 11000, 13000], 5) == {1, 2}
        assert stats.dropped_in_window([10000, 10000, 12000, 14000, 14000], 5) == {0, 4}


class TestSessionBests:
    def bests(self, app, sid):
        return query(app, 'SELECT best_ao5, best_ao12, best_ao50, best_ao100 FROM sessions WHERE id = ?',
                     (sid,))[0]

    def test_a_session_stores_its_bests(self, app):
        sid = seed_session(app, [10 + (i % 7) for i in range(120)])
        results = [(10 + (i % 7)) * 1000 for i in range(120)]
        assert self.bests(app, sid) == {f'best_ao{n}': brute_force_best(results, n) for n in (5, 12, 50, 100)}

    def test_short_sessions_have_no_long_averages(self, app):
        assert self.bests(app, seed_session(app, [10, 11, 12, 13, 14])) == {
            'best_ao5': 12000, 'best_ao12': None, 'best_ao50': None, 'best_ao100': None}

    def test_adding_solves_one_at_a_time_matches_a_full_recompute(self, app, client):
        rng = random.Random(7)
        sid = seed_session(app, [])
        for _ in range(130):
            if rng.random() < 0.05:
                body = {'time_seconds': 10, 'penalty': 'DNF'}
            else:
                body = {'time_seconds': round(rng.uniform(8, 16), 3),
                        'penalty': rng.choice(['OK'] * 9 + ['+2'])}
            assert client.post(f'/api/sessions/{sid}/solves/add', json=body).status_code == 200
        added_one_by_one = self.bests(app, sid)
        with closing(db.connect(app.config['DATABASE'])) as conn, conn:
            db.recompute_session_stats(conn, sid)
        assert self.bests(app, sid) == added_one_by_one

    def test_deleting_a_solve_works_the_bests_out_again(self, app, client):
        sid = seed_session(app, [20, 20, 20, 9, 9, 9, 9, 9])
        assert self.bests(app, sid)['best_ao5'] == 9000
        for _ in range(3):
            nine = query(app, 'SELECT id FROM solves WHERE time_ms = 9000 ORDER BY solve_number LIMIT 1')[0]['id']
            client.delete(f'/api/solves/{nine}')
        # Left: 20, 20, 20, 9, 9, so the best Ao5 is now (20 + 20 + 9) / 3
        assert self.bests(app, sid)['best_ao5'] == pytest.approx(49000 / 3)

    def test_a_penalty_change_works_the_bests_out_again(self, app, client):
        sid = seed_session(app, [10, 10, 10, 10, 10])
        second = query(app, 'SELECT id FROM solves WHERE solve_number = 2')[0]['id']
        client.put(f'/api/timer/solve/{second}/penalty', json={'penalty': 'DNF'})
        assert self.bests(app, sid)['best_ao5'] == 10000
        third = query(app, 'SELECT id FROM solves WHERE solve_number = 3')[0]['id']
        client.put(f'/api/timer/solve/{third}/penalty', json={'penalty': 'DNF'})
        assert self.bests(app, sid)['best_ao5'] is None  # two DNFs in the only window

    def test_fast_with_a_huge_session(self, app, client):
        """A session of 50,000 solves: its bests are worked out in a few seconds at most, a timer
        solve added to it takes a moment, and the Dashboard's lookup is quick."""
        rng = random.Random(1)
        results = [round(rng.uniform(8, 16), 3) for _ in range(50_000)]
        start = time.perf_counter()
        sid = seed_session(app, results)
        assert time.perf_counter() - start < 6  # seeding and the full recompute together
        start = time.perf_counter()
        response = client.post('/api/timer/solve', json={'session_id': sid, 'follow_today': False, 'time': 9.5})
        assert response.status_code == 200 and time.perf_counter() - start < 0.5
        start = time.perf_counter()
        data = client.get('/api/stats?event_id=333').get_json()
        assert time.perf_counter() - start < 1 and data['best_averages']['ao100'] is not None


class TestDashboard:
    def test_the_events_best_averages_and_where_they_are_from(self, app, client):
        seed_session(app, [12] * 12, date='2026-09-01')
        best = seed_session(app, [10, 11, 10, 11, 10] + [13] * 7, date='2026-09-02')
        averages = client.get('/api/stats?event_id=333').get_json()['best_averages']
        assert averages['ao5'] == {'value': 10.33, 'session_id': best, 'date': '2026-09-02'}
        assert averages['ao12']['value'] == 12.0 and averages['ao50'] is None

    def test_all_events_has_no_averages(self, app, client):
        seed_session(app, [12] * 5)
        assert client.get('/api/stats?event_id=all').get_json()['best_averages'] is None

    def test_the_details_list_the_solves_with_the_dropped_ones_marked(self, app, client):
        sid = seed_session(app, [20, 9, 'DNF', 10, 11, 12, 30], date='2026-09-03')
        details = client.get('/api/pb-details?event_id=333&kind=ao5').get_json()
        # Windows: 20 9 DNF 10 11 (13.67), 9 DNF 10 11 12 (11.00), DNF 10 11 12 30 (17.67)
        assert (details['value'], details['session_id'], details['date']) == (11.0, sid, '2026-09-03')
        assert [(s['solve_number'], s['result'], s['counted']) for s in details['solves']] == [
            (2, 9.0, False), (3, None, False), (4, 10.0, True), (5, 11.0, True), (6, 12.0, True)]

    @pytest.mark.parametrize('query_string, status', [
        ('event_id=333&kind=ao7', 400), ('event_id=all&kind=ao5', 400), ('event_id=333&kind=ao100', 404)])
    def test_details_errors(self, app, client, query_string, status):
        seed_session(app, [12] * 5)
        assert client.get(f'/api/pb-details?{query_string}').status_code == status


def test_an_old_database_gets_its_bests_on_first_start(tmp_path):
    path = tmp_path / 'old.db'
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(OLD_SCHEMA)
        conn.executemany('INSERT INTO solves (session_id, solve_number, time_ms) VALUES (1, ?, ?)',
                         [(i, 10000 + i * 100) for i in range(1, 13)])
        conn.commit()
    app = create_app(path)
    # Solves of 10.1 to 11.2 s: the best Ao5 is 10.2 to 10.4 (10.3), the Ao12 drops 10.1 and 11.2
    assert query(app, 'SELECT best_ao5, best_ao12 FROM sessions') == [{'best_ao5': 10300, 'best_ao12': 10650}]
    assert query(app, 'PRAGMA user_version') == [{'user_version': db.STATS_VERSION}]
    assert len(list((tmp_path / 'backups').glob('*-before-update.db'))) == 1
    assert APP_URL  # the shared address the test client uses
