"""db.keep_safety_copy: a copy of the database before a restore or an update, in a backups
folder next to it, keeping the newest five."""

import json
import sqlite3
from contextlib import closing

from helpers import query, seed_session, upload
from speedcube import create_app, db


def copies(folder):
    return sorted(p.name for p in (folder / 'backups').glob('*.db'))


def solves_in_copy(path):
    with closing(sqlite3.connect(path)) as conn:
        return conn.execute('SELECT COUNT(*) FROM solves').fetchone()[0]


def test_a_restore_keeps_a_copy_of_what_was_there(app, client, backup_v3, tmp_path):
    seed_session(app, [10, 11, 12, 13])
    response = client.post('/api/backup/import', data=upload(json.dumps(backup_v3)))
    name = response.get_json()['safety_copy']
    assert copies(tmp_path) == [name] and name.endswith('-before-restore.db')
    assert solves_in_copy(tmp_path / 'backups' / name) == 4  # the data from before the restore
    assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 7}]


def test_a_bad_file_makes_no_copy(app, client, tmp_path):
    seed_session(app, [10])
    client.post('/api/backup/import', data=upload(b'{"cubes": [], "sessions": [], "solves": [{"id": 1}]}'))
    client.post('/api/backup/import', data=upload(b'{"app": "other", "cubes": [], "sessions": [], "solves": []}'))
    assert not (tmp_path / 'backups').exists()


def test_only_the_newest_five_are_kept(app, tmp_path):
    with closing(db.connect(app.config['DATABASE'])) as conn:
        made = [db.keep_safety_copy(conn, app.config['DATABASE'], 'restore').name for _ in range(7)]
    assert copies(tmp_path) == sorted(made[-5:])


def test_a_new_database_needs_no_copy(tmp_path):
    create_app(tmp_path / 'new.db')
    assert not (tmp_path / 'backups').exists()


def test_updating_an_old_database_keeps_a_copy_first(tmp_path):
    """A 3.0 database (older stats rules, no settings.value column) gets copied before it's
    updated, and only the first time."""
    path = tmp_path / 'old.db'
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(db.SCHEMA.replace('    wca_name TEXT,\n    value    TEXT\n', '    wca_name TEXT\n'))
        conn.execute("INSERT INTO sessions (id, date, event_id) VALUES (1, '2025-01-01', '333')")
        conn.execute('INSERT INTO solves (session_id, solve_number, time_ms) VALUES (1, 1, 12000)')
        conn.execute('PRAGMA user_version = 1')
        conn.commit()
    create_app(path)
    create_app(path)
    names = copies(tmp_path)
    assert len(names) == 1 and names[0].endswith('-before-update.db')
    with closing(sqlite3.connect(tmp_path / 'backups' / names[0])) as conn:
        assert conn.execute('PRAGMA user_version').fetchone()[0] == 1  # the copy is the old one
        assert 'value' not in [row[1] for row in conn.execute('PRAGMA table_info(settings)')]
