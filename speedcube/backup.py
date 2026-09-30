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
    """Replace ALL current data with the backup's. Run inside a transaction (`with conn:`)."""
    if not isinstance(payload, dict) or not all(
        isinstance(payload.get(key), list) for key in ('cubes', 'sessions', 'solves')
    ):
        raise InvalidBackup('This file does not look like a valid backup.')

    _restore_table(conn, 'cubes', CUBE_COLUMNS, payload['cubes'])
    _restore_table(conn, 'sessions', SESSION_COLUMNS, payload['sessions'])
    _restore_table(conn, 'solves', SOLVE_COLUMNS, payload['solves'])
    _restore_table(conn, 'settings', SETTINGS_COLUMNS, payload.get('settings') or [])
    # Backups (especially from 2.x) can carry stats worked out under older rules
    db.recompute_all_session_stats(conn)
