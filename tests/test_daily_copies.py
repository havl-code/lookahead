"""db.keep_daily_copy: a copy of the database each day, the first time the app starts that day,
kept apart from the safety copies."""

import os
import sqlite3
import time
from contextlib import closing

import pytest

import app as app_module
from helpers import seed_cube, seed_session
from speedcube import create_app, db


def daily(folder):
    return sorted(p.name for p in (folder / 'backups').glob('*-daily.db'))


def touch_later(path, seconds=5):
    """Make a file look changed after the copies made so far."""
    stamp = time.time() + seconds
    os.utime(path, (stamp, stamp))


@pytest.fixture
def database(app, set_today):
    set_today('2026-10-08')
    seed_session(app, [10, 11])
    return app.config['DATABASE']


def test_the_first_start_of_the_day_keeps_a_copy(database, tmp_path):
    copy = db.keep_daily_copy(database)
    assert copy.name.startswith('speedcube-2026-10-08-') and copy.name.endswith('-daily.db')
    with closing(sqlite3.connect(copy)) as conn:
        assert conn.execute('SELECT COUNT(*) FROM solves').fetchone()[0] == 2


def test_only_one_a_day(database, tmp_path):
    db.keep_daily_copy(database)
    touch_later(database)
    assert db.keep_daily_copy(database) is None
    assert len(daily(tmp_path)) == 1


def test_a_new_day_with_changes_gets_its_own(database, tmp_path, set_today, app):
    db.keep_daily_copy(database)
    set_today('2026-10-09')
    seed_session(app, [12])
    touch_later(database)
    assert db.keep_daily_copy(database) is not None
    assert [name[10:20] for name in daily(tmp_path)] == ['2026-10-08', '2026-10-09']


def test_no_copy_when_nothing_has_changed(database, tmp_path, set_today):
    db.keep_daily_copy(database)
    for wal in tmp_path.glob('*.db-wal'):
        os.utime(wal, (0, 0))
    os.utime(database, (0, 0))  # untouched since long before the copy
    set_today('2026-10-09')
    assert db.keep_daily_copy(database) is None
    assert len(daily(tmp_path)) == 1


def test_only_the_newest_seven_are_kept(database, tmp_path, set_today):
    for day in range(1, 11):
        set_today(f'2026-10-{day:02}')
        touch_later(database, seconds=day * 10)
        db.keep_daily_copy(database)
    assert [name[10:20] for name in daily(tmp_path)] == [f'2026-10-{day:02}' for day in range(4, 11)]


def test_daily_and_safety_copies_dont_push_each_other_out(database, tmp_path, set_today):
    with closing(db.connect(database)) as conn:
        for _ in range(5):
            db.keep_safety_copy(conn, database, 'restore')
    for day in range(1, 10):
        set_today(f'2026-10-{day:02}')
        touch_later(database, seconds=day * 10)
        db.keep_daily_copy(database)
    assert len(daily(tmp_path)) == 7
    assert len(list((tmp_path / 'backups').glob('*-before-restore.db'))) == 5


def test_nothing_to_copy_in_an_empty_database(tmp_path):
    path = tmp_path / 'new.db'
    create_app(path)
    assert db.keep_daily_copy(path) is None
    assert not (tmp_path / 'backups').exists()


def test_cubes_alone_are_worth_a_copy(tmp_path, set_today):
    set_today('2026-10-08')
    flask_app = create_app(tmp_path / 'cubes.db')
    seed_cube(flask_app)
    assert db.keep_daily_copy(tmp_path / 'cubes.db') is not None


def test_no_database_yet(tmp_path):
    assert db.keep_daily_copy(tmp_path / 'missing.db') is None


class TestStartingTheApp:
    @pytest.fixture
    def started(self, monkeypatch):
        monkeypatch.setattr(app_module, 'leave_console_window', lambda: False)
        monkeypatch.setattr(app_module, 'port_is_free', lambda port: True)
        monkeypatch.setattr(app_module.webbrowser, 'open', lambda url: None)

        class Server:
            server_port = 8577

            def serve_forever(self):
                raise KeyboardInterrupt

            def server_close(self):
                pass
        monkeypatch.setattr(app_module, 'make_server', lambda *args, **kwargs: Server())
        monkeypatch.setattr(app_module.threading, 'Thread', lambda **kwargs: type('T', (), {'start': lambda self: None})())

    def test_starting_the_app_keeps_the_days_copy(self, started, monkeypatch):
        made = []
        monkeypatch.setattr(db, 'keep_daily_copy', made.append)
        app_module.main()
        assert made == [app_module.DATABASE]  # a temporary database in the tests

    def test_a_failed_copy_doesnt_stop_the_app(self, started, monkeypatch, capsys):
        def fail(path):
            raise OSError('disk full')
        monkeypatch.setattr(db, 'keep_daily_copy', fail)
        app_module.main()
        assert "Couldn't make today's copy of your data: disk full" in capsys.readouterr().out
