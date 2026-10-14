"""Writes the phone app's golden files: answers worked out by the Python code, so the phone app's
tests can check that its own code gives exactly the same results.

- pwa/src/lib/golden/stats.json: session stats, singles and averages the WCA way, and the
  charts' maths
- pwa/src/lib/golden/scores.json: the Analytics scores, against a small made-up WCA reference
  (so the monthly refresh of the real one doesn't change them)
- pwa/src/features/backup/golden/*.json: backups, what the desktop app exports after
  restoring each one, and its CSV export of solves
- pwa/src/features/import/golden/cstimer.json: CSTimer exports, and what the desktop app makes
  of them (dates on UTC's calendar, so the files are the same in every time zone)

Run it from the project folder after changing speedcube/stats.py, db.recompute_session_stats,
speedcube/scores.py, speedcube/backup.py, speedcube/cstimer.py, or the CSV export:
    uv run tools/build_pwa_golden.py
"""

import json
import random
import sqlite3
import sys
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from speedcube import backup, create_app, cstimer, db, scores  # noqa: E402
from speedcube.api import _import_message  # noqa: E402
from speedcube.stats import (  # noqa: E402
    AVERAGE_SIZES, average_seconds, best_average, box_stats, dropped_in_window,
    filter_distribution_outliers, rolling_wca_averages, single_seconds,
)

OUTPUT = PROJECT_DIR / 'pwa' / 'src' / 'lib' / 'golden' / 'stats.json'
SCORES_OUTPUT = OUTPUT.with_name('scores.json')
BACKUP_OUTPUT = PROJECT_DIR / 'pwa' / 'src' / 'features' / 'backup' / 'golden'
CSV_OUTPUT = BACKUP_OUTPUT / 'solves-csv.json'
CSTIMER_OUTPUT = PROJECT_DIR / 'pwa' / 'src' / 'features' / 'import' / 'golden' / 'cstimer.json'
FIXTURES = PROJECT_DIR / 'tests' / 'fixtures'
STAT_COLUMNS = ('solve_count', 'best_single', 'worst_single', 'session_mean', 'ao5', 'ao12',
                *(f'best_ao{size}' for size in AVERAGE_SIZES))


def random_solves(rng, count, dnf_rate=0.05, plus2_rate=0.05, base_ms=12000, spread_ms=4000):
    solves = []
    for _ in range(count):
        roll = rng.random()
        penalty = 'DNF' if roll < dnf_rate else '+2' if roll < dnf_rate + plus2_rate else None
        if penalty is None and rng.random() < 0.1:
            penalty = 'OK'  # older rows store an OK penalty as 'OK' rather than NULL
        solves.append({
            'time_ms': max(1, int(rng.gauss(base_ms, spread_ms))),
            'penalty': penalty,
            'dnf': penalty == 'DNF',
        })
    return solves


def session_cases(rng):
    def fixed(times, penalties=None):
        penalties = penalties or [None] * len(times)
        return [{'time_ms': t, 'penalty': p, 'dnf': p == 'DNF'} for t, p in zip(times, penalties)]

    cases = {
        'empty': [],
        'one solve': fixed([12345]),
        'four solves': fixed([10000, 11000, 12000, 13000]),
        'five solves': fixed([10000, 11000, 12000, 13000, 14000]),
        'five with one DNF': fixed([10000, 11000, 12000, 13000, 14000], [None, 'DNF', None, None, None]),
        'five with two DNFs': fixed([10000, 11000, 12000, 13000, 14000], ['DNF', 'DNF', None, None, None]),
        'all DNFs': fixed([10000, 11000, 12000], ['DNF', 'DNF', 'DNF']),
        'a +2 that becomes the best': fixed([9000, 13000, 12000, 11500, 12500], ['+2', None, None, None, None]),
        'hundredths truncated': fixed([10019, 11999, 12001, 13555, 9999]),
        'over ten minutes': fixed([600999, 612345, 599999, 630500, 605000]),
    }
    for count in (12, 13, 49, 50, 51, 100, 101, 250):
        cases[f'{count} random solves'] = random_solves(rng, count)
    cases['300 solves with many DNFs'] = random_solves(rng, 300, dnf_rate=0.2)
    cases['120 slow solves'] = random_solves(rng, 120, base_ms=90000, spread_ms=30000)
    return cases


def stats_for(solves):
    conn = sqlite3.connect(':memory:')
    conn.row_factory = sqlite3.Row
    conn.executescript(db.SCHEMA)
    session_id = db.create_session(conn, '333')
    conn.executemany(
        'INSERT INTO solves (session_id, solve_number, time_ms, scramble, penalty, dnf) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        [(session_id, n, s['time_ms'], '', s['penalty'], s['dnf']) for n, s in enumerate(solves, 1)],
    )
    db.recompute_session_stats(conn, session_id)
    row = conn.execute('SELECT * FROM sessions WHERE id = ?', (session_id,)).fetchone()
    return {column: row[column] for column in STAT_COLUMNS}


def untidy_backup(rng):
    """A backup with the loose ends restore tidies up: a solve whose session isn't in the file,
    a session whose cube isn't, a 0/1 flag, and a session stored with stats out of date."""
    solves = random_solves(rng, 30)
    return {
        'app': 'lookahead',
        'version': 1,
        'exported_at': '2026-10-14T03:00:00.000Z',
        'cubes': [{'id': 4, 'cube_type': '222', 'brand': 'MoYu', 'model': 'RS2M', 'purchase_date': None,
                   'notes': '', 'is_active': 0, 'created_at': '2026-02-01T00:00:00.000Z'}],
        'sessions': [
            {'id': 3, 'date': '2026-10-13', 'event_id': '333', 'cube_id': 99, 'solve_count': 1,
             'best_single': 1, 'notes': 'Cube went missing', 'created_at': '2026-10-13T05:00:00.000Z'},
            {'id': 8, 'date': '2026-10-14', 'event_id': '222', 'cube_id': 4, 'notes': '',
             'created_at': '2026-10-14T01:00:00.000Z'},
        ],
        'solves': [
            *({'id': 10 + n, 'session_id': 3 if n < 20 else 8, 'solve_number': n + 1 if n < 20 else n - 19,
               'time_ms': s['time_ms'], 'scramble': "R U R' U'", 'penalty': s['penalty'], 'dnf': s['dnf'],
               'notes': '', 'timestamp': f'2026-10-13T05:{n:02d}:00.000Z'} for n, s in enumerate(solves)),
            {'id': 500, 'session_id': 42, 'solve_number': 1, 'time_ms': 9000, 'dnf': False},
        ],
        'settings': [{'id': 'user', 'wca_id': '2009ZEMD01', 'wca_name': 'Feliks Zemdegs', 'value': None},
                     {'id': 'timer', 'wca_id': None, 'wca_name': None, 'value': '{"inspection": true}'}],
    }


def restored_by_desktop(payload):
    conn = sqlite3.connect(':memory:')
    conn.row_factory = sqlite3.Row
    conn.executescript(db.SCHEMA)
    with conn:
        left_out = backup.restore_backup(conn, payload)
    exported = backup.export_backup(conn)
    del exported['exported_at']
    stats = {row['id']: {column: row[column] for column in STAT_COLUMNS}
             for row in conn.execute('SELECT * FROM sessions')}
    return {'leftOut': left_out, 'exported': exported, 'stats': stats}


def backup_goldens(rng):
    payloads = {
        'backup-v2': json.loads((FIXTURES / 'backup_v2.json').read_text(encoding='utf-8')),
        'backup-v3': json.loads((FIXTURES / 'backup_v3.json').read_text(encoding='utf-8')),
        'backup-untidy': untidy_backup(rng),
    }
    return {BACKUP_OUTPUT / f'{name}.json': {'backup': payload, 'desktop': restored_by_desktop(payload)}
            for name, payload in payloads.items()}


def made_up_reference():
    """A small WCA reference in the real one's format: 101 quantiles rather than 1,001, some of
    them level (to test ties), and one event of each kind of round."""
    def quantiles(low, high, ties_at):
        values = [low + (high - low) * (i / 100) ** 1.6 for i in range(101)]
        for i in ties_at:
            values[i + 1] = values[i]
        return [round(v, 3) for v in values]

    def event(result, size, low_cs, high_cs, dnf_share, consistency=True):
        ref = {'result': result, 'solves_per_round': size,
               'speed': {'dnf_share': dnf_share, 'quantiles_cs': quantiles(low_cs, high_cs, (10, 50, 51))}}
        if consistency:
            ref['consistency'] = {'quantiles': quantiles(0.02, 0.4, (30,))}
        return ref

    return {
        'source': 'made up for the golden tests', 'export_date': '2026-10-11', 'window_start': '2024-10-11',
        'min_pairs': 20, 'notice': 'Made up.',
        'events': {
            '333': event('average', 5, 450, 6000, 0.01),
            '666': event('average', 3, 6000, 30000, 0.05),
            '333bf': event('best', 3, 1500, 60000, 0.3),
            '444bf': event('best', 3, 6000, 120000, 0.5, consistency=False),
        },
    }


def scores_golden(rng):
    reference = made_up_reference()
    original = scores.reference
    scores.reference = lambda: reference
    try:
        cases = []
        bases = {'333': 14000, '666': 120000, '333bf': 90000, '444bf': 400000, 'pyram': 5000}
        for event_id, base in bases.items():
            for count, dnf_rate in ((0, 0), (2, 0), (3, 0), (4, 0), (5, 0), (19, 0), (21, 0.05),
                                    (25, 0.3), (60, 0.1), (200, 0.05), (12, 1)):
                solves = random_solves(rng, count, dnf_rate=dnf_rate, base_ms=base, spread_ms=base // 6)
                results = [None if s['dnf'] else s['time_ms'] + (2000 if s['penalty'] == '+2' else 0)
                           for s in solves]
                cases.append({'event': event_id, 'results': results,
                              'scores': scores.session_scores(event_id, results)})
        # The very fastest, slowest, and level with a quantile
        speed = reference['events']['333']['speed']['quantiles_cs']
        for typical_cs in (100, speed[0], speed[10], speed[50], speed[70], speed[-1], 99999):
            cases.append({'event': '333', 'results': [typical_cs * 10] * 5,
                          'scores': scores.session_scores('333', [typical_cs * 10] * 5)})
        return {'reference': reference, 'cases': cases}
    finally:
        scores.reference = original


def rounded_box(times):
    """box_stats, with its mean and standard deviation to 9 places: Python 3.12 and later add up
    floats more precisely than 3.11 (and JavaScript), so the last digit can differ."""
    box = box_stats(times)
    return {**box, 'mean': round(box['mean'], 9), 'sd': round(box['sd'], 9)}


def empty_db():
    conn = sqlite3.connect(':memory:')
    conn.row_factory = sqlite3.Row
    conn.executescript(db.SCHEMA)
    return conn


def desktop_state(conn):
    """What a database holds, as the backup golden files give it."""
    exported = backup.export_backup(conn)
    del exported['exported_at']
    stats = {row['id']: {column: row[column] for column in STAT_COLUMNS}
             for row in conn.execute('SELECT * FROM sessions')}
    return {'exported': exported, 'stats': stats}


def csv_backup():
    """A backup with everything the CSV export has to write carefully: cubes with and without
    names, a session without a date or event, penalties, long results, and text with commas,
    quotes, new lines, and what spreadsheets take for formulas."""
    texts = ['R U F', 'a, b', 'say "hi"', 'two\nlines', 'back\rslash', '=1+2', '+SUM(A1)', '-2', '@cmd',
             '\tR', 'R U\r\nF', '', 'Kia ora, ā ē ī ō ū', "R' U2"]
    cubes = [
        {'id': 1, 'cube_type': '333', 'brand': 'GAN', 'model': '14 MagLev', 'purchase_date': None, 'notes': '',
         'is_active': True, 'created_at': '2026-01-01T00:00:00.000Z'},
        {'id': 2, 'cube_type': '222', 'brand': '', 'model': None, 'purchase_date': None, 'notes': '',
         'is_active': True, 'created_at': '2026-01-01T00:00:00.000Z'},
        {'id': 3, 'cube_type': 'sq1', 'brand': None, 'model': '=Volt', 'purchase_date': None, 'notes': '',
         'is_active': False, 'created_at': '2026-01-01T00:00:00.000Z'},
        {'id': 4, 'cube_type': None, 'brand': 'MoYu', 'model': 'RS3M', 'purchase_date': None, 'notes': '',
         'is_active': True, 'created_at': '2026-01-01T00:00:00.000Z'},
    ]
    sessions = [
        {'id': 1, 'date': '2026-09-02', 'event_id': '333', 'cube_id': 1, 'notes': '', 'created_at': None},
        {'id': 2, 'date': '2026-09-01', 'event_id': '222', 'cube_id': 2, 'notes': '', 'created_at': None},
        {'id': 3, 'date': None, 'event_id': None, 'cube_id': None, 'notes': '', 'created_at': None},
        {'id': 4, 'date': '2026-09-02', 'event_id': '777', 'cube_id': 3, 'notes': '', 'created_at': None},
        {'id': 5, 'date': '2026-09-01', 'event_id': 'sq1', 'cube_id': 4, 'notes': '', 'created_at': None},
        {'id': 6, 'date': '2026-09-03', 'event_id': '333', 'cube_id': None, 'notes': '', 'created_at': None},
    ]
    times = [12345, 11000, 15000, 9999, 10019, 612345, 3210, 599999, 600500, 1, 7200000, 45678, 8000, 13333]
    penalties = [None, '+2', 'DNF', 'OK', None, '+2', None, '+2', None, None, 'DNF', 'OK', '+2', None]
    solves = []
    for n, (time_ms, penalty) in enumerate(zip(times, penalties)):
        session_id = 1 + n % 5
        solves.append({
            'id': 30 - n, 'session_id': session_id, 'solve_number': 3 - n // 5, 'time_ms': time_ms,
            'scramble': texts[n], 'penalty': penalty, 'dnf': penalty == 'DNF', 'notes': texts[-1 - n],
            'timestamp': None if n == 4 else f'2026-09-01T0{n % 10}:00:00.000Z',
        })
    return {'app': 'lookahead', 'version': 1, 'exported_at': '2026-10-14T03:00:00.000Z', 'cubes': cubes,
            'sessions': sessions, 'solves': solves, 'settings': []}


def csv_golden():
    """The desktop app's CSV export of a backup's solves: all of them, and each session's."""
    payload = csv_backup()
    with tempfile.TemporaryDirectory() as folder:
        app = create_app(Path(folder) / 'golden.db', port=8577)
        with closing(db.connect(app.config['DATABASE'])) as conn, conn:
            backup.restore_backup(conn, payload)
        client = app.test_client()

        def export(query=''):
            response = client.get(f'/api/export/solves.csv{query}', base_url='http://127.0.0.1:8577')
            return response.get_data(as_text=True)

        csv = {'all': export()}
        csv.update({str(session['id']): export(f"?session_id={session['id']}") for session in payload['sessions']})
    return {'backup': payload, 'csv': csv}


# The golden CSTimer files are worked out at this moment, on UTC's calendar
CSTIMER_NOW = 1791950400  # 2026-10-14T00:00:00Z


def utc_date(unix_seconds):
    return datetime.fromtimestamp(unix_seconds, timezone.utc).date().isoformat()


def messy_cstimer_export(rng):
    """A CSTimer export with every kind of row the importer has to cope with."""
    start = 1788228000  # 2026-09-01T00:00:00Z
    main, stamp = [], start - 300
    for n in range(60):
        stamp += rng.randint(30, 400) + (60000 if n in (20, 41) else 0)
        code = rng.choice([0, 0, 0, 0, 0, 2000, -1])
        main.append([[code, rng.randint(7000, 19000)], f'R U{n}', rng.choice(['', '  nice one ', 'pop']), stamp])
    main[5][0][1] = 12345.5  # a fraction of a millisecond
    main[7][2] = 7  # a comment that isn't text
    main[9][1] = None  # a scramble that isn't text
    main += [
        'not a solve', [], [[0]], [[3000, 12000], 'R', '', stamp], [['fast', 9000], 'U', '', stamp],
        [[0, -5], 'R', '', stamp], [[0, 7200001], 'R', '', stamp], [[0, 7200000], 'R', '', stamp + 1],
        [[0, 0], 'R', '', stamp], [[-1, 0], 'R', '', stamp + 2], [[True, 1000], 'R', '', stamp],
        [[0, 9000], 'R'], [[0, 9100], 'R', 'old', 100], [[0, 9200], 'R', 'future', CSTIMER_NOW + 2 * 86400],
        [[0, 9300], 'R', '', str(stamp)], [[0, 9400], 'R', '', stamp + 10.5], [[0, 9500], 'R', '', stamp + 10.5],
        [[2000, 9600, 'extra'], 'R', '', stamp + 20, 'more'],
    ]
    # The first solve has no timestamp, so it takes the import's
    two = [[[0, 4000], 'F R'], *([[0, 3000 + n * 37], 'F', '', start + 86400 * 3 + n * 50] for n in range(8))]
    return {
        'session1': main,
        'session2': two,
        'session3': [],
        'session4': 'not a session',
        'session7': [[[0, 51000], 'L', '', start + 3600]],
        'other': [[[-1, 21000], 'B', '', start + 7200], [[0, 22000], 'B', '', start + 7300]],
        'properties': {'sessionData': {
            '1': {'name': ' Main 3x3 ', 'opt': {'scrType': '333'}},
            '2': {'name': '', 'opt': {'scrType': '222so'}},
            '3': 'not details',
            '4': {'name': 'Four', 'opt': 'not options'},
            '7': {'name': 'FTO', 'opt': {'scrType': 'ftoso'}},
        }},
    }


def cstimer_golden(rng):
    """CSTimer exports, the desktop app's preview of each, and what importing them does."""
    exports = {'fixture': json.loads((FIXTURES / 'cstimer_export.json').read_text(encoding='utf-8')),
               'messy': messy_cstimer_export(rng)}
    messy_solve = exports['messy']['session1'][3]
    start = {
        'app': 'lookahead', 'version': 1, 'exported_at': '2026-10-13T00:00:00.000Z', 'cubes': [],
        'sessions': [{'id': 1, 'date': '2026-09-01', 'event_id': '333', 'cube_id': None, 'notes': '',
                      'created_at': '2026-09-01T00:00:00.000Z'}],
        'solves': [{'id': 1, 'session_id': 1, 'solve_number': 1, 'time_ms': messy_solve[0][1], 'scramble': '',
                    'penalty': None, 'dnf': False, 'notes': '', 'timestamp': cstimer.iso_time(messy_solve[3])}],
        'settings': [],
    }
    scenarios = [
        {'name': 'the test fixture, split by day', 'start': None, 'imports': [
            {'export': 'fixture', 'keys': ['session1', 'session2', 'session3'], 'eventId': '333',
             'splitByDay': True, 'events': {'session2': '333oh'}}]},
        {'name': 'a messy export, twice, into a solve already here', 'start': start, 'imports': [
            {'export': 'messy', 'keys': ['session1', 'session2', 'other', 'session3', 'session4'],
             'eventId': 'skewb', 'splitByDay': True, 'events': {'session2': '222'}},
            {'export': 'messy', 'keys': ['session1', 'session2', 'other'], 'eventId': 'skewb',
             'splitByDay': True, 'events': {}}]},
        {'name': 'a messy export, one session each', 'start': None, 'imports': [
            {'export': 'messy', 'keys': ['session1', 'session7', 'nothing'], 'eventId': '444',
             'splitByDay': False, 'events': {}}]},
        {'name': 'sessions that are not in the file', 'start': None, 'imports': [
            {'export': 'fixture', 'keys': ['session9'], 'eventId': '333', 'splitByDay': True, 'events': {}}]},
    ]
    now_iso = cstimer.iso_time(CSTIMER_NOW)
    with (mock.patch.object(cstimer, 'local_date', utc_date),
          mock.patch.object(cstimer.time, 'time', return_value=CSTIMER_NOW),
          mock.patch.object(db, 'now_iso', return_value=now_iso)):
        previews = {name: cstimer.preview(data) for name, data in exports.items()}
        for scenario in scenarios:
            conn = empty_db()
            if scenario['start']:
                with conn:
                    backup.restore_backup(conn, scenario['start'])
                scenario['previews'] = {name: cstimer.preview(data, conn) for name, data in exports.items()}
            for step in scenario['imports']:
                with conn:
                    result = cstimer.import_sessions(conn, exports[step['export']], step['keys'], step['eventId'],
                                                     split_by_day=step['splitByDay'], events=step['events'])
                step['result'] = result
                step['message'] = _import_message({k: v for k, v in result.items() if k != 'sessions_found'})
            scenario.update(desktop_state(conn))
    return {'now': CSTIMER_NOW, 'exports': exports, 'previews': previews, 'scenarios': scenarios}


def build():
    """Every golden file's path and contents. tests/test_pwa_golden.py checks they're up to date."""
    rng = random.Random(20261014)
    sessions = [{'name': name, 'solves': solves, 'stats': stats_for(solves)}
                for name, solves in session_cases(rng).items()]

    results = [None, *rng.sample(range(1, 4000000), 200), 9999, 10000, 59999, 60000, 599994,
               599995, 599999, 600000, 600499, 600500, 3599999, 3600000]
    rounding = [{'ms': ms, 'single': single_seconds(ms), 'average': average_seconds(ms)}
                for ms in results]
    # Averages arrive as fractions of a millisecond too
    rounding += [{'ms': ms, 'single': single_seconds(ms), 'average': average_seconds(ms)}
                 for ms in (12344.5, 12345.5, 13233.333333333334, 599994.9999, 599995.0, 600499.5)]

    best = []
    for size in AVERAGE_SIZES:
        values = [None if s['dnf'] else s['time_ms'] + (2000 if s['penalty'] == '+2' else 0)
                  for s in random_solves(rng, 400, dnf_rate=0.1)]
        average, end = best_average(values, size)
        best.append({'size': size, 'results': values, 'average': average, 'end': end})

    chart_rng = random.Random(20261016)
    charts = []
    for count, dnf_rate in ((4, 0), (12, 0.1), (40, 0.25), (300, 0.05)):
        values = [None if s['dnf'] else s['time_ms'] + (2000 if s['penalty'] == '+2' else 0)
                  for s in random_solves(chart_rng, count, dnf_rate=dnf_rate)]
        times = sorted(v / 1000 for v in values if v is not None)
        # A few far-off times, so the outlier filter has something to do
        spiky = times + [times[0] * 40, times[-1] * 25] if times else []
        charts.append({
            'results': values,
            'rolling5': rolling_wca_averages(values, 5),
            'rolling12': rolling_wca_averages(values, 12),
            'dropped5': sorted(dropped_in_window(values[:5], 5)) if len(values) >= 5 else [],
            'box': rounded_box(times) if times else None,
            'times': spiky,
            'filtered': filter_distribution_outliers(spiky) if spiky else [],
        })
    flat = [12.0] * 30 + [99.0, 98.0, 97.0, 96.0, 95.0]
    charts.append({'results': [], 'rolling5': [], 'rolling12': [], 'dropped5': [], 'box': None,
                   'times': flat, 'filtered': filter_distribution_outliers(flat)})

    files = {OUTPUT: {'sessions': sessions, 'rounding': rounding, 'bestAverages': best, 'charts': charts},
             SCORES_OUTPUT: scores_golden(random.Random(20261015))}
    files.update(backup_goldens(rng))
    files[CSV_OUTPUT] = csv_golden()
    files[CSTIMER_OUTPUT] = cstimer_golden(random.Random(20261017))
    return {path: json.dumps(contents, indent=1) + '\n' for path, contents in files.items()}


def main():
    for path, text in build().items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')
        print(f'Wrote {path.relative_to(PROJECT_DIR)}')


if __name__ == '__main__':
    main()
