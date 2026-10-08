"""db.py: the schema, connections, session stats, and the core data operations."""

import re
import sqlite3
from contextlib import closing

import pytest

from helpers import query, seed_cube, seed_session
from speedcube import create_app, db


def open_db(app):
    return closing(db.connect(app.config['DATABASE']))


def session_row(app, session_id):
    return query(app, 'SELECT * FROM sessions WHERE id = ?', (session_id,))[0]


class TestSessionStats:
    def test_counts_bests_means_and_averages(self, app):
        # Results: 10, 13 (11 + 2), DNF, 12, 13, 14
        sid = seed_session(app, [10, (11, '+2'), 'DNF', 12, 13, 14])
        s = session_row(app, sid)
        assert s['solve_count'] == 6
        assert (s['best_single'], s['worst_single']) == (10000, 14000)
        assert s['session_mean'] == 12400  # DNFs are left out of the mean
        # The last 5 are 13, DNF, 12, 13, 14: drop the 12 and the DNF
        assert s['ao5'] == pytest.approx(40000 / 3)
        assert s['ao12'] is None

    def test_ao5_needs_five_solves(self, app):
        assert session_row(app, seed_session(app, [10, 11, 12, 13]))['ao5'] is None

    def test_two_dnfs_in_the_last_five_make_ao5_a_dnf(self, app):
        assert session_row(app, seed_session(app, [10, 11, 'DNF', 12, 'DNF']))['ao5'] is None

    def test_ao12(self, app):
        assert session_row(app, seed_session(app, list(range(1, 13))))['ao12'] == 6500

    def test_an_empty_session(self, app):
        s = session_row(app, seed_session(app, []))
        assert s['solve_count'] == 0 and s['best_single'] is None and s['ao5'] is None


class TestSolves:
    def test_add_solve_numbers_in_order_and_infers_dnf(self, app):
        sid = seed_session(app, [10])
        with open_db(app) as conn, conn:
            db.add_solve(conn, sid, 12.5, 'R U', 'DNF')
            db.add_solve(conn, sid, 11.0, '', '+2')
        rows = query(app, 'SELECT solve_number, time_ms, penalty, dnf FROM solves '
                          'WHERE session_id = ? ORDER BY solve_number', (sid,))
        assert [(r['solve_number'], r['dnf']) for r in rows] == [(1, 0), (2, 1), (3, 0)]
        assert rows[1]['time_ms'] == 12500 and rows[2]['penalty'] == '+2'

    def test_delete_solve_renumbers_the_rest(self, app):
        sid = seed_session(app, [10, 11, 12, 13, 14])
        second = query(app, 'SELECT id FROM solves WHERE session_id = ? AND solve_number = 2',
                       (sid,))[0]['id']
        with open_db(app) as conn, conn:
            assert db.delete_solve(conn, second) is True
        rows = query(app, 'SELECT solve_number, time_ms FROM solves WHERE session_id = ? '
                          'ORDER BY solve_number', (sid,))
        assert [(r['solve_number'], r['time_ms']) for r in rows] == [
            (1, 10000), (2, 12000), (3, 13000), (4, 14000)]
        s = session_row(app, sid)
        assert s['solve_count'] == 4 and s['ao5'] is None

    def test_delete_missing_solve(self, app):
        with open_db(app) as conn, conn:
            assert db.delete_solve(conn, 12345) is False

    def test_set_penalty_updates_the_dnf_flag_and_stats(self, app):
        sid = seed_session(app, [10, 11, 12, 13, 14])
        first = query(app, 'SELECT id FROM solves WHERE session_id = ? AND solve_number = 1',
                      (sid,))[0]['id']
        with open_db(app) as conn, conn:
            assert db.set_solve_penalty(conn, first, 'DNF') is True
        assert query(app, 'SELECT dnf FROM solves WHERE id = ?', (first,))[0]['dnf'] == 1
        assert session_row(app, sid)['best_single'] == 11000
        with open_db(app) as conn, conn:
            db.set_solve_penalty(conn, first, '+2')
        assert query(app, 'SELECT dnf FROM solves WHERE id = ?', (first,))[0]['dnf'] == 0
        assert session_row(app, sid)['best_single'] == 11000  # 10 + 2 = 12, so 11 is still best

    def test_set_penalty_on_a_missing_solve(self, app):
        with open_db(app) as conn, conn:
            assert db.set_solve_penalty(conn, 999, 'OK') is False

    def test_delete_session_takes_its_solves(self, app):
        sid = seed_session(app, [10, 11])
        keep = seed_session(app, [12])
        with open_db(app) as conn, conn:
            db.delete_session(conn, sid)
        assert query(app, 'SELECT session_id FROM solves') == [{'session_id': keep}]


class TestTimerSessions:
    def test_create_session_is_dated_today(self, app, set_today):
        set_today('2026-10-08')
        with open_db(app) as conn, conn:
            sid = db.create_session(conn, '222', 'hello', 0)
        s = session_row(app, sid)
        assert (s['date'], s['event_id'], s['notes'], s['cube_id']) == ('2026-10-08', '222', 'hello', None)

    def test_a_new_timer_session_keeps_the_last_cube(self, app, set_today):
        set_today('2026-10-08')
        cube = seed_cube(app)
        seed_session(app, [10], date='2026-10-01', cube_id=cube)
        with open_db(app) as conn, conn:
            sid = db.start_timer_session(conn, '333')
        s = session_row(app, sid)
        assert s['cube_id'] == cube and s['notes'] == 'Live timer session'

    def test_todays_session_is_reused(self, app, set_today):
        set_today('2026-10-08')
        yesterday = seed_session(app, [10], date='2026-10-07')
        with open_db(app) as conn, conn:
            first = db.todays_session(conn, '333')
            again = db.todays_session(conn, '333')
            other_event = db.todays_session(conn, '222')
        assert first == again != yesterday
        assert other_event != first
        assert session_row(app, first)['date'] == '2026-10-08'

    def test_todays_newest_session_wins(self, app, set_today):
        set_today('2026-10-08')
        seed_session(app, [10], date='2026-10-08')
        newer = seed_session(app, [11], date='2026-10-08')
        with open_db(app) as conn, conn:
            assert db.todays_session(conn, '333') == newer


class TestCubes:
    def test_update_only_known_fields(self, app):
        cube = seed_cube(app)
        with open_db(app) as conn, conn:
            assert db.update_cube(conn, cube, {'brand': 'MoYu', 'colour': 'red'}) is True
            assert db.update_cube(conn, cube, {'colour': 'red'}) is False
            db.update_cube(conn, cube, {'is_active': 0})
        row = query(app, 'SELECT brand, is_active FROM cubes WHERE id = ?', (cube,))[0]
        assert row == {'brand': 'MoYu', 'is_active': 0}

    def test_update_a_missing_cube(self, app):
        with open_db(app) as conn, conn:
            assert db.update_cube(conn, 999, {'brand': 'x'}) is False


class TestSetup:
    def test_init_creates_the_folder_and_uses_wal(self, tmp_path):
        path = tmp_path / 'nested' / 'folder' / 'app.db'
        create_app(path)
        assert path.exists()
        with closing(db.connect(path)) as conn:
            assert conn.execute('PRAGMA journal_mode').fetchone()[0] == 'wal'

    def test_old_stats_are_recomputed_once(self, tmp_path):
        path = tmp_path / 'old.db'
        with closing(sqlite3.connect(path)) as conn:
            conn.executescript(db.SCHEMA)
            conn.execute("INSERT INTO sessions (id, date, event_id, solve_count, ao5) "
                         "VALUES (1, '2025-01-01', '333', 99, 1)")
            conn.executemany(
                'INSERT INTO solves (session_id, solve_number, time_ms, dnf) VALUES (1, ?, ?, 0)',
                [(i, 10000 + i * 1000) for i in range(1, 6)])
            conn.commit()  # user_version is still 0, as in a database from before 3.0
        db.init_db(path)
        with closing(db.connect(path)) as conn:
            row = conn.execute('SELECT solve_count, ao5 FROM sessions').fetchone()
            assert (row['solve_count'], row['ao5']) == (5, 13000)  # 11 to 15 s: drop 11 and 15
            assert conn.execute('PRAGMA user_version').fetchone()[0] == db.STATS_VERSION
            conn.execute('UPDATE sessions SET ao5 = 1')
            conn.commit()
        db.init_db(path)  # stats are up to date now, so they're left alone
        with closing(db.connect(path)) as conn:
            assert conn.execute('SELECT ao5 FROM sessions').fetchone()[0] == 1

    def test_one_connection_per_request(self, app):
        with app.app_context():
            assert db.get_db() is db.get_db()
        with app.app_context():
            first = db.get_db()
        with app.app_context():
            assert db.get_db() is not first

    def test_now_iso_matches_javascript(self):
        assert re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z', db.now_iso())


def test_new_columns_are_added_to_an_old_database(tmp_path):
    """3.0 databases have no settings.value column; starting the app adds it and keeps the rows."""
    path = tmp_path / 'old.db'
    with closing(sqlite3.connect(path)) as conn:
        conn.execute('CREATE TABLE settings (id TEXT PRIMARY KEY, wca_id TEXT, wca_name TEXT)')
        conn.execute("INSERT INTO settings VALUES ('user', '2003POCH01', 'Test Person')")
        conn.commit()
    db.init_db(path)
    db.init_db(path)  # and doing it again changes nothing
    with closing(db.connect(path)) as conn:
        columns = [row['name'] for row in conn.execute('PRAGMA table_info(settings)')]
        assert columns == ['id', 'wca_id', 'wca_name', 'value']
        assert dict(conn.execute('SELECT * FROM settings').fetchone()) == {
            'id': 'user', 'wca_id': '2003POCH01', 'wca_name': 'Test Person', 'value': None}
