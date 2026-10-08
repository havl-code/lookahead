"""Small helpers for building test data.

Results are written the way people read them: a number of seconds, a (seconds, '+2') pair, or
'DNF'.
"""

import io
from contextlib import closing
from pathlib import Path

from speedcube import db

PROJECT_DIR = Path(__file__).resolve().parent.parent
REAL_DATA = (PROJECT_DIR / 'data').resolve()
FIXTURES = Path(__file__).resolve().parent / 'fixtures'


def to_record(result, scramble=''):
    """A result as the (time_ms, scramble, penalty, dnf) record the database helpers take."""
    if result == 'DNF':
        return (10000, scramble, 'DNF', True)
    if isinstance(result, tuple):
        seconds, penalty = result
        return (round(seconds * 1000), scramble, penalty, False)
    return (round(result * 1000), scramble, None, False)


def seed_session(app, results=(), event='333', date='2026-10-01', cube_id=None, notes=''):
    """Make a session with these results straight in the database (much quicker than the API
    for big histories), with its stats worked out. Returns the session id."""
    with closing(db.connect(app.config['DATABASE'])) as conn, conn:
        cur = conn.execute(
            'INSERT INTO sessions (date, event_id, cube_id, notes, created_at) '
            'VALUES (?, ?, ?, ?, ?)',
            (date, event, cube_id, notes, db.now_iso()),
        )
        session_id = cur.lastrowid
        db.add_solves_to_new_session(conn, session_id, [to_record(r) for r in results])
        db.recompute_session_stats(conn, session_id)
    return session_id


def seed_cube(app, cube_type='333', brand='GAN', model='14', active=True):
    with closing(db.connect(app.config['DATABASE'])) as conn, conn:
        cube_id = db.add_cube(conn, cube_type, brand, model)
        if not active:
            db.deactivate_cube(conn, cube_id)
    return cube_id


def api_add_solves(client, session_id, results):
    """Add results to a session through the API, the way the Sessions tab does."""
    for result in results:
        if result == 'DNF':
            body = {'time_seconds': 10, 'penalty': 'DNF'}
        elif isinstance(result, tuple):
            body = {'time_seconds': result[0], 'penalty': result[1]}
        else:
            body = {'time_seconds': result}
        response = client.post(f'/api/sessions/{session_id}/solves/add', json=body)
        assert response.status_code == 200, response.get_json()


def upload(content, filename='upload.json'):
    """A multipart form file field, for the import and restore routes."""
    if isinstance(content, str):
        content = content.encode('utf-8')
    return {'file': (io.BytesIO(content), filename)}


def query(app, sql, params=()):
    """Rows from the test app's database, as plain dicts."""
    with closing(db.connect(app.config['DATABASE'])) as conn:
        return [dict(row) for row in conn.execute(sql, params).fetchall()]
