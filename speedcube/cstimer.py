"""CSTimer import.

A CSTimer export is a JSON object mapping session keys to lists of solves (other keys, such
as "properties", hold settings and are skipped):

    {"session1": [[[penalty, time_ms], "scramble", "comment", timestamp], ...], ...}

where penalty is 0 for OK, 2000 for +2 and -1 for DNF.
"""

import json

from . import db
from .stats import round_half_up


def load(raw):
    """Parse an uploaded export file's bytes. Raises ValueError if it isn't a JSON object."""
    data = json.loads(raw.decode('utf-8-sig'))
    if not isinstance(data, dict):
        raise ValueError('Not a CSTimer export')
    return data


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _parse_result(solve):
    """(penalty_code, time_ms) for one solve entry, or None if the entry is malformed."""
    if isinstance(solve, list) and solve and isinstance(solve[0], list) and len(solve[0]) >= 2:
        penalty_code, time_ms = solve[0][0], solve[0][1]
        if _is_number(penalty_code) and _is_number(time_ms):
            return penalty_code, time_ms
    return None


def preview(data):
    """Per-session summaries (solve count, best/worst/mean in seconds, +2s included) for the
    import picker."""
    sessions = []
    for key, solves in data.items():
        if not isinstance(solves, list):
            continue
        results = [r for r in map(_parse_result, solves) if r is not None]
        times = [(time_ms + 2000 if penalty_code == 2000 else time_ms) / 1000
                 for penalty_code, time_ms in results if penalty_code != -1]
        sessions.append({
            'key': key,
            'solve_count': len(solves),
            'best': min(times) if times else None,
            'worst': max(times) if times else None,
            'mean': sum(times) / len(times) if times else None,
        })
    return sessions


def import_sessions(conn, data, selected_keys, event_id='333'):
    """Import the chosen CSTimer sessions, each as a new session of `event_id`."""
    selected = set(selected_keys)
    sessions_imported = total_solves = 0

    for key, solves in data.items():
        if key not in selected or not isinstance(solves, list):
            continue

        records = []
        for solve in solves:
            result = _parse_result(solve)
            if result is None:
                continue
            penalty_code, time_ms = result
            scramble = solve[1] if len(solve) > 1 else ''
            if penalty_code == -1:
                records.append((0, scramble, 'DNF', True))
            elif penalty_code == 2000:
                records.append((round_half_up(time_ms), scramble, '+2', False))
            else:
                records.append((round_half_up(time_ms), scramble, None, False))

        if not records:
            continue

        notes = f'Imported from CSTimer ({key}) on {db.today()}'
        session_id = db.create_session(conn, event_id, notes)
        db.add_solves_to_new_session(conn, session_id, records)
        db.recompute_session_stats(conn, session_id)

        sessions_imported += 1
        total_solves += len(records)

    return {'sessions_imported': sessions_imported, 'total_solves': total_solves}
