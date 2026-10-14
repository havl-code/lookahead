"""Writes the phone app's golden files: answers worked out by the Python code, so the phone app's
tests can check that its own code gives exactly the same results.

- pwa/src/lib/golden/stats.json: session stats, and singles and averages the WCA way
- pwa/src/features/backup/golden/*.json: backups, and what the desktop app exports after
  restoring each one

Run it from the project folder after changing speedcube/stats.py, db.recompute_session_stats,
or speedcube/backup.py:
    uv run tools/build_pwa_golden.py
"""

import json
import random
import sqlite3
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from speedcube import backup, db  # noqa: E402
from speedcube.stats import AVERAGE_SIZES, average_seconds, best_average, single_seconds  # noqa: E402

OUTPUT = PROJECT_DIR / 'pwa' / 'src' / 'lib' / 'golden' / 'stats.json'
BACKUP_OUTPUT = PROJECT_DIR / 'pwa' / 'src' / 'features' / 'backup' / 'golden'
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

    files = {OUTPUT: {'sessions': sessions, 'rounding': rounding, 'bestAverages': best}}
    files.update(backup_goldens(rng))
    return {path: json.dumps(contents, indent=1) + '\n' for path, contents in files.items()}


def main():
    for path, text in build().items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')
        print(f'Wrote {path.relative_to(PROJECT_DIR)}')


if __name__ == '__main__':
    main()
