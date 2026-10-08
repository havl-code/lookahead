"""SQLite storage: schema, per-request connections, and the core data operations.

Everything the app stores (cubes, sessions, solves, settings, the WCA rank cache) lives in
one SQLite file on this machine. Solve times are stored in milliseconds, and each session
row caches its stats (best/worst/mean/Ao5/Ao12), recomputed whenever its solves change.

The data functions below never commit; callers wrap each unit of work in `with conn:` so it
commits (or rolls back) as one transaction.
"""

import sqlite3
from contextlib import closing
from datetime import date, datetime, timezone
from pathlib import Path

from flask import current_app, g

from .stats import round_half_up, wca_average

# A solve's result in ms, as SQL: the raw time plus 2000 for a +2 penalty. (DNFs are filtered
# out separately.) The column names are unique to the solves table, so this also works in
# queries that join solves to sessions.
RESULT_MS = "(time_ms + CASE WHEN penalty = '+2' THEN 2000 ELSE 0 END)"
# The same, but NULL for a DNF, so aggregates like MIN and AVG skip DNFs.
NON_DNF_RESULT_MS = f'(CASE WHEN dnf THEN NULL ELSE {RESULT_MS} END)'
# A result as the WCA records it (truncated to the hundredth, or the second from 10 minutes up;
# see stats.wca_single_ms), NULL for a DNF. Means are averaged from these, as in competition.
NON_DNF_WCA_RESULT_MS = (
    f'(CASE WHEN dnf THEN NULL WHEN {RESULT_MS} >= 600000 THEN {RESULT_MS} - {RESULT_MS} % 1000 '
    f'ELSE {RESULT_MS} - {RESULT_MS} % 10 END)'
)

# NUMERIC affinity keeps whole-number stats (e.g. best_single) as integers and the rest
# (means, averages) as floats, which is also how the old in-browser version stored them.
SCHEMA = """
CREATE TABLE IF NOT EXISTS cubes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    cube_type     TEXT,
    brand         TEXT,
    model         TEXT,
    purchase_date TEXT,
    notes         TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT,
    event_id     TEXT,
    cube_id      INTEGER,
    solve_count  INTEGER NOT NULL DEFAULT 0,
    best_single  NUMERIC,
    worst_single NUMERIC,
    session_mean NUMERIC,
    ao5          NUMERIC,
    ao12         NUMERIC,
    notes        TEXT,
    created_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_event_date ON sessions (event_id, date);

CREATE TABLE IF NOT EXISTS solves (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL,
    solve_number INTEGER NOT NULL,
    time_ms      INTEGER NOT NULL,
    scramble     TEXT,
    penalty      TEXT,
    dnf          INTEGER NOT NULL DEFAULT 0,
    notes        TEXT,
    timestamp    TEXT
);
CREATE INDEX IF NOT EXISTS idx_solves_session ON solves (session_id, solve_number);
CREATE INDEX IF NOT EXISTS idx_solves_timestamp ON solves (timestamp, id);

CREATE TABLE IF NOT EXISTS settings (
    id       TEXT PRIMARY KEY,
    wca_id   TEXT,
    wca_name TEXT,
    value    TEXT
);

CREATE TABLE IF NOT EXISTS wca_cache (
    path       TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at REAL NOT NULL
);
"""

# Columns added since a table was first made. CREATE TABLE IF NOT EXISTS leaves an existing
# table as it is, so init_db adds any of these a database doesn't have yet. Adding a column
# never touches the rows already there.
#   settings.value: the timer settings, as JSON in the 'timer' row (3.1)
ADDED_COLUMNS = {
    'settings': {'value': 'TEXT'},
}

# Bump this whenever recompute_session_stats changes, so the stats already stored on existing
# sessions get recalculated once on the next start. It's kept in SQLite's user_version.
# 1: Ao5/Ao12 follow the WCA rules for DNFs (3.0).
# 2: means and averages use singles truncated the WCA way (Regulation 9f1) (3.1).
STATS_VERSION = 2


def connect(path):
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


# Safety copies of the database, made before anything that rewrites a lot of it: restoring a
# backup, or updating an existing database to a newer version of the app. They go in a backups
# folder next to the database, and only the newest few are kept.
SAFETY_COPIES_KEPT = 5


def keep_safety_copy(conn, database_path, reason):
    """Copy the database to backups/speedcube-<date>-<time>-before-<reason>.db next to it, using
    SQLite's backup API (which is safe while the app is running), and keep only the newest
    SAFETY_COPIES_KEPT. Returns the copy's path."""
    folder = Path(database_path).parent / 'backups'
    folder.mkdir(exist_ok=True)
    stamp = datetime.now().strftime('%Y-%m-%d-%H%M%S')
    target = folder / f'speedcube-{stamp}-before-{reason}.db'
    count = 2
    while target.exists():  # two in the same second
        target = folder / f'speedcube-{stamp}-{count}-before-{reason}.db'
        count += 1
    with closing(sqlite3.connect(target)) as copy:
        conn.backup(copy)
    copies = sorted(folder.glob('speedcube-*-before-*.db'), key=lambda p: (p.stat().st_mtime, p.name))
    for old in copies[:-SAFETY_COPIES_KEPT]:
        old.unlink()
    return target


def _missing_columns(conn):
    for table, columns in ADDED_COLUMNS.items():
        existing = {row['name'] for row in conn.execute(f'PRAGMA table_info({table})')}
        if existing and set(columns) - existing:
            return True
    return False


def init_db(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect(path)) as conn:
        conn.execute('PRAGMA journal_mode = WAL')
        (stats_version,) = conn.execute('PRAGMA user_version').fetchone()
        # An existing database that's about to be updated (new columns, or stats worked out
        # again under newer rules) gets a safety copy first. A brand new one has nothing to copy.
        has_data = conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'sessions'").fetchone()
        if has_data and (stats_version < STATS_VERSION or _missing_columns(conn)):
            keep_safety_copy(conn, path, 'update')
        conn.executescript(SCHEMA)
        add_missing_columns(conn)
        if stats_version < STATS_VERSION:
            with conn:
                recompute_all_session_stats(conn)
                conn.execute(f'PRAGMA user_version = {STATS_VERSION}')


def add_missing_columns(conn):
    for table, columns in ADDED_COLUMNS.items():
        existing = {row['name'] for row in conn.execute(f'PRAGMA table_info({table})')}
        for column, kind in columns.items():
            if column not in existing:
                with conn:
                    conn.execute(f'ALTER TABLE {table} ADD COLUMN {column} {kind}')


def get_db():
    """This request's connection, opened on first use and closed when the request ends."""
    if 'db' not in g:
        g.db = connect(current_app.config['DATABASE'])
    return g.db


def close_db(exc=None):
    conn = g.pop('db', None)
    if conn is not None:
        conn.close()


def init_app(app):
    init_db(app.config['DATABASE'])
    app.teardown_appcontext(close_db)


def now_iso():
    """Current UTC time in the same format as JavaScript's Date.toISOString()."""
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def today():
    return date.today().isoformat()


# ---- Sessions & solves ----

def create_session(conn, event_id='333', notes='', cube_id=None, date=None):
    """A new, empty session, dated `date` (YYYY-MM-DD) or today."""
    cur = conn.execute(
        'INSERT INTO sessions (date, event_id, cube_id, notes, created_at) VALUES (?, ?, ?, ?, ?)',
        (date or today(), event_id, cube_id or None, notes or '', now_iso()),
    )
    return cur.lastrowid


def start_timer_session(conn, event_id):
    """A new session for the timer. It keeps the cube from the event's latest session, since
    people usually stick with the same cube from one day to the next."""
    latest = conn.execute(
        'SELECT cube_id FROM sessions WHERE event_id = ? ORDER BY date DESC, id DESC LIMIT 1',
        (event_id,),
    ).fetchone()
    cube_id = latest['cube_id'] if latest else None
    return create_session(conn, event_id, 'Live timer session', cube_id)


def todays_session(conn, event_id):
    """The event's newest session dated today, starting one if there isn't one yet."""
    row = conn.execute(
        'SELECT id FROM sessions WHERE event_id = ? AND date = ? ORDER BY id DESC LIMIT 1',
        (event_id, today()),
    ).fetchone()
    return row['id'] if row else start_timer_session(conn, event_id)


def add_solve(conn, session_id, time_seconds, scramble='', penalty=None, notes='', dnf=None):
    """Append a solve to a session. `dnf` defaults to whether the penalty is 'DNF'."""
    (last_number,) = conn.execute(
        'SELECT COALESCE(MAX(solve_number), 0) FROM solves WHERE session_id = ?', (session_id,)
    ).fetchone()
    cur = conn.execute(
        'INSERT INTO solves (session_id, solve_number, time_ms, scramble, penalty, dnf, notes, '
        'timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        (
            session_id,
            last_number + 1,
            round_half_up(float(time_seconds or 0) * 1000),
            scramble or '',
            penalty or None,
            penalty == 'DNF' if dnf is None else dnf,
            notes or '',
            now_iso(),
        ),
    )
    return cur.lastrowid


def add_solves_to_new_session(conn, session_id, records):
    """Bulk-add (time_ms, scramble, penalty, dnf, notes, timestamp) records to a freshly
    created, empty session, numbering them in order. A record without a timestamp (None) is
    stamped with the current time."""
    now = now_iso()
    conn.executemany(
        'INSERT INTO solves (session_id, solve_number, time_ms, scramble, penalty, dnf, notes, '
        'timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            (session_id, number, time_ms, scramble or '', penalty, dnf, notes or '', timestamp or now)
            for number, (time_ms, scramble, penalty, dnf, notes, timestamp) in enumerate(records, start=1)
        ],
    )


def recompute_session_stats(conn, session_id):
    """Recalculate a session's cached stats (count, best, worst, mean, Ao5, Ao12).

    This is the single source of truth for session stats, used everywhere (Sessions tab, Timer
    tab, CSTimer import). Results include +2 penalties. It's run after every change to a
    session's solves, so it only reads the totals and the last 12 solves, not the whole session.
    """
    result = NON_DNF_RESULT_MS
    totals = conn.execute(
        f'SELECT COUNT(*) AS solve_count, MIN({result}) AS best_single, '
        f'MAX({result}) AS worst_single, AVG({NON_DNF_WCA_RESULT_MS}) AS session_mean '
        f'FROM solves WHERE session_id = ?',
        (session_id,),
    ).fetchone()
    last12 = conn.execute(
        'SELECT time_ms, penalty, dnf FROM solves WHERE session_id = ? '
        'ORDER BY solve_number DESC, id DESC LIMIT 12',
        (session_id,),
    ).fetchall()[::-1]

    count = totals['solve_count']
    conn.execute(
        'UPDATE sessions SET solve_count = :solve_count, best_single = :best_single, '
        'worst_single = :worst_single, session_mean = :session_mean, ao5 = :ao5, ao12 = :ao12 '
        'WHERE id = :id',
        {
            **totals,
            'ao5': wca_average(last12[-5:]) if count >= 5 else None,
            'ao12': wca_average(last12) if count >= 12 else None,
            'id': session_id,
        },
    )


def recompute_all_session_stats(conn):
    for (session_id,) in conn.execute('SELECT id FROM sessions').fetchall():
        recompute_session_stats(conn, session_id)


def set_solve_penalty(conn, solve_id, penalty):
    """Set a solve's penalty ('OK', '+2' or 'DNF'). Returns False if there's no such solve."""
    row = conn.execute('SELECT session_id FROM solves WHERE id = ?', (solve_id,)).fetchone()
    if row is None:
        return False
    conn.execute(
        'UPDATE solves SET penalty = ?, dnf = ? WHERE id = ?', (penalty, penalty == 'DNF', solve_id)
    )
    recompute_session_stats(conn, row['session_id'])
    return True


def delete_solve(conn, solve_id):
    """Delete a solve and close the gap in its session's numbering. Returns False if there's
    no such solve."""
    row = conn.execute(
        'SELECT session_id, solve_number FROM solves WHERE id = ?', (solve_id,)
    ).fetchone()
    if row is None:
        return False
    session_id = row['session_id']
    conn.execute('DELETE FROM solves WHERE id = ?', (solve_id,))
    conn.execute(
        'UPDATE solves SET solve_number = solve_number - 1 '
        'WHERE session_id = ? AND solve_number > ?',
        (session_id, row['solve_number']),
    )
    recompute_session_stats(conn, session_id)
    return True


def delete_session(conn, session_id):
    conn.execute('DELETE FROM solves WHERE session_id = ?', (session_id,))
    conn.execute('DELETE FROM sessions WHERE id = ?', (session_id,))


# ---- Cubes ----

CUBE_FIELDS = ('cube_type', 'brand', 'model', 'purchase_date', 'notes', 'is_active')


def add_cube(conn, cube_type, brand='', model='', purchase_date=None, notes=''):
    cur = conn.execute(
        'INSERT INTO cubes (cube_type, brand, model, purchase_date, notes, is_active, created_at) '
        'VALUES (?, ?, ?, ?, ?, 1, ?)',
        (cube_type, brand or '', model or '', purchase_date or None, notes or '', now_iso()),
    )
    return cur.lastrowid


def update_cube(conn, cube_id, fields):
    """Update whichever of CUBE_FIELDS are present in `fields`. Returns False if there was
    nothing to update or no such cube."""
    updates = {key: bool(value) if key == 'is_active' else value
               for key, value in fields.items() if key in CUBE_FIELDS}
    if not updates:
        return False
    assignments = ', '.join(f'{key} = ?' for key in updates)
    cur = conn.execute(f'UPDATE cubes SET {assignments} WHERE id = ?', (*updates.values(), cube_id))
    return cur.rowcount > 0


def deactivate_cube(conn, cube_id):
    conn.execute('UPDATE cubes SET is_active = 0 WHERE id = ?', (cube_id,))
