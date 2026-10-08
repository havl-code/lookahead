"""Full-data JSON backup: export everything to one file, or restore from one.

The format is the same one the browser-only 2.x version's "Export backup" produced, so a
backup taken from that version can be imported here to bring its data across.
"""

from . import db

BACKUP_APP = 'speedcube-training-explorer'
BACKUP_VERSION = 1

CUBE_COLUMNS = (
    'id', 'cube_type', 'brand', 'model', 'purchase_date', 'notes', 'is_active', 'created_at',
)
SESSION_COLUMNS = (
    'id', 'date', 'event_id', 'cube_id', 'solve_count', 'best_single', 'worst_single',
    'session_mean', 'ao5', 'ao12', 'notes', 'created_at',
)
SOLVE_COLUMNS = (
    'id', 'session_id', 'solve_number', 'time_ms', 'scramble', 'penalty', 'dnf', 'notes',
    'timestamp',
)
SETTINGS_COLUMNS = ('id', 'wca_id', 'wca_name')

BOOLEAN_COLUMNS = {'is_active', 'dnf'}
# Fields every record must have, checked before anything is replaced, so an incomplete file
# is turned down whole rather than half restored
REQUIRED = {
    'cubes': ('id',),
    'sessions': ('id',),
    'solves': ('id', 'session_id', 'solve_number', 'time_ms'),
}


class InvalidBackup(ValueError):
    pass


def _export_table(conn, table, columns):
    rows = conn.execute(f'SELECT {", ".join(columns)} FROM {table} ORDER BY id').fetchall()
    return [
        {col: bool(row[col]) if col in BOOLEAN_COLUMNS else row[col] for col in columns}
        for row in rows
    ]


def export_backup(conn):
    return {
        'app': BACKUP_APP,
        'version': BACKUP_VERSION,
        'exported_at': db.now_iso(),
        'cubes': _export_table(conn, 'cubes', CUBE_COLUMNS),
        'sessions': _export_table(conn, 'sessions', SESSION_COLUMNS),
        'solves': _export_table(conn, 'solves', SOLVE_COLUMNS),
        'settings': _export_table(conn, 'settings', SETTINGS_COLUMNS),
    }


def _restore_table(conn, table, columns, records):
    if not all(isinstance(record, dict) for record in records):
        raise InvalidBackup('This file does not look like a valid backup.')
    conn.execute(f'DELETE FROM {table}')
    placeholders = ', '.join('?' * len(columns))
    conn.executemany(
        f'INSERT OR REPLACE INTO {table} ({", ".join(columns)}) VALUES ({placeholders})',
        [
            [bool(record.get(c)) if c in BOOLEAN_COLUMNS else record.get(c) for c in columns]
            for record in records
        ],
    )


def restore_backup(conn, payload):
    """Replace ALL current data with the backup's. Run inside a transaction (`with conn:`).
    Returns how many solves were left out because their session isn't in the backup."""
    if not isinstance(payload, dict) or not all(
        isinstance(payload.get(key), list) for key in ('cubes', 'sessions', 'solves')
    ):
        raise InvalidBackup('This file does not look like a valid backup.')
    # Older backups may not say which app made them, but one that names another app isn't ours
    if payload.get('app', BACKUP_APP) != BACKUP_APP:
        raise InvalidBackup("This file is a backup from another app, not Speedcube Training Explorer.")
    for table in ('cubes', 'sessions', 'solves'):
        records = payload[table]
        if not all(isinstance(r, dict) and all(r.get(f) is not None for f in REQUIRED[table])
                   for r in records):
            raise InvalidBackup('This file does not look like a valid backup.')

    # A solve whose session isn't in the file would be invisible everywhere in the app, and a
    # session pointing at a missing cube would show a cube that isn't there, so tidy both up.
    session_ids = {s.get('id') for s in payload['sessions']}
    cube_ids = {c.get('id') for c in payload['cubes']}
    solves = [s for s in payload['solves'] if s.get('session_id') in session_ids]
    sessions = [s if s.get('cube_id') in cube_ids or s.get('cube_id') is None else {**s, 'cube_id': None}
                for s in payload['sessions']]

    _restore_table(conn, 'cubes', CUBE_COLUMNS, payload['cubes'])
    _restore_table(conn, 'sessions', SESSION_COLUMNS, sessions)
    _restore_table(conn, 'solves', SOLVE_COLUMNS, solves)
    _restore_table(conn, 'settings', SETTINGS_COLUMNS, payload.get('settings') or [])
    # Backups (especially from 2.x) can carry stats worked out under older rules
    db.recompute_all_session_stats(conn)
    return len(payload['solves']) - len(solves)
