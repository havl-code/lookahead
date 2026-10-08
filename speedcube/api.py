"""The JSON API the web UI talks to, mounted under /api.

Sessions can hold tens of thousands of solves, so routes never send a whole session to the
browser: long lists come a page at a time, charts use the latest solves or a summary, and
totals are worked out in SQL.
"""

import json
import sqlite3
from collections import defaultdict

from flask import Blueprint, Response, current_app, jsonify, request

from . import backup, cstimer, db, scores, stats, validation, wca
from .db import NON_DNF_RESULT_MS, NON_DNF_WCA_RESULT_MS, RESULT_MS
from .validation import MAX_CUBE_TEXT, MAX_NOTES, MAX_SCRAMBLE, ValidationError
from .stats import (
    average_seconds,
    box_stats,
    filter_distribution_outliers,
    population_std_dev,
    AVERAGE_SIZES,
    best_average,
    dropped_in_window,
    rolling_wca_averages,
    round2,
    round_to,
    single_seconds,
)

api = Blueprint('api', __name__)

# Events the WCA rankings API has timed single rankings for (used for the Dashboard rank
# stat). Multi-Blind is ranked by points and Fewest Moves by moves, so neither is here.
WCA_RANKED_EVENTS = {
    '222', '333', '444', '555', '666', '777', '333oh', '333bf', '444bf', '555bf',
    'pyram', 'skewb', 'minx', 'sq1', 'clock',
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
# The same, but every solve, with NULL for a DNF, for the averages that count DNFs
LATEST_EVENT_ALL_RESULTS_SQL = (
    f'SELECT {NON_DNF_RESULT_MS} AS result_ms FROM solves so CROSS JOIN sessions se '
    f'ON se.id = so.session_id WHERE se.event_id = ? '
    f'ORDER BY so.timestamp DESC, so.id DESC LIMIT ?'
)


def _rolling_chart(results_ms):
    """The rolling chart's data: each result in seconds (None for a DNF) with the WCA-style
    rolling Ao5 and Ao12 through it."""
    if len(results_ms) < 12:
        return _error('Need at least 12 solves', 400)
    return jsonify(times=[single_seconds(r) for r in results_ms],
                   rolling5=[average_seconds(a) for a in rolling_wca_averages(results_ms, 5)],
                   rolling12=[average_seconds(a) for a in rolling_wca_averages(results_ms, 12)])


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


@api.errorhandler(ValidationError)
def _invalid(e):
    """Anything validation.py turns down is answered with its message (a 400, or 404)."""
    return _error(str(e), e.status)


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
        f'AVG({NON_DNF_WCA_RESULT_MS}) AS mean_ms '
        f'FROM solves so JOIN sessions se ON se.id = so.session_id {where}',
        params,
    ).fetchone()
    (total_sessions,) = conn.execute(f'SELECT COUNT(*) FROM sessions se {where}', params).fetchone()
    cubes = conn.execute(
        'SELECT COUNT(*) AS total, COALESCE(SUM(is_active), 0) AS active FROM cubes'
    ).fetchone()

    # As the WCA records them (Regulations 9f1 and 9f2), which is also how they're ranked. An
    # average across different events would mean nothing, so 'all' has none.
    pb = single_seconds(solves['best_ms'])
    average = average_seconds(solves['mean_ms']) if event_id != 'all' else None

    estimate = None
    if pb and event_id in WCA_RANKED_EVENTS:
        try:
            estimate = wca.estimate_rank(conn, pb, event_id, 'single')
        except Exception:  # the WCA comparison is best-effort; never fail the whole dashboard
            current_app.logger.exception('WCA rank estimate failed')
    estimate = estimate or {}

    return jsonify(
        pb=pb,
        average=average,
        best_averages=_best_averages(conn, event_id),
        total_solves=solves['total'],
        total_sessions=total_sessions,
        total_cubes=cubes['total'],
        active_cubes=cubes['active'],
        wca_rank=estimate.get('rank'),
        wca_percentile=round2(estimate.get('percentile')),
        wca_outside_top=estimate.get('outside_top'),
        event_id=event_id,
    )


def _best_average_session(conn, event_id, size):
    """The event's session with the best average of `size`, or None."""
    return conn.execute(
        f'SELECT id, date, best_ao{size} AS value FROM sessions WHERE event_id = ? '
        f'AND best_ao{size} IS NOT NULL ORDER BY best_ao{size}, date, id LIMIT 1',
        (event_id,),
    ).fetchone()


def _best_averages(conn, event_id):
    """The event's best Ao5, Ao12, Ao50, and Ao100, each with the session it's from. Each
    session keeps its own bests (see db.recompute_session_stats), so this is a quick lookup
    even with tens of thousands of solves. Averages across different events mean nothing, so
    'all' has none."""
    if event_id == 'all':
        return None
    bests = {}
    for size in AVERAGE_SIZES:
        row = _best_average_session(conn, event_id, size)
        bests[f'ao{size}'] = (
            {'value': average_seconds(row['value']), 'session_id': row['id'], 'date': row['date']}
            if row else None)
    return bests


@api.get('/pb-details')
def get_pb_details():
    """Where a PB came from. kind is 'single' (the default), or 'ao5', 'ao12', 'ao50', or
    'ao100' for a best average, which also lists its solves, with the dropped ones marked."""
    event_id = request.args.get('event_id') or '333'
    kind = request.args.get('kind') or 'single'
    if kind != 'single':
        return _average_details(event_id, kind)
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


def _average_details(event_id, kind):
    sizes = {f'ao{size}': size for size in AVERAGE_SIZES}
    if kind not in sizes:
        return _error('Unknown kind of PB', 400)
    if event_id == 'all':
        return _error('Choose an event to see its best averages', 400)
    size = sizes[kind]
    conn = db.get_db()
    session = _best_average_session(conn, event_id, size)
    if session is None:
        return _error('PB average not found', 404)
    rows = conn.execute(
        f'SELECT solve_number, {NON_DNF_RESULT_MS} AS result_ms, scramble FROM solves '
        f'WHERE session_id = ? ORDER BY solve_number, id', (session['id'],)).fetchall()
    average, end = best_average([row['result_ms'] for row in rows], size)
    window = rows[end - size + 1:end + 1]
    dropped = dropped_in_window([row['result_ms'] for row in window], size)
    return jsonify(
        kind=kind,
        event_id=event_id,
        value=average_seconds(average),
        session_id=session['id'],
        date=session['date'],
        solves=[{'solve_number': row['solve_number'], 'result': single_seconds(row['result_ms']),
                 'counted': i not in dropped}
                for i, row in enumerate(window)],
    )


# ---- Sessions ----

def _session_cube(row):
    """The cube a session row (joined to its cube) was done with, or None."""
    if row['cube_id'] is None or row['cube_type'] is None:
        return None
    return {'id': row['cube_id'], 'cube_type': row['cube_type'], 'brand': row['brand'] or '',
            'model': row['model'] or '', 'is_active': bool(row['cube_active'])}


@api.get('/sessions')
def get_sessions():
    rows = db.get_db().execute(
        'SELECT se.*, cu.cube_type, cu.brand, cu.model, cu.is_active AS cube_active '
        'FROM sessions se LEFT JOIN cubes cu ON cu.id = se.cube_id '
        'ORDER BY se.date DESC, se.id DESC'
    )
    return jsonify([
        {
            'id': s['id'],
            'date': s['date'],
            'event_id': s['event_id'],
            'cube_id': s['cube_id'],
            'cube': _session_cube(s),
            'solve_count': s['solve_count'] or 0,
            'best_single': single_seconds(s['best_single']),
            'session_mean': average_seconds(s['session_mean']),
            'ao5': average_seconds(s['ao5']),
            'ao12': average_seconds(s['ao12']),
            'notes': s['notes'] or '',
        }
        for s in rows
    ])


def _cube_or_none(conn, value):
    """A cube id from the page, checked to exist, or None for no cube."""
    cube_id = validation.record_id(value, 'Cube')
    return validation.require(conn, 'cubes', cube_id, 'Cube') if cube_id is not None else None


@api.post('/sessions/add')
def add_session():
    body = _json_body()
    conn = db.get_db()
    event_id = validation.event(body.get('event_id'))
    notes = validation.text(body.get('notes'), 'Notes', MAX_NOTES)
    cube_id = _cube_or_none(conn, body.get('cube_id'))
    # Today unless another day is given (a session added by hand can be for an earlier day)
    date = validation.iso_date(body.get('date'), 'Date', today=db.today())
    with conn:
        session_id = db.create_session(conn, event_id, notes, cube_id, date=date)
    return jsonify(success=True, session_id=session_id)


@api.put('/sessions/<int:session_id>')
def update_session(session_id):
    """Change a session's date, cube, or notes: whichever of them are sent. A cube that has
    since been deactivated can stay, since the session was done with it."""
    body = _json_body()
    conn = db.get_db()
    validation.require(conn, 'sessions', session_id, 'Session')
    fields = {}
    if 'date' in body:
        fields['date'] = validation.iso_date(body['date'], 'Date', today=db.today(), required=True)
    if 'cube_id' in body:
        fields['cube_id'] = _cube_or_none(conn, body['cube_id'])
    if 'notes' in body:
        fields['notes'] = validation.text(body['notes'], 'Notes', MAX_NOTES)
    if not fields:
        return _error('Nothing to update', 400)
    with conn:
        db.update_session(conn, session_id, fields)
    return jsonify(success=True, message='Session updated')


@api.delete('/sessions/<int:session_id>')
def delete_session(session_id):
    conn = db.get_db()
    validation.require(conn, 'sessions', session_id, 'Session')
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
    return single_seconds(solve['time_ms'] + (2000 if solve['penalty'] == '+2' else 0))


@api.get('/sessions/<int:session_id>/solves')
def get_session_solves(session_id):
    """One page of a session's solves, sorted by `sort` (number, time or penalty) and `dir`.
    Sessions can hold tens of thousands of solves, so the table loads them a page at a time."""
    sort = request.args.get('sort') if request.args.get('sort') in SOLVE_SORTS else 'number'
    direction = 'DESC' if request.args.get('dir') == 'desc' else 'ASC'
    offset = _int_arg('offset', default=0, lowest=0)
    limit = _int_arg('limit', default=100, lowest=1, highest=500)

    conn = db.get_db()
    validation.require(conn, 'sessions', session_id, 'Session')
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
    """A solve typed in by hand: its time (before any +2) and penalty."""
    body = _json_body()
    conn = db.get_db()
    validation.require(conn, 'sessions', session_id, 'Session')
    penalty = validation.penalty(body.get('penalty'))
    time_seconds = validation.solve_time(body.get('time_seconds'), allow_zero=penalty == 'DNF')
    scramble = validation.text(body.get('scramble'), 'Scramble', MAX_SCRAMBLE)
    notes = validation.text(body.get('notes'), 'Notes', MAX_NOTES)
    with conn:
        db.add_solve(conn, session_id, time_seconds, scramble, penalty, notes)
        db.recompute_session_stats(conn, session_id, appended=True)
    return jsonify(success=True)


@api.delete('/solves/<int:solve_id>')
def delete_solve(solve_id):
    conn = db.get_db()
    with conn:
        deleted = db.delete_solve(conn, solve_id)
    if not deleted:
        return _error('Solve not found', 404)
    return jsonify(success=True, message='Solve deleted')


# ---- Cubes ----

def _cube_usage(conn):
    """For each cube, how it's been used: its sessions and solves in total, and its PB single and
    best Ao5 in its main event (the one it has the most sessions in), so a 3x3x3 that's also used
    for One-Handed doesn't mix the two. It reads only the sessions' stored stats, so it's quick."""
    by_cube = defaultdict(list)
    for row in conn.execute(
        'SELECT cube_id, event_id, COUNT(*) AS sessions, SUM(solve_count) AS solves, '
        'MIN(best_single) AS best_single, MIN(best_ao5) AS best_ao5 FROM sessions '
        'WHERE cube_id IS NOT NULL GROUP BY cube_id, event_id'
    ):
        by_cube[row['cube_id']].append(row)

    usage = {}
    for cube_id, events in by_cube.items():
        main = max(events, key=lambda e: (e['sessions'], e['solves'] or 0, e['event_id']))
        usage[cube_id] = {
            'sessions': sum(e['sessions'] for e in events),
            'solves': sum(e['solves'] or 0 for e in events),
            'main_event': main['event_id'],
            'pb_single': single_seconds(main['best_single']),
            'best_ao5': average_seconds(main['best_ao5']),
        }
    return usage


NO_USAGE = {'sessions': 0, 'solves': 0, 'main_event': None, 'pb_single': None, 'best_ao5': None}


@api.get('/cubes')
def get_cubes():
    conn = db.get_db()
    rows = conn.execute('SELECT * FROM cubes ORDER BY cube_type COLLATE NOCASE, id')
    usage = _cube_usage(conn)
    return jsonify([
        {
            'id': c['id'],
            'cube_type': c['cube_type'],
            'brand': c['brand'] or '',
            'model': c['model'] or '',
            'purchase_date': c['purchase_date'],
            'is_active': bool(c['is_active']),
            'notes': c['notes'] or '',
            'stats': usage.get(c['id'], NO_USAGE),
        }
        for c in rows
    ])


def _active_flag(value):
    if value in (True, False, 0, 1):
        return bool(value)
    raise ValidationError('Active must be true or false.')


# How each cube field is checked; fields that aren't a cube's are ignored
CUBE_FIELD_CHECKS = {
    'cube_type': lambda v: validation.text(v, 'Cube type', MAX_CUBE_TEXT, required=True),
    'brand': lambda v: validation.text(v, 'Brand', MAX_CUBE_TEXT),
    'model': lambda v: validation.text(v, 'Model', MAX_CUBE_TEXT),
    'purchase_date': lambda v: validation.iso_date(v, 'Purchase date'),
    'notes': lambda v: validation.text(v, 'Notes', MAX_NOTES),
    'is_active': _active_flag,
}


def _cube_fields(body):
    """The cube fields present in `body`, each checked."""
    return {key: check(body[key]) for key, check in CUBE_FIELD_CHECKS.items() if key in body}


@api.post('/cubes/add')
def add_cube():
    fields = _cube_fields({'cube_type': None, **_json_body()})
    conn = db.get_db()
    with conn:
        cube_id = db.add_cube(conn, fields['cube_type'], fields.get('brand'), fields.get('model'),
                              fields.get('purchase_date'), fields.get('notes'))
    return jsonify(success=True, cube_id=cube_id)


@api.put('/cubes/<int:cube_id>')
def update_cube(cube_id):
    conn = db.get_db()
    validation.require(conn, 'cubes', cube_id, 'Cube')
    fields = _cube_fields(_json_body())
    if not fields:
        return _error('Nothing to update', 400)
    with conn:
        db.update_cube(conn, cube_id, fields)
    return jsonify(success=True, message='Cube updated')


@api.delete('/cubes/<int:cube_id>')
def delete_cube(cube_id):
    conn = db.get_db()
    validation.require(conn, 'cubes', cube_id, 'Cube')
    with conn:
        db.deactivate_cube(conn, cube_id)
    return jsonify(success=True, message='Cube deactivated')


# ---- Charts ----

@api.get('/charts/progress')
def chart_progress():
    event_id = request.args.get('event_id') or '333'
    # The latest 500 sessions (put back in date order), so a long history shows where you are now
    sessions = db.get_db().execute(
        'SELECT date, best_single, session_mean, ao5 FROM sessions '
        'WHERE event_id = ? AND solve_count >= 5 ORDER BY date DESC, id DESC LIMIT 500',
        (event_id,),
    ).fetchall()[::-1]

    if not sessions:
        return _error('Need at least 1 session for this event', 400)
    return jsonify(data=[
        {
            'date': s['date'],
            'best': single_seconds(s['best_single']),
            'mean': average_seconds(s['session_mean']),
            'ao5': average_seconds(s['ao5']),
        }
        for s in sessions
    ])


@api.get('/charts/session-progress')
def chart_session_progress():
    session_id = _int_arg('session_id')
    if not session_id:
        return _error('Missing session_id parameter', 400)

    # The latest solves, DNFs included (with no time), oldest first. The Ao5 follows the WCA
    # rules, so a DNF counts as the worst result and two DNFs make the average a DNF.
    solves = db.get_db().execute(
        f'SELECT solve_number, {NON_DNF_RESULT_MS} AS result_ms FROM solves '
        f'WHERE session_id = ? ORDER BY solve_number DESC, id DESC LIMIT ?',
        (session_id, MAX_CHART_SOLVES),
    ).fetchall()[::-1]
    if not solves:
        return _error('No solves in this session', 400)

    results = [s['result_ms'] for s in solves]
    ao5s = rolling_wca_averages(results, 5)
    data = []
    total, completed = 0, 0
    for solve, result, ao5 in zip(solves, results, ao5s):
        if result is not None:
            total += stats.wca_single_ms(result)
            completed += 1
        data.append({
            'solve_number': solve['solve_number'],
            'time': single_seconds(result),
            'mean': average_seconds(total / completed) if completed else None,
            'ao5': average_seconds(ao5),
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
        LATEST_EVENT_ALL_RESULTS_SQL,
        (event_id, MAX_CHART_SOLVES),
    )
    return _rolling_chart([row['result_ms'] for row in rows][::-1])  # the latest, oldest first


@api.get('/charts/session-rolling')
def chart_session_rolling():
    session_id = _int_arg('session_id')
    rows = db.get_db().execute(
        f'SELECT {NON_DNF_RESULT_MS} AS result_ms FROM solves WHERE session_id = ? '
        f'ORDER BY solve_number DESC, id DESC LIMIT ?',
        (session_id, MAX_CHART_SOLVES),
    )
    return _rolling_chart([row['result_ms'] for row in rows][::-1])  # the latest, oldest first


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
        'WHERE event_id = ? ORDER BY date DESC, id DESC LIMIT 50',
        (event_id,),
    ).fetchall()

    if not sessions:
        return _error('No sessions available', 404)

    # The scores need every result in solve order (None for a DNF). This reads them in one
    # query; they stay on the server, and only the scores go to the browser.
    ids = [s['id'] for s in sessions]
    results = defaultdict(list)
    for row in conn.execute(
        f'SELECT session_id, {NON_DNF_RESULT_MS} AS result_ms FROM solves '
        f'WHERE session_id IN ({", ".join("?" * len(ids))}) ORDER BY session_id, solve_number, id',
        ids,
    ):
        results[row['session_id']].append(row['result_ms'])

    sessions_out = []
    for s in sessions:
        mean, best = s['session_mean'], s['best_single']
        session_scores = scores.session_scores(event_id, results[s['id']])
        spread = session_scores['spread']
        sessions_out.append({
            'session_id': s['id'],
            'date': s['date'],
            'solve_count': s['solve_count'] or 0,
            'best': single_seconds(best),
            'mean': average_seconds(mean),
            'ao5': average_seconds(s['ao5']),
            'ao12': average_seconds(s['ao12']),
            'typical_result': round2(session_scores['typical_result']),
            'spread_percent': round_to(spread * 100, 1) if spread is not None else None,
            **{key: round_to(session_scores[key], 1)
               for key in ('speed_score', 'consistency_score', 'overall_score')},
        })

    reference = scores.reference()
    event_ref = reference['events'].get(event_id, {})
    return jsonify(
        sessions=sessions_out,
        event_id=event_id,
        has_speed_reference='speed' in event_ref,
        has_consistency_reference='consistency' in event_ref,
        result_kind=event_ref.get('result'),
        solves_per_round=event_ref.get('solves_per_round'),
        min_pairs=reference['min_pairs'],
        reference_start=reference['window_start'],
        reference_date=reference['export_date'],
        wca_notice=reference['notice'],
    )


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
    return jsonify(sessions=cstimer.preview(data, db.get_db()), filename=file.filename)


@api.post('/import/selected')
def import_selected():
    file = request.files.get('file')
    try:
        selected = json.loads(request.form.get('sessions') or '[]')
    except ValueError:
        selected = []
    event_id = validation.event(request.form.get('event_id'))

    if file is None or not isinstance(selected, list) or not selected:
        return _error('Missing file or sessions', 400)
    try:
        data = cstimer.load(file.read())
    except ValueError:
        return _error('An error occurred during import', 400)

    # Each CSTimer session is split into one session a day unless the picker says otherwise
    split_by_day = request.form.get('split_by_day', 'true') != 'false'
    conn = db.get_db()
    with conn:
        results = cstimer.import_sessions(conn, data, [str(key) for key in selected], event_id,
                                          split_by_day=split_by_day)
    if not results.pop('sessions_found'):
        return _error('None of the chosen sessions are in this file.', 400)
    return jsonify(success=True, message=_import_message(results), details=results)


def _import_message(results):
    """'Imported 120 solves into 3 sessions', plus anything left out and why."""
    solves, sessions = results['total_solves'], results['sessions_imported']
    message = (f"Imported {solves:,} solve{'s' if solves != 1 else ''} into "
               f"{sessions:,} session{'s' if sessions != 1 else ''}")
    extras = []
    if results['duplicates_skipped']:
        extras.append(f"{results['duplicates_skipped']:,} already in the app")
    if results['unreadable_skipped']:
        extras.append(f"{results['unreadable_skipped']:,} that couldn't be read")
    if extras:
        message += f" (skipped {' and '.join(extras)})"
    return message


# ---- Timer ----

@api.post('/timer/session')
def timer_create_session():
    conn = db.get_db()
    event_id = validation.event(_json_body().get('event_id'))
    with conn:
        session_id = db.start_timer_session(conn, event_id)
    return jsonify(success=True, session_id=session_id)


@api.post('/timer/solve')
def timer_save_solve():
    body = _json_body()
    session_id, time = body.get('session_id'), body.get('time')
    if time is None:
        return _error('Missing required fields', 400)

    penalty = validation.penalty(body.get('penalty'))
    # The timer sends an explicit dnf flag (it may differ from a penalty-derived guess).
    dnf = body['dnf'] if isinstance(body.get('dnf'), bool) else None
    time = validation.solve_time(time, allow_zero=bool(dnf) or penalty == 'DNF')
    # timer.js already adds 2s to `time` for a '+2' (for its own optimistic display), and
    # recompute_session_stats adds +2000ms again for any '+2' solve. Storing the
    # *raw* attempt time here keeps the penalty applied exactly once everywhere.
    raw_time = time - 2 if penalty == '+2' else time
    if penalty == '+2' and raw_time <= 0:
        raise ValidationError('A +2 solve must take more than 2 seconds.')
    scramble = validation.text(body.get('scramble'), 'Scramble', MAX_SCRAMBLE)
    session_id = validation.record_id(session_id, 'Session')

    conn = db.get_db()
    with conn:
        session = conn.execute(
            'SELECT event_id, date FROM sessions WHERE id = ?', (session_id,)
        ).fetchone() if session_id else None
        # The timer follows the calendar: unless a session was picked by hand (follow_today is
        # false), solves go into today's session, and the first solve of a new day starts one.
        if body.get('follow_today') and (session is None or session['date'] != db.today()):
            event_id = session['event_id'] if session else validation.event(body.get('event_id'))
            session_id = db.todays_session(conn, event_id)
        elif session is None:
            return _error('Session not found', 404)
        solve_id = db.add_solve(conn, session_id, raw_time, scramble, penalty, dnf=dnf)
        db.recompute_session_stats(conn, session_id, appended=True)
    return jsonify(success=True, solve_id=solve_id, session_id=session_id)


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
        updated = db.set_solve_penalty(conn, solve_id, validation.penalty(_json_body().get('penalty')))
    if not updated:
        return _error('Solve not found', 404)
    return jsonify(success=True)


@api.get('/timer/session/<int:session_id>/solves')
def timer_session_solves(session_id):
    """The session's latest `limit` solves (newest first) plus its stats. The timer only lists
    recent solves, so a huge session doesn't have to be sent (or drawn) in full."""
    limit = _int_arg('limit', default=50, lowest=1, highest=500)
    conn = db.get_db()
    validation.require(conn, 'sessions', session_id, 'Session')
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
        time = single_seconds(s['time_ms'] + (2000 if penalty == '+2' and not dnf else 0))
        solves.append({
            'id': s['id'], 'solve_number': s['solve_number'], 'time': time, 'penalty': penalty,
            'dnf': dnf, 'scramble': s['scramble'] or '',
        })
    stats = {
        'solve_count': session['solve_count'] if session else 0,
        'best': single_seconds(session['best_single']) if session else None,
        'worst': single_seconds(session['worst_single']) if session else None,
        'mean': average_seconds(session['session_mean']) if session else None,
        'ao5': average_seconds(session['ao5']) if session else None,
    }
    return jsonify(solves=solves, stats=stats)


# ---- Timer settings ----
# Kept in the database rather than the browser, so they survive reloads, a change of browser,
# and backups. They're stored as JSON in the settings table's 'timer' row.

TIMER_SETTINGS = {
    'inspectionEnabled': True,  # WCA inspection before each solve
    'inspectionCalls': 'off',   # a sound at 8 and 12 seconds: 'off', 'beep', or 'voice'
    'hideTimer': False,         # show "solve" instead of the running time
    'hideStats': False,         # hide the session stats under the timer
}
INSPECTION_CALLS = ('off', 'beep', 'voice')


def _stored_timer_settings(conn):
    row = conn.execute("SELECT value FROM settings WHERE id = 'timer'").fetchone()
    try:
        stored = json.loads(row['value']) if row and row['value'] else {}
    except ValueError:
        stored = {}
    # Only known settings, so an old or damaged row can't break the timer
    return {**TIMER_SETTINGS, **{k: v for k, v in stored.items() if k in TIMER_SETTINGS}}


@api.get('/settings/timer')
def get_timer_settings():
    return jsonify(_stored_timer_settings(db.get_db()))


@api.put('/settings/timer')
def update_timer_settings():
    changes = _json_body()
    for key, value in changes.items():
        if key not in TIMER_SETTINGS:
            raise ValidationError(f'{key} is not a timer setting.')
        if key == 'inspectionCalls':
            if value not in INSPECTION_CALLS:
                raise ValidationError('The inspection sound must be off, beep, or voice.')
        elif not isinstance(value, bool):
            raise ValidationError(f'{key} must be true or false.')
    conn = db.get_db()
    settings = {**_stored_timer_settings(conn), **changes}
    with conn:
        conn.execute("INSERT OR REPLACE INTO settings (id, value) VALUES ('timer', ?)",
                     (json.dumps(settings),))
    return jsonify(settings)


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
    # Checked (and put in capitals) before looking it up, so a typo never reaches the internet
    wca_id = validation.wca_id(_json_body().get('wca_id'))

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
    safety_copy = []

    def keep_a_copy():
        # Everything is about to be replaced, so keep what's there now (see db.keep_safety_copy)
        safety_copy.append(db.keep_safety_copy(conn, current_app.config['DATABASE'], 'restore'))

    try:
        payload = json.loads(file.read().decode('utf-8-sig'))
        with conn:
            left_out = backup.restore_backup(conn, payload, before_replacing=keep_a_copy)
    except backup.InvalidBackup as e:
        return _error(str(e), 400)
    except (ValueError, sqlite3.IntegrityError):
        return _error('This file does not look like a valid backup.', 400)
    return jsonify(success=True, solves_left_out=left_out, safety_copy=safety_copy[0].name)
