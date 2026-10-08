"""CSTimer import.

A CSTimer export is a JSON object mapping session keys to lists of solves, plus a "properties"
key holding CSTimer's settings:

    {"session1": [[[penalty, time_ms], "scramble", "comment", timestamp], ...], ...,
     "properties": {"sessionData": "{\\"1\\": {\\"name\\": \\"Main 3x3\\", ...}, ...}", ...}}

penalty is 0 for OK, 2000 for +2, and -1 for DNF; timestamp is when the solve was done, in Unix
seconds. properties.sessionData (a JSON string, or an object in some versions) holds each
session's name, keyed by the number in its session key. CSTimer's default names are numbers.
"""

import json
import math
import time
from collections import Counter
from datetime import datetime, timezone

from . import db
from .stats import average_seconds, round_half_up, single_seconds, wca_single_ms
from .validation import MAX_SOLVE_SECONDS

# CSTimer's penalty codes, and how each is stored here (OK, +2, or DNF)
PENALTY_CODES = {0: 'OK', 2000: '+2', -1: 'DNF'}
# Timestamps before this (1 January 2000) can't be real solves, so they're treated as missing
EARLIEST_TIMESTAMP = 946684800


def load(raw):
    """Parse an uploaded export file's bytes. Raises ValueError if it isn't a JSON object."""
    data = json.loads(raw.decode('utf-8-sig'))
    if not isinstance(data, dict):
        raise ValueError('Not a CSTimer export')
    return data


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def iso_time(unix_seconds):
    """A Unix time as the app stores timestamps (UTC, like JavaScript's toISOString())."""
    return (datetime.fromtimestamp(unix_seconds, timezone.utc)
            .isoformat(timespec='milliseconds').replace('+00:00', 'Z'))


def local_date(unix_seconds):
    """The date a solve was done on this computer's clock, the same way db.today() dates a
    session, so imported days line up with days timed here."""
    return datetime.fromtimestamp(unix_seconds).date().isoformat()


def _parse_solve(row):
    """A readable solve as a dict, or None. A row is unreadable if it isn't shaped like a
    CSTimer solve, has a penalty code CSTimer doesn't use, or a time that can't be real (more
    than 2 hours, or no time at all for a finished solve)."""
    if not (isinstance(row, list) and row and isinstance(row[0], list) and len(row[0]) >= 2):
        return None
    code, time_ms = row[0][0], row[0][1]
    if not (_is_number(code) and _is_number(time_ms)) or code not in PENALTY_CODES:
        return None
    penalty = PENALTY_CODES[code]
    if time_ms < 0 or time_ms > MAX_SOLVE_SECONDS * 1000 or (time_ms == 0 and penalty != 'DNF'):
        return None
    timestamp = row[3] if len(row) > 3 else None
    if not _is_number(timestamp) or not EARLIEST_TIMESTAMP <= timestamp <= time.time() + 86400:
        timestamp = None
    return {
        'time_ms': round_half_up(time_ms),
        'penalty': penalty,
        'dnf': penalty == 'DNF',
        'scramble': row[1] if len(row) > 1 and isinstance(row[1], str) else '',
        'notes': row[2].strip() if len(row) > 2 and isinstance(row[2], str) else '',
        'unix': timestamp,
    }


def _readable_solves(rows):
    """(solves, number of unreadable rows) for one CSTimer session. A solve without a usable
    timestamp takes the one before it (or the import time, if it's the first), so it still
    lands on a sensible day and in the right order."""
    solves, unreadable = [], 0
    previous = None
    for row in rows:
        solve = _parse_solve(row)
        if solve is None:
            unreadable += 1
            continue
        if solve['unix'] is None:
            solve['unix'] = previous if previous is not None else time.time()
        previous = solve['unix']
        solve['timestamp'] = iso_time(solve['unix'])
        solves.append(solve)
    return solves, unreadable


def session_names(data):
    """CSTimer's name for each session key, from properties.sessionData."""
    properties = data.get('properties')
    session_data = properties.get('sessionData') if isinstance(properties, dict) else None
    if isinstance(session_data, str):
        try:
            session_data = json.loads(session_data)
        except ValueError:
            session_data = None
    if not isinstance(session_data, dict):
        return {}
    names = {}
    for number, info in session_data.items():
        name = info.get('name') if isinstance(info, dict) else None
        if name is not None and str(name).strip():
            names[f'session{number}'] = str(name).strip()
    return names


def _sessions(data):
    """(key, name, rows) for every session in the export, in the file's order."""
    names = session_names(data)
    for key, rows in data.items():
        if key != 'properties' and isinstance(rows, list):
            number = key[len('session'):] if key.startswith('session') else ''
            yield key, names.get(key) or (f'Session {number}' if number.isdigit() else key), rows


def already_imported(conn, solves):
    """Which of these solves are already in the app (in any event): a solve with the same
    timestamp and time, to the millisecond, is the same solve imported before."""
    if not solves:
        return set()
    stamps = [s['timestamp'] for s in solves]
    rows = conn.execute('SELECT timestamp, time_ms FROM solves WHERE timestamp BETWEEN ? AND ?',
                        (min(stamps), max(stamps)))
    existing = {(row['timestamp'], row['time_ms']) for row in rows}
    return {i for i, s in enumerate(solves) if (s['timestamp'], s['time_ms']) in existing}


def preview(data, conn=None):
    """A summary of each session for the import picker: its name, how many solves can be read
    (and how many can't), the days they span, how many are already in the app, and the best,
    worst, and mean in seconds (+2s included, DNFs left out)."""
    sessions = []
    for key, name, rows in _sessions(data):
        solves, unreadable = _readable_solves(rows)
        results = [wca_single_ms(s['time_ms'] + (2000 if s['penalty'] == '+2' else 0))
                   for s in solves if not s['dnf']]
        days = sorted({local_date(s['unix']) for s in solves})
        sessions.append({
            'key': key,
            'name': name,
            'solve_count': len(solves),
            'unreadable': unreadable,
            'first_date': days[0] if days else None,
            'last_date': days[-1] if days else None,
            'days': len(days),
            'already_imported': len(already_imported(conn, solves)) if conn is not None else 0,
            'best': single_seconds(min(results)) if results else None,
            'worst': single_seconds(max(results)) if results else None,
            'mean': average_seconds(sum(results) / len(results)) if results else None,
        })
    return sessions


def import_sessions(conn, data, selected_keys, event_id='333', split_by_day=True):
    """Import the chosen CSTimer sessions as sessions of `event_id`, keeping each solve's own
    time, penalty, scramble, comment (as its note), and timestamp.

    With split_by_day (the default, since the app keeps a session a day), each CSTimer session
    becomes one session for each day it has solves on, dated that day. Otherwise it stays one
    session, dated by its first solve. Solves already in the app are skipped, so importing the
    same file twice doesn't double anything."""
    selected = set(selected_keys)
    result = Counter(sessions_imported=0, total_solves=0, duplicates_skipped=0,
                     unreadable_skipped=0, sessions_found=0)

    for key, name, rows in _sessions(data):
        if key not in selected:
            continue
        result['sessions_found'] += 1
        solves, unreadable = _readable_solves(rows)
        result['unreadable_skipped'] += unreadable
        duplicates = already_imported(conn, solves)
        result['duplicates_skipped'] += len(duplicates)
        solves = [s for i, s in enumerate(solves) if i not in duplicates]

        groups = {}
        for solve in solves:
            day = local_date(solve['unix']) if split_by_day else local_date(solves[0]['unix'])
            groups.setdefault(day, []).append(solve)

        for day, day_solves in groups.items():
            session_id = db.create_session(conn, event_id, f'Imported from CSTimer: {name}',
                                           date=day)
            db.add_solves_to_new_session(conn, session_id, [
                (s['time_ms'], s['scramble'], s['penalty'], s['dnf'], s['notes'], s['timestamp'])
                for s in day_solves
            ])
            db.recompute_session_stats(conn, session_id)
            result['sessions_imported'] += 1
            result['total_solves'] += len(day_solves)

    return dict(result)
