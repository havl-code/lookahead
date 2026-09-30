"""The JSON API the web UI talks to, mounted under /api.

Sessions can hold tens of thousands of solves, so routes never send a whole session to the
browser: long lists come a page at a time, charts use the latest solves or a summary, and
totals are worked out in SQL.
"""

import json
import sqlite3

from flask import Blueprint, Response, current_app, jsonify, request

from . import backup, cstimer, db, wca
from .db import NON_DNF_RESULT_MS, RESULT_MS
from .stats import (
    box_stats,
    filter_distribution_outliers,
    ms_to_seconds,
    population_std_dev,
    rolling_averages,
    round2,
    round_to,
)

api = Blueprint('api', __name__)

# Events the WCA rankings API has single rankings for (used for the Dashboard rank stat).
WCA_RANKED_EVENTS = {
    '222', '333', '444', '555', '666', '777', 'pyram', 'skewb', 'minx', 'sq1', 'clock',
}

# The biggest lists and charts only ever send this many solves, so even a session with tens of
# thousands of solves stays quick to load and draw.
MAX_CHART_SOLVES = 1000
MAX_DISTRIBUTION_SOLVES = 10000

# An event's most recent non-DNF results. CROSS JOIN makes SQLite walk the solves' timestamp
# index newest first and stop once it has enough, instead of sorting every solve for the event
# (1ms rather than 100ms+ with tens of thousands of solves).
LATEST_EVENT_RESULTS_SQL = (
    f'SELECT {RESULT_MS} AS result_ms FROM solves so CROSS JOIN sessions se '
    f'ON se.id = so.session_id WHERE se.event_id = ? AND NOT dnf '
    f'ORDER BY so.timestamp DESC, so.id DESC LIMIT ?'
)


def _json_body():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


def _int_arg(name, default=None, lowest=None, highest=None):
    try:
        value = int(request.args.get(name, ''))
    except ValueError:
        return default
    if lowest is not None:
        value = max(value, lowest)
    if highest is not None:
        value = min(value, highest)
    return value


def _error(message, status):
    return jsonify(error=message), status


def _event_filter(event_id, prefix='WHERE'):
    """SQL filter on sessions (aliased `se`) for one event, or no filter for 'all'."""
    if event_id == 'all':
        return '', ()
    return f'{prefix} se.event_id = ?', (event_id,)


# ---- Dashboard ----

@api.get('/events')
def get_events():
    rows = db.get_db().execute('SELECT DISTINCT event_id FROM sessions ORDER BY event_id')
    return jsonify([row['event_id'] for row in rows])


@api.get('/stats')
def get_stats():
    event_id = request.args.get('event_id') or '333'
    conn = db.get_db()
    where, params = _event_filter(event_id)

    solves = conn.execute(
        f'SELECT COUNT(*) AS total, MIN({NON_DNF_RESULT_MS}) AS best_ms, '
        f'AVG({NON_DNF_RESULT_MS}) AS mean_ms '
        f'FROM solves so JOIN sessions se ON se.id = so.session_id {where}',
        params,
    ).fetchone()
    (total_sessions,) = conn.execute(f'SELECT COUNT(*) FROM sessions se {where}', params).fetchone()
    cubes = conn.execute(
        'SELECT COUNT(*) AS total, COALESCE(SUM(is_active), 0) AS active FROM cubes'
    ).fetchone()

    pb = solves['best_ms'] / 1000 if solves['best_ms'] is not None else None
    average = solves['mean_ms'] / 1000 if solves['mean_ms'] is not None else None

    wca_rank = wca_percentile = None
    if pb and event_id in WCA_RANKED_EVENTS:
        try:
            estimate = wca.estimate_percentile(conn, pb, event_id, 'single')
            wca_rank = estimate.get('rank_estimate') or None
            wca_percentile = estimate.get('percentile')
        except Exception:  # the WCA comparison is best-effort; never fail the whole dashboard
            current_app.logger.exception('WCA rank estimate failed')

    return jsonify(
        pb=round2(pb),
        average=round2(average),
        total_solves=solves['total'],
        total_sessions=total_sessions,
        total_cubes=cubes['total'],
        active_cubes=cubes['active'],
        wca_rank=wca_rank,
        wca_percentile=round2(wca_percentile),
        event_id=event_id,
    )


@api.get('/pb-details')
def get_pb_details():
    event_id = request.args.get('event_id') or '333'
    event_filter, params = _event_filter(event_id, prefix='AND')
    best = db.get_db().execute(
        f'SELECT so.scramble, se.id AS session_id, se.date, se.event_id '
        f'FROM solves so JOIN sessions se ON se.id = so.session_id '
        f'WHERE NOT dnf {event_filter} ORDER BY {RESULT_MS}, so.id LIMIT 1',
        params,
    ).fetchone()

    if best is None:
        return _error('PB solve not found', 404)
    return jsonify(
        session_id=best['session_id'],
        date=best['date'],
        scramble=best['scramble'] or None,
        event_id=best['event_id'],
    )


# ---- Sessions ----

@api.get('/sessions')
def get_sessions():
    rows = db.get_db().execute('SELECT * FROM sessions ORDER BY date DESC, id')
    return jsonify([
        {
            'id': s['id'],
            'date': s['date'],
            'event_id': s['event_id'],
            'solve_count': s['solve_count'] or 0,
            'best_single': ms_to_seconds(s['best_single']),
            'session_mean': ms_to_seconds(s['session_mean']),
            'ao5': ms_to_seconds(s['ao5']),
            'ao12': ms_to_seconds(s['ao12']),
            'notes': s['notes'] or '',
        }
        for s in rows
    ])


@api.post('/sessions/add')
def add_session():
    body = _json_body()
    conn = db.get_db()
    with conn:
        session_id = db.create_session(conn, body.get('event_id') or '333', body.get('notes') or '',
                                       body.get('cube_id'))
    return jsonify(success=True, session_id=session_id)


@api.delete('/sessions/<int:session_id>')
def delete_session(session_id):
    conn = db.get_db()
    with conn:
        db.delete_session(conn, session_id)
    return jsonify(success=True, message='Session deleted')


# ORDER BY clauses for the solves table's sortable columns ({dir} is ASC or DESC). DNFs sort as
# slower than any time, so they come last when sorting fastest first.
SOLVE_SORTS = {
    'number': 'solve_number {dir}',
    'time': 'dnf {dir}, ' + RESULT_MS + ' {dir}, solve_number',
    'penalty': "CASE WHEN dnf THEN 2 WHEN penalty = '+2' THEN 1 ELSE 0 END {dir}, solve_number",
}


def _result_seconds(solve):
    """A solve row's result in seconds (+2 included), or None for a DNF."""
    if solve['dnf']:
        return None
    return round2((solve['time_ms'] + (2000 if solve['penalty'] == '+2' else 0)) / 1000)


@api.get('/sessions/<int:session_id>/solves')
def get_session_solves(session_id):
    """One page of a session's solves, sorted by `sort` (number, time or penalty) and `dir`.
    Sessions can hold tens of thousands of solves, so the table loads them a page at a time."""
    sort = request.args.get('sort') if request.args.get('sort') in SOLVE_SORTS else 'number'
    direction = 'DESC' if request.args.get('dir') == 'desc' else 'ASC'
    offset = _int_arg('offset', default=0, lowest=0)
    limit = _int_arg('limit', default=100, lowest=1, highest=500)

    conn = db.get_db()
    (total,) = conn.execute(
        'SELECT COUNT(*) FROM solves WHERE session_id = ?', (session_id,)
    ).fetchone()
    solves = conn.execute(
        f'SELECT * FROM solves WHERE session_id = ? '
        f'ORDER BY {SOLVE_SORTS[sort].format(dir=direction)}, id LIMIT ? OFFSET ?',
        (session_id, limit, offset),
    ).fetchall()
    return jsonify(total=total, solves=[
        {
            'id': s['id'],
            'solve_number': s['solve_number'],
            'result_seconds': _result_seconds(s),
            'scramble': s['scramble'] or '',
            'penalty': s['penalty'],
            'notes': s['notes'] or '',
            'timestamp': s['timestamp'],
        }
        for s in solves
    ])


@api.post('/sessions/<int:session_id>/solves/add')
def add_solve_to_session(session_id):
    body = _json_body()
    conn = db.get_db()
    with conn:
        db.add_solve(conn, session_id, body.get('time_seconds'), body.get('scramble') or '',
                     body.get('penalty'), body.get('notes') or '')
        db.recompute_session_stats(conn, session_id)
    return jsonify(success=True)


@api.delete('/solves/<int:solve_id>')
def delete_solve(solve_id):
    conn = db.get_db()
    with conn:
        db.delete_solve(conn, solve_id)
    return jsonify(success=True, message='Solve deleted')


# ---- Cubes ----

@api.get('/cubes')
def get_cubes():
    rows = db.get_db().execute('SELECT * FROM cubes ORDER BY cube_type COLLATE NOCASE, id')
    return jsonify([
        {
            'id': c['id'],
            'cube_type': c['cube_type'],
            'brand': c['brand'] or '',
            'model': c['model'] or '',
            'purchase_date': c['purchase_date'],
            'is_active': bool(c['is_active']),
            'notes': c['notes'] or '',
        }
        for c in rows
    ])


@api.post('/cubes/add')
def add_cube():
    body = _json_body()
    if not body.get('cube_type'):
        return _error('Cube type is required', 400)
    conn = db.get_db()
    with conn:
        cube_id = db.add_cube(conn, body['cube_type'], body.get('brand'), body.get('model'),
                              body.get('purchase_date'), body.get('notes'))
    return jsonify(success=True, cube_id=cube_id)


@api.put('/cubes/<int:cube_id>')
def update_cube(cube_id):
    conn = db.get_db()
    with conn:
        updated = db.update_cube(conn, cube_id, _json_body())
    if not updated:
        return _error('Failed to update cube', 400)
    return jsonify(success=True, message='Cube updated')


@api.delete('/cubes/<int:cube_id>')
def delete_cube(cube_id):
    conn = db.get_db()
    with conn:
        db.deactivate_cube(conn, cube_id)
    return jsonify(success=True, message='Cube deactivated')


# ---- Charts ----

@api.get('/charts/progress')
def chart_progress():
    event_id = request.args.get('event_id') or '333'
    sessions = db.get_db().execute(
        'SELECT date, best_single, session_mean, ao5 FROM sessions '
        'WHERE event_id = ? AND solve_count >= 5 ORDER BY date, id LIMIT 500',
        (event_id,),
    ).fetchall()

    if not sessions:
        return _error('Need at least 1 session for this event', 400)
    return jsonify(data=[
        {
            'date': s['date'],
            'best': ms_to_seconds(s['best_single']),
            'mean': ms_to_seconds(s['session_mean']),
            'ao5': ms_to_seconds(s['ao5']),
        }
        for s in sessions
    ])


@api.get('/charts/session-progress')
def chart_session_progress():
    session_id = _int_arg('session_id')
    if not session_id:
        return _error('Missing session_id parameter', 400)

    # The latest non-DNF solves, oldest first
    solves = db.get_db().execute(
        f'SELECT solve_number, {RESULT_MS} AS result_ms FROM solves '
        f'WHERE session_id = ? AND NOT dnf ORDER BY solve_number DESC, id DESC LIMIT ?',
        (session_id, MAX_CHART_SOLVES),
    ).fetchall()[::-1]
    if not solves:
        return _error('No solves in this session', 400)

    times = [s['result_ms'] / 1000 for s in solves]
    data = []
    running_total = 0
    for i, (solve, time) in enumerate(zip(solves, times)):
        running_total += time
        ao5 = None
        if i >= 4:
            ao5 = sum(sorted(times[i - 4:i + 1])[1:4]) / 3
        data.append({
            'solve_number': solve['solve_number'],
            'time': round2(time),
            'mean': round2(running_total / (i + 1)),
            'ao5': round2(ao5),
        })
    return jsonify(data=data)


@api.get('/charts/distribution')
def chart_distribution():
    event_id = request.args.get('event_id') or '333'
    # The most recent solves, which reflect current form better than all-time history
    rows = db.get_db().execute(
        LATEST_EVENT_RESULTS_SQL,
        (event_id, MAX_DISTRIBUTION_SOLVES),
    )
    times = sorted(row['result_ms'] / 1000 for row in rows)

    if len(times) < 5:
        return _error('Need at least 5 solves', 400)
    return jsonify(times=filter_distribution_outliers(times))


@api.get('/charts/session-distribution')
def chart_session_distribution():
    session_id = _int_arg('session_id')
    rows = db.get_db().execute(
        f'SELECT {RESULT_MS} AS result_ms FROM solves WHERE session_id = ? AND NOT dnf '
        f'ORDER BY solve_number DESC, id DESC LIMIT ?',
        (session_id, MAX_DISTRIBUTION_SOLVES),
    )
    times = sorted(row['result_ms'] / 1000 for row in rows)

    if len(times) < 5:
        return _error('Need at least 5 solves', 400)

    mean = sum(times) / len(times)
    std_dev = population_std_dev(times)
    return jsonify(times=[t for t in times if abs(t - mean) <= 5 * std_dev])


@api.get('/charts/rolling-average')
def chart_rolling_average():
    event_id = request.args.get('event_id') or '333'
    rows = db.get_db().execute(
        LATEST_EVENT_RESULTS_SQL,
        (event_id, MAX_CHART_SOLVES),
    )
    times = [row['result_ms'] / 1000 for row in rows][::-1]  # the latest ones, oldest first

    if len(times) < 12:
        return _error('Need at least 12 solves', 400)
    rolling5, rolling12 = rolling_averages(times)
    return jsonify(times=times, rolling5=rolling5, rolling12=rolling12)


@api.get('/charts/session-rolling')
def chart_session_rolling():
    session_id = _int_arg('session_id')
    rows = db.get_db().execute(
        f'SELECT {RESULT_MS} AS result_ms FROM solves WHERE session_id = ? AND NOT dnf '
        f'ORDER BY solve_number DESC, id DESC LIMIT ?',
        (session_id, MAX_CHART_SOLVES),
    )
    times = [row['result_ms'] / 1000 for row in rows][::-1]  # the latest ones, oldest first

    if len(times) < 12:
        return _error('Need at least 12 solves', 400)
    rolling5, rolling12 = rolling_averages(times)
    return jsonify(times=times, rolling5=rolling5, rolling12=rolling12)


@api.get('/charts/consistency')
def chart_consistency():
    event_id = request.args.get('event_id') or '333'
    conn = db.get_db()
    # Only the most recent 10 end up in the response, but a session with solve_count >= 5
    # can still drop out below (if most of those were DNFs) once we recheck against actual
    # non-DNF times, so take a few extra candidates from the tail to cover that.
    candidates = conn.execute(
        'SELECT id, date FROM sessions WHERE event_id = ? AND solve_count >= 5 '
        'ORDER BY date DESC, id DESC LIMIT 15',
        (event_id,),
    ).fetchall()[::-1]

    # Each session is sent as a box plot summary rather than every time, which keeps this small
    # and quick even for sessions with thousands of solves.
    result = []
    for session in candidates:
        times = sorted(row[0] / 1000 for row in conn.execute(
            f'SELECT {RESULT_MS} FROM solves WHERE session_id = ? AND NOT dnf', (session['id'],)
        ))
        if len(times) >= 5:
            result.append(
                {'session_id': session['id'], 'date': session['date'], **box_stats(times)}
            )

    last10 = result[-10:]
    if len(last10) < 2:
        return _error('Need at least 2 sessions', 400)
    return jsonify(sessions=last10)


# ---- Analytics ----

@api.get('/analytics/session-heatmap')
def analytics_heatmap():
    event_id = request.args.get('event_id') or '333'
    conn = db.get_db()
    sessions = conn.execute(
        'SELECT id, date, solve_count, best_single, session_mean, ao5, ao12 FROM sessions '
        'WHERE event_id = ? ORDER BY date DESC, id LIMIT 50',
        (event_id,),
    ).fetchall()

    if not sessions:
        return _error('No sessions available', 404)

    ids = [s['id'] for s in sessions]
    penalty_counts = {
        row['session_id']: (row['dnf_count'], row['plus2_count'])
        for row in conn.execute(
            f"SELECT session_id, SUM(dnf) AS dnf_count, "
            f"COALESCE(SUM(penalty = '+2'), 0) AS plus2_count "
            f"FROM solves WHERE session_id IN ({', '.join('?' * len(ids))}) GROUP BY session_id",
            ids,
        )
    }

    sessions_out = []
    for s in sessions:
        dnf_count, plus2_count = penalty_counts.get(s['id'], (0, 0))
        count = s['solve_count'] or 0
        mean, best = s['session_mean'], s['best_single']

        speed_score = consistency_score = accuracy_score = 0
        if mean and best:
            baseline = 30000
            speed_score = max(0, 100 - (mean / baseline) * 50)
            consistency_score = (best / mean) * 100 if mean > 0 else 0
        if count > 0:
            penalty_rate = (dnf_count + plus2_count) / count
            accuracy_score = max(0, 100 - penalty_rate * 100)
        overall_score = (speed_score + consistency_score + accuracy_score) / 3

        sessions_out.append({
            'session_id': s['id'],
            'date': s['date'],
            'solve_count': count,
            'best': round2(best / 1000) if best else None,
            'mean': round2(mean / 1000) if mean else None,
            'ao5': round2(s['ao5'] / 1000) if s['ao5'] else None,
            'ao12': round2(s['ao12'] / 1000) if s['ao12'] else None,
            'dnf_count': dnf_count,
            'plus2_count': plus2_count,
            'speed_score': round_to(speed_score, 1),
            'consistency_score': round_to(consistency_score, 1),
            'accuracy_score': round_to(accuracy_score, 1),
            'overall_score': round_to(overall_score, 1),
        })

    return jsonify(sessions=sessions_out, event_id=event_id)


# ---- CSTimer import ----
# Stateless: the browser uploads the file once to preview it, then again with the chosen
# session keys to import them, so nothing is held on the server in between.

@api.post('/import/preview')
def import_preview():
    file = request.files.get('file')
    if file is None:
        return _error('No file provided', 400)
    try:
        data = cstimer.load(file.read())
    except ValueError:
        return _error('An error occurred processing the import file', 400)
    return jsonify(sessions=cstimer.preview(data), filename=file.filename)


@api.post('/import/selected')
def import_selected():
    file = request.files.get('file')
    try:
        selected = json.loads(request.form.get('sessions') or '[]')
    except ValueError:
        selected = []
    event_id = request.form.get('event_id') or '333'

    if file is None or not isinstance(selected, list) or not selected:
        return _error('Missing file or sessions', 400)
    try:
        data = cstimer.load(file.read())
    except ValueError:
        return _error('An error occurred during import', 400)

    conn = db.get_db()
    with conn:
        results = cstimer.import_sessions(conn, data, [str(key) for key in selected], event_id)
    return jsonify(
        success=True, message=f"Imported {results['total_solves']} solves", details=results
    )


# ---- Timer ----

@api.post('/timer/session')
def timer_create_session():
    conn = db.get_db()
    with conn:
        event_id = _json_body().get('event_id') or '333'
        session_id = db.create_session(conn, event_id, 'Live timer session')
    return jsonify(success=True, session_id=session_id)


@api.post('/timer/solve')
def timer_save_solve():
    body = _json_body()
    session_id, time = body.get('session_id'), body.get('time')
    if not session_id or time is None:
        return _error('Missing required fields', 400)

    penalty = body.get('penalty')
    # timer.js already adds 2s to `time` for a '+2' (for its own optimistic display), and
    # recompute_session_stats adds +2000ms again for any '+2' solve. Storing the
    # *raw* attempt time here keeps the penalty applied exactly once everywhere.
    raw_time = float(time) - 2 if penalty == '+2' else float(time)
    # The timer sends an explicit dnf flag (it may differ from a penalty-derived guess).
    dnf = body['dnf'] if isinstance(body.get('dnf'), bool) else None

    conn = db.get_db()
    with conn:
        solve_id = db.add_solve(conn, session_id, raw_time, body.get('scramble') or '', penalty,
                                dnf=dnf)
        db.recompute_session_stats(conn, session_id)
    return jsonify(success=True, solve_id=solve_id)


@api.delete('/timer/solve/<int:solve_id>')
def timer_delete_solve(solve_id):
    conn = db.get_db()
    with conn:
        deleted = db.delete_solve(conn, solve_id)
    if not deleted:
        return _error('Solve not found', 404)
    return jsonify(success=True)


@api.put('/timer/solve/<int:solve_id>/penalty')
def timer_update_penalty(solve_id):
    conn = db.get_db()
    with conn:
        updated = db.set_solve_penalty(conn, solve_id, _json_body().get('penalty') or 'OK')
    if not updated:
        return _error('Solve not found', 404)
    return jsonify(success=True)


@api.get('/timer/session/<int:session_id>/solves')
def timer_session_solves(session_id):
    """The session's latest `limit` solves (newest first) plus its stats. The timer only lists
    recent solves, so a huge session doesn't have to be sent (or drawn) in full."""
    limit = _int_arg('limit', default=50, lowest=1, highest=500)
    conn = db.get_db()
    rows = conn.execute(
        'SELECT * FROM solves WHERE session_id = ? ORDER BY solve_number DESC, id DESC LIMIT ?',
        (session_id, limit),
    ).fetchall()
    session = conn.execute(
        'SELECT solve_count, best_single, worst_single, session_mean, ao5 FROM sessions '
        'WHERE id = ?',
        (session_id,),
    ).fetchone()

    solves = []
    for s in rows:
        penalty = s['penalty'] or 'OK'
        dnf = bool(s['dnf'])
        time = s['time_ms'] / 1000
        if penalty == '+2' and not dnf:
            time += 2
        solves.append({
            'id': s['id'], 'solve_number': s['solve_number'], 'time': time, 'penalty': penalty,
            'dnf': dnf, 'scramble': s['scramble'] or '',
        })
    stats = {
        'solve_count': session['solve_count'] if session else 0,
        'best': ms_to_seconds(session['best_single']) if session else None,
        'worst': ms_to_seconds(session['worst_single']) if session else None,
        'mean': ms_to_seconds(session['session_mean']) if session else None,
        'ao5': ms_to_seconds(session['ao5']) if session else None,
    }
    return jsonify(solves=solves, stats=stats)


# ---- User settings ----

@api.get('/user/settings')
def get_user_settings():
    row = db.get_db().execute("SELECT wca_id, wca_name FROM settings WHERE id = 'user'").fetchone()
    return jsonify(
        wca_id=row['wca_id'] if row and row['wca_id'] else None,
        wca_name=row['wca_name'] if row and row['wca_name'] else None,
    )


@api.post('/user/settings')
def update_user_settings():
    wca_id = str(_json_body().get('wca_id') or '').strip()
    if not wca_id:
        return _error('WCA ID is required', 400)

    try:
        wca_name = wca.lookup_person(wca_id)
    except wca.WCALookupError as e:
        return _error(str(e), e.status)

    conn = db.get_db()
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (id, wca_id, wca_name) VALUES ('user', ?, ?)",
            (wca_id, wca_name),
        )
    return jsonify(success=True, wca_id=wca_id, wca_name=wca_name)


@api.delete('/user/settings')
def delete_user_settings():
    conn = db.get_db()
    with conn:
        conn.execute("DELETE FROM settings WHERE id = 'user'")
    return jsonify(success=True)


# ---- Backup ----

@api.get('/backup/export')
def export_backup():
    payload = backup.export_backup(db.get_db())
    filename = f'speedcube-backup-{db.today()}.json'
    return Response(
        json.dumps(payload, indent=2),
        mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


@api.post('/backup/import')
def import_backup():
    file = request.files.get('file')
    if file is None:
        return _error('No file provided', 400)

    conn = db.get_db()
    try:
        payload = json.loads(file.read().decode('utf-8-sig'))
        with conn:
            backup.restore_backup(conn, payload)
    except backup.InvalidBackup as e:
        return _error(str(e), 400)
    except (ValueError, sqlite3.IntegrityError):
        return _error('This file does not look like a valid backup.', 400)
    return jsonify(success=True)
