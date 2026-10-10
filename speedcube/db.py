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

from .stats import AVERAGE_SIZES, best_average, round_half_up, trimmed_average, trim_for, wca_average

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
    created_at   TEXT,
    best_ao5     NUMERIC,
    best_ao12    NUMERIC,
    best_ao50    NUMERIC,
    best_ao100   NUMERIC
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
#   settings.value: the timer settings, as JSON in the 'timer' row (3.2)
#   sessions.best_ao5 to best_ao100: the session's best averages, for the PB averages (3.2)
ADDED_COLUMNS = {
    'settings': {'value': 'TEXT'},
    'sessions': {f'best_ao{size}': 'NUMERIC' for size in AVERAGE_SIZES},
}

# Bump this whenever recompute_session_stats changes, so the stats already stored on existing
# sessions get recalculated once on the next start. It's kept in SQLite's user_version.
# 1: Ao5/Ao12 follow the WCA rules for DNFs (3.0).
# 2: means and averages use singles truncated the WCA way (Regulation 9f1) (3.2).
# 3: each session's best Ao5, Ao12, Ao50, and Ao100 (3.2).
STATS_VERSION = 3


def connect(path):
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


# Copies of the database, in a backups folder next to it, made with SQLite's backup API (which
# is safe while the app is running). There are two kinds, each keeping only its own newest few,
# so neither can push the other out:
#  - safety copies, made before anything that rewrites a lot of the database: restoring a
#    backup, or updating an existing database to a newer version of the app;
#  - daily copies, made the first time the app starts each day.
SAFETY_COPIES_KEPT = 5
DAILY_COPIES_KEPT = 7


def _copy_database(conn, target):
    with closing(sqlite3.connect(target)) as copy:
        conn.backup(copy)


def keep_safety_copy(conn, database_path, reason):
    """Copy the database to backups/speedcube-<date>-<time>-before-<reason>.db next to it, and
    keep only the newest SAFETY_COPIES_KEPT. Returns the copy's path."""
    folder = Path(database_path).parent / 'backups'
    folder.mkdir(exist_ok=True)
    stamp = datetime.now().strftime('%Y-%m-%d-%H%M%S')
    target = folder / f'speedcube-{stamp}-before-{reason}.db'
    count = 2
    while target.exists():  # two in the same second
        target = folder / f'speedcube-{stamp}-{count}-before-{reason}.db'
        count += 1
    _copy_database(conn, target)
    copies = sorted(folder.glob('speedcube-*-before-*.db'), key=lambda p: (p.stat().st_mtime, p.name))
    for old in copies[:-SAFETY_COPIES_KEPT]:
        old.unlink()
    return target


def keep_daily_copy(database_path):
    """The day's copy of the database, as backups/speedcube-<date>-<time>-daily.db next to it,
    keeping only the newest DAILY_COPIES_KEPT. It's made the first time the app starts each day,
    but not for a database with nothing in it yet, nor when nothing has changed since the last
    one, so the copies kept go back as far as they can. Returns the copy's path, or None."""
    path = Path(database_path)
    folder = path.parent / 'backups'
    if not path.exists():
        return None
    earlier = sorted(folder.glob('speedcube-*-daily.db'))  # by name, so oldest first
    if any(copy.name.startswith(f'speedcube-{today()}-') for copy in earlier):
        return None
    if earlier:
        # Changes land in the -wal file first, and reach the database file itself later
        changed = max(p.stat().st_mtime for p in (path, path.with_name(path.name + '-wal')) if p.exists())
        if changed <= earlier[-1].stat().st_mtime:
            return None
    with closing(connect(path)) as conn:
        if not conn.execute('SELECT EXISTS (SELECT 1 FROM sessions) OR EXISTS (SELECT 1 FROM cubes)').fetchone()[0]:
            return None
        folder.mkdir(exist_ok=True)
        target = folder / f'speedcube-{today()}-{datetime.now():%H%M%S}-daily.db'
        _copy_database(conn, target)
    for old in sorted(folder.glob('speedcube-*-daily.db'))[:-DAILY_COPIES_KEPT]:
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


SESSION_FIELDS = ('date', 'cube_id', 'notes')


def update_session(conn, session_id, fields):
    """Change whichever of a session's date, cube, and notes are in `fields` (already checked).
    Its stats don't depend on any of them, so they stay as they are."""
    updates = {key: value for key, value in fields.items() if key in SESSION_FIELDS}
    if updates:
        assignments = ', '.join(f'{key} = ?' for key in updates)
        conn.execute(f'UPDATE sessions SET {assignments} WHERE id = ?', (*updates.values(), session_id))


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


def recompute_session_stats(conn, session_id, appended=False):
    """Recalculate a session's cached stats (count, best, worst, mean, Ao5, Ao12, and the best
    Ao5, Ao12, Ao50, and Ao100).

    This is the single source of truth for session stats, used everywhere (Sessions tab, Timer
    tab, CSTimer import). Results include +2 penalties. It's run after every change to a
    session's solves. The totals and last averages only need the last 12 solves. The best
    averages need every solve, except when the only change is one solve added at the end
    (appended=True, as the timer does): then the only new average is the latest one, so the
    best is the better of it and the best so far, and a huge session stays quick to time in.
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
        'worst_single = :worst_single, session_mean = :session_mean, ao5 = :ao5, ao12 = :ao12, '
        'best_ao5 = :best_ao5, best_ao12 = :best_ao12, best_ao50 = :best_ao50, '
        'best_ao100 = :best_ao100 WHERE id = :id',
        {
            **totals,
            'ao5': wca_average(last12[-5:]) if count >= 5 else None,
            'ao12': wca_average(last12) if count >= 12 else None,
            **(_best_averages_after_append(conn, session_id) if appended
               else _best_averages(conn, session_id)),
            'id': session_id,
        },
    )


def _results_in_order(conn, session_id, last=None):
    """The session's results in ms (None for a DNF) in solve order, or only the last `last`."""
    if last is None:
        rows = conn.execute(f'SELECT {NON_DNF_RESULT_MS} FROM solves WHERE session_id = ? '
                            'ORDER BY solve_number, id', (session_id,))
        return [row[0] for row in rows]
    rows = conn.execute(f'SELECT {NON_DNF_RESULT_MS} FROM solves WHERE session_id = ? '
                        'ORDER BY solve_number DESC, id DESC LIMIT ?', (session_id, last))
    return [row[0] for row in rows][::-1]


def _best_averages(conn, session_id):
    results = _results_in_order(conn, session_id)
    return {f'best_ao{size}': best_average(results, size)[0] for size in AVERAGE_SIZES}


def _best_averages_after_append(conn, session_id):
    stored = conn.execute(
        'SELECT ' + ', '.join(f'best_ao{size}' for size in AVERAGE_SIZES) + ' FROM sessions WHERE id = ?',
        (session_id,)).fetchone()
    latest = _results_in_order(conn, session_id, last=max(AVERAGE_SIZES))
    bests = {}
    for size in AVERAGE_SIZES:
        best = stored[f'best_ao{size}']
        if len(latest) >= size:
            newest = trimmed_average(latest[-size:], trim_for(size))
            if newest is not None and (best is None or newest < best):
                best = newest
        bests[f'best_ao{size}'] = best
    return bests


def recompute_all_session_stats(conn):
    for (session_id,) in conn.execute('SELECT id FROM sessions').fetchall():
        recompute_session_stats(conn, session_id)


def update_solve(conn, solve_id, fields):
    """Change whichever of a solve's penalty ('OK', '+2' or 'DNF') and notes are in `fields`
    (already checked). Returns False if there's no such solve. A new penalty changes the
    session's stats, so they're recalculated; a note doesn't touch them."""
    row = conn.execute('SELECT session_id FROM solves WHERE id = ?', (solve_id,)).fetchone()
    if row is None:
        return False
    if 'notes' in fields:
        conn.execute('UPDATE solves SET notes = ? WHERE id = ?', (fields['notes'] or '', solve_id))
    if 'penalty' in fields:
        penalty = fields['penalty']
        conn.execute(
            'UPDATE solves SET penalty = ?, dnf = ? WHERE id = ?', (penalty, penalty == 'DNF', solve_id)
        )
        recompute_session_stats(conn, row['session_id'])
    return True


# Everything about a solve that's kept, apart from its id: what delete_solve hands back, and
# what restore_solve needs to put it back exactly as it was.
SOLVE_RECORD = ('session_id', 'solve_number', 'time_ms', 'scramble', 'penalty', 'dnf', 'notes',
                'timestamp')


def delete_solve(conn, solve_id):
    """Delete a solve and close the gap in its session's numbering. Returns the solve as it was
    stored (a dict of SOLVE_RECORD), so it can be put back, or None if there's no such solve."""
    row = conn.execute('SELECT * FROM solves WHERE id = ?', (solve_id,)).fetchone()
    if row is None:
        return None
    session_id = row['session_id']
    conn.execute('DELETE FROM solves WHERE id = ?', (solve_id,))
    conn.execute(
        'UPDATE solves SET solve_number = solve_number - 1 '
        'WHERE session_id = ? AND solve_number > ?',
        (session_id, row['solve_number']),
    )
    recompute_session_stats(conn, session_id)
    return {**{key: row[key] for key in SOLVE_RECORD}, 'dnf': bool(row['dnf'])}


def restore_solve(conn, record):
    """Put a deleted solve back (a record like the one delete_solve returns, already checked):
    at its old number, or at the end if its session has fewer solves now, moving the solves
    after it along by one. Returns its new id."""
    session_id = record['session_id']
    (last_number,) = conn.execute(
        'SELECT COALESCE(MAX(solve_number), 0) FROM solves WHERE session_id = ?', (session_id,)
    ).fetchone()
    number = min(record['solve_number'], last_number + 1)
    conn.execute(
        'UPDATE solves SET solve_number = solve_number + 1 '
        'WHERE session_id = ? AND solve_number >= ?',
        (session_id, number),
    )
    cur = conn.execute(
        'INSERT INTO solves (session_id, solve_number, time_ms, scramble, penalty, dnf, notes, '
        'timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        (session_id, number, record['time_ms'], record['scramble'] or '', record['penalty'],
         record['dnf'], record['notes'] or '', record['timestamp'] or now_iso()),
    )
    # Put back at the end (the usual undo, straight after deleting the latest solve), it's
    # just one more solve, so the quick way of updating the stats is enough.
    recompute_session_stats(conn, session_id, appended=number == last_number + 1)
    return cur.lastrowid


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
