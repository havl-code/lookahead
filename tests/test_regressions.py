"""One test per finding from the Phase 1 audit (PLAN.md, "Weaknesses and Suspected Issues").

Each test describes the correct behaviour and starts out marked as an expected failure. The
markers are strict, so a test that starts passing fails the run: the commit that fixes a finding
must remove its marker, which keeps the history honest (red first, then green). Findings about
the page itself are in tests/e2e/test_regressions_ui.py.
"""

import json
import random
import re
from datetime import datetime, timezone

import pytest

from helpers import PROJECT_DIR, query, seed_cube, seed_session, upload

WEB_JS = PROJECT_DIR / 'web' / 'js'
EVIL = 'https://evil.example'


def finding(number, reason):
    return pytest.mark.xfail(strict=True, reason=f'finding {number}: {reason}')


def local_date(unix_seconds):
    return datetime.fromtimestamp(unix_seconds).date().isoformat()


def iso_utc(unix_seconds):
    return (datetime.fromtimestamp(unix_seconds, timezone.utc)
            .isoformat(timespec='milliseconds').replace('+00:00', 'Z'))


# ---- 1 and 1a: other websites and DNS rebinding ----

def test_a_cross_site_restore_is_refused(app, client):
    """Finding 1 (fixed): another website could replace all the data."""
    seed_session(app, [10, 11, 12])
    response = client.post('/api/backup/import', headers={'Origin': EVIL},
                           data=upload(b'{"cubes": [], "sessions": [], "solves": []}'))
    assert response.status_code == 403
    assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 3}]


@pytest.mark.parametrize('route', ['/api/import/preview', '/api/import/selected'])
def test_a_cross_site_import_is_refused(client, cstimer_bytes, route):
    """Finding 1 (fixed): another website could import CSTimer files."""
    data = {**upload(cstimer_bytes), 'sessions': '["session1"]'}
    assert client.post(route, headers={'Origin': EVIL}, data=data).status_code == 403


def test_a_foreign_host_is_refused(client):
    """Finding 1 (fixed): DNS rebinding could read the whole backup."""
    assert client.get('/api/backup/export', headers={'Host': 'evil.example:8577'}).status_code == 403


def test_a_cross_site_form_cannot_write(app, client):
    """Finding 1a (fixed): a plain cross-site form could start sessions."""
    response = client.post('/api/timer/session', headers={'Origin': EVIL}, data='x=1',
                           content_type='application/x-www-form-urlencoded')
    assert response.status_code == 403
    assert query(app, 'SELECT COUNT(*) AS n FROM sessions') == [{'n': 0}]


def test_writes_need_the_custom_header(raw_client):
    """Finding 1a (fixed): state-changing requests need the custom header."""
    response = raw_client.post('/api/timer/session', json={},
                               headers={'Origin': 'http://127.0.0.1:8577', 'Host': '127.0.0.1:8577'})
    assert response.status_code == 403


def test_responses_carry_security_headers(client):
    """Finding 1a (fixed): there were no security headers."""
    response = client.get('/')
    csp = response.headers.get('Content-Security-Policy', '')
    assert "script-src 'self'" in csp and 'unsafe-inline' not in csp.split('script-src')[1].split(';')[0]
    assert "frame-ancestors 'none'" in csp
    assert response.headers.get('X-Content-Type-Options') == 'nosniff'


def test_no_inline_event_handlers():
    """Finding 1a (fixed): a strict CSP would block inline event handlers."""
    sources = [PROJECT_DIR / 'web' / 'index.html', *WEB_JS.glob('*.js')]
    found = {path.name: len(re.findall(r'\son[a-z]+\s*=\s*["\']', path.read_text(encoding='utf-8')))
             for path in sources}
    assert {name: count for name, count in found.items() if count} == {}


# ---- 2 to 2e: CSTimer import ----

def import_file(client, raw, sessions, **form):
    return client.post('/api/import/selected', data={
        **upload(raw, 'cstimer.json'), 'sessions': json.dumps(sessions), **form})


def test_imported_sessions_are_dated_by_their_solves(app, client, cstimer_bytes, cstimer_data):
    """Finding 2 (fixed): imported sessions are dated the day of the import."""
    import_file(client, cstimer_bytes, ['session1'])
    stamps = [row[3] for row in cstimer_data['session1'] if isinstance(row, list)]
    expected = sorted({local_date(t) for t in stamps if isinstance(t, int)})
    assert sorted(r['date'] for r in query(app, 'SELECT date FROM sessions')) == expected


def test_imported_solves_keep_their_own_time(app, client, cstimer_bytes, cstimer_data):
    """Finding 2 (fixed): imported solves get the import time as their timestamp."""
    import_file(client, cstimer_bytes, ['session1'])
    first = query(app, 'SELECT timestamp FROM solves ORDER BY id LIMIT 1')[0]['timestamp']
    assert first == iso_utc(cstimer_data['session1'][0][3])


def test_preview_shows_cstimer_session_names(client, cstimer_bytes):
    """Finding 2 (fixed): the picker shows CSTimer keys, not session names."""
    sessions = client.post('/api/import/preview', data=upload(cstimer_bytes)).get_json()['sessions']
    assert [s.get('name') for s in sessions] == ['Main 3x3', '2', 'Empty']


def test_the_timer_doesnt_join_an_imported_session(app, client, set_today, cstimer_bytes):
    """Finding 2a (fixed): an import dated today becomes the timer's session."""
    set_today('2026-10-08')
    import_file(client, cstimer_bytes, ['session2'])
    result = client.post('/api/timer/solve', json={'session_id': None, 'follow_today': True,
                                                   'event_id': '333', 'time': 9.5}).get_json()
    notes = query(app, 'SELECT notes FROM sessions WHERE id = ?', (result['session_id'],))[0]['notes']
    assert 'CSTimer' not in notes


def test_importing_twice_adds_nothing_the_second_time(app, client, cstimer_bytes):
    """Finding 2b (fixed): importing the same file twice duplicates every solve."""
    import_file(client, cstimer_bytes, ['session2'])
    import_file(client, cstimer_bytes, ['session2'])
    assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 5}]


def test_dnf_times_and_comments_are_kept(app, client, cstimer_bytes):
    """Finding 2c (fixed): dNF times and CSTimer comments are lost."""
    import_file(client, cstimer_bytes, ['session1'])
    rows = query(app, 'SELECT time_ms, dnf, notes FROM solves ORDER BY id')
    assert {'time_ms': 15000, 'dnf': 1, 'notes': ''} in rows
    assert any(r['notes'] == 'nice one' for r in rows)


def test_preview_counts_only_readable_solves(client, cstimer_bytes):
    """Finding 2d (fixed): the preview counts rows that the import skips."""
    session1 = client.post('/api/import/preview', data=upload(cstimer_bytes)).get_json()['sessions'][0]
    assert session1['solve_count'] == 5


def test_unknown_penalty_codes_are_not_imported_as_ok(app, client):
    """Finding 2e (fixed): an unknown penalty code imports as OK."""
    raw = json.dumps({'s': [[[4000, 9000], 'R', '', 1700000000], [[0, 8000], 'U', '', 1700000060]]})
    import_file(client, raw, ['s'])
    assert query(app, 'SELECT time_ms FROM solves') == [{'time_ms': 8000}]


def test_importing_nothing_is_an_error(client, cstimer_bytes):
    """Finding 2e (fixed): importing a key that is not in the file reports success."""
    assert import_file(client, cstimer_bytes, ['nope']).status_code == 400


# ---- 3 to 3b: validation ----

@pytest.mark.parametrize('route, body', [
    ('/api/sessions/{sid}/solves/add', {'time_seconds': 'abc'}),
    ('/api/timer/solve', {'session_id': '{sid}', 'time': 'abc'}),
])
def test_a_non_numeric_time_is_a_400(app, client, route, body):
    """Finding 3 (fixed): a non-numeric time is a 500."""
    sid = seed_session(app, [10])
    body = {k: (sid if v == '{sid}' else v) for k, v in body.items()}
    assert client.post(route.format(sid=sid), json=body).status_code == 400


def test_a_solve_needs_its_session(app, client):
    """Finding 3 (fixed): a solve can be added to a session that does not exist."""
    assert client.post('/api/sessions/99999/solves/add', json={'time_seconds': 10}).status_code == 404
    assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 0}]


def test_only_real_penalties_are_accepted(app, client):
    """Finding 3 (fixed): any penalty string is stored."""
    sid = seed_session(app, [10])
    solve = query(app, 'SELECT id FROM solves')[0]['id']
    assert client.put(f'/api/timer/solve/{solve}/penalty', json={'penalty': 'LOL'}).status_code == 400
    assert client.post(f'/api/sessions/{sid}/solves/add',
                       json={'time_seconds': 10, 'penalty': 'LOL'}).status_code == 400


@pytest.mark.parametrize('seconds', [-5, 0, 7200.01, 1e12])
def test_times_must_be_sensible(app, client, seconds):
    """Finding 3 (fixed): negative and absurd times are accepted."""
    sid = seed_session(app, [])
    assert client.post(f'/api/sessions/{sid}/solves/add', json={'time_seconds': seconds}).status_code == 400


@pytest.mark.parametrize('route', ['/api/sessions/99999', '/api/solves/99999', '/api/cubes/99999'])
def test_deleting_something_missing_is_a_404(client, route):
    """Finding 3 (fixed): deleting something that does not exist reports success."""
    assert client.delete(route).status_code == 404


def test_a_session_needs_a_real_cube(client):
    """Finding 3 (fixed): cube ids are never checked."""
    assert client.post('/api/sessions/add', json={'cube_id': 99999}).status_code == 404


def test_events_must_be_known(app, client, cstimer_bytes):
    """Finding 3a (fixed): any event id is accepted."""
    assert client.post('/api/sessions/add', json={'event_id': 'zzz'}).status_code == 400
    assert import_file(client, cstimer_bytes, ['session2'], event_id='nope').status_code == 400


def test_wca_id_format_is_checked_first(client, fake_wca):
    """Finding 3a (fixed): a badly formed WCA ID still triggers a network lookup."""
    assert client.post('/api/user/settings', json={'wca_id': 'not an id'}).status_code == 400
    assert fake_wca.calls == []


@pytest.mark.parametrize('fields', [{'cube_type': ''}, {'purchase_date': 'yesterday-ish'}])
def test_cube_edits_are_validated(app, client, fields):
    """Finding 3a (fixed): cube edits are not validated."""
    cube = seed_cube(app)
    assert client.put(f'/api/cubes/{cube}', json=fields).status_code == 400


def test_editing_a_missing_cube_is_a_404(client):
    """Finding 3a (fixed): editing a missing cube is a 400, not a 404."""
    assert client.put('/api/cubes/99999', json={'brand': 'x'}).status_code == 404


def test_uploads_have_a_size_limit(app):
    """Finding 3a (fixed): there is no upload size limit."""
    assert (app.config.get('MAX_CONTENT_LENGTH') or 0) > 0


@pytest.mark.parametrize('route', ['/api/sessions/99999/solves', '/api/timer/session/99999/solves'])
def test_solves_of_a_missing_session_are_a_404(client, route):
    """Finding 3a (fixed): the solves of a missing session come back empty instead of 404."""
    assert client.get(route).status_code == 404


def test_an_empty_body_adds_nothing(app, client):
    """Finding 3b (fixed): an empty body adds a 0.00 solve."""
    sid = seed_session(app, [])
    assert client.post(f'/api/sessions/{sid}/solves/add', json={}).status_code == 400
    assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 0}]


def test_plus_two_never_stores_a_negative_time(app, client):
    """Finding 3b (fixed): a +2 under 2 seconds is stored with a negative time."""
    sid = seed_session(app, [])
    response = client.post('/api/timer/solve', json={'session_id': sid, 'time': 1.0, 'penalty': '+2'})
    assert response.status_code == 400
    assert query(app, 'SELECT COUNT(*) AS n FROM solves WHERE time_ms < 0') == [{'n': 0}]


@pytest.mark.parametrize('number', ['NaN', 'Infinity'])
def test_nan_and_infinity_are_400s(app, client, number):
    """Finding 3b (fixed): naN and Infinity are 500s."""
    sid = seed_session(app, [])
    response = client.post(f'/api/sessions/{sid}/solves/add', data=f'{{"time_seconds": {number}}}',
                           content_type='application/json')
    assert response.status_code == 400


# ---- 4 to 4c: world rank ----

def rankings(times_cs, total):
    return {'items': [{'best': t} for t in times_cs], 'total': total}


def test_no_rank_is_guessed_past_the_top_1000(app, client, fake_wca):
    """Finding 4 (fixed): past the top 1,000, every event is ranked with 3x3x3 figures."""
    fake_wca.replies['rank/world/single/222.json'] = rankings(range(40, 1040), 120000)
    seed_session(app, [30.0], event='222')  # far slower than the 1,000th best (10.39 s)
    data = client.get('/api/stats?event_id=222').get_json()
    assert data['wca_rank'] is None and data['wca_percentile'] is None


def test_rank_does_not_depend_on_row_order(conn, fake_wca):
    """Finding 4 (fixed): the rank depends on the order of the rows."""
    from speedcube import wca
    times = [t for t in range(300, 800) for _ in (1, 2)]  # the 1,000th best is 7.99 s
    answers = []
    for order in (sorted(times), random.Random(1).sample(times, len(times))):
        conn.execute('DELETE FROM wca_cache')
        conn.commit()
        fake_wca.replies['rank/world/single/333.json'] = rankings(order, 250000)
        answers.append(wca.estimate_rank(conn, 9.0, '333'))  # past the top 1,000
    assert answers[0] == answers[1]


def test_offline_there_is_no_rank_or_percentile(app, client, fake_wca):
    """Finding 4a (fixed): offline, a percentile is made up from a 3x3x3 table."""
    fake_wca.replies['rank/world/single/333.json'] = OSError('offline')
    seed_session(app, [14.0])
    data = client.get('/api/stats?event_id=333').get_json()
    assert data['wca_rank'] is None and data['wca_percentile'] is None


def test_the_percentile_counts_your_own_rank(app, client, fake_wca):
    """Finding 4b (fixed): rank 1 comes out as 0%."""
    fake_wca.replies['rank/world/single/333.json'] = rankings(range(300, 1300), 2000)
    seed_session(app, [2.0])
    data = client.get('/api/stats?event_id=333').get_json()
    assert data['wca_rank'] == 1 and data['wca_percentile'] == 0.05  # rank 1 of 2,000


@pytest.mark.parametrize('event', ['333oh', '333bf', '444bf', '555bf'])
def test_more_events_get_a_world_rank(app, client, fake_wca, event):
    """Finding 4c (fixed): one-Handed and the blindfolded events have no world rank."""
    fake_wca.replies[f'rank/world/single/{event}.json'] = rankings(range(500, 1500), 50000)
    seed_session(app, [5.5], event=event)
    assert client.get(f'/api/stats?event_id={event}').get_json()['wca_rank'] == 51


# ---- 7 and 10: things the page's code shouldn't do ----

def test_the_timer_uses_a_steady_clock():
    """Finding 7 (fixed): the timer uses Date.now(), which jumps when the clock changes."""
    code = [line for line in (WEB_JS / 'timer.js').read_text(encoding='utf-8').splitlines()
            if not line.strip().startswith('//')]  # comments may explain why it's not used
    assert not any('Date.now()' in line for line in code)


def test_no_blocking_dialogs():
    """Finding 10 (fixed): alert() and confirm() blocked the page. (Comments may still mention them.)"""
    code = {path.name: '\n'.join(line for line in path.read_text(encoding='utf-8').splitlines()
                                 if not line.strip().startswith('//'))
            for path in WEB_JS.glob('*.js')}
    calls = {name: re.findall(r'(?<![\w.])(?:alert|confirm)\(', text) for name, text in code.items()}
    assert {name: found for name, found in calls.items() if found} == {}


# ---- 9 to 9b: charts ----

@finding('9', 'the single-session Ao5 skips DNFs')
def test_session_progress_ao5_follows_the_wca_rules(app, client):
    sid = seed_session(app, [10, 11, 'DNF', 'DNF', 12, 13, 14])
    points = client.get(f'/api/charts/session-progress?session_id={sid}').get_json()['data']
    assert points[-1]['ao5'] is None  # 2 DNFs in the last 5 make it a DNF


@finding('9a', 'the rolling Ao5 is a plain mean of completed times')
@pytest.mark.parametrize('url', ['/api/charts/session-rolling?session_id={sid}',
                                 '/api/charts/rolling-average?event_id=333'])
def test_rolling_ao5_follows_the_wca_rules(app, client, url):
    sid = seed_session(app, [10, 20, 'DNF', 10, 20, 10, 20, 10, 20, 'DNF', 10, 20, 15, 15])
    data = client.get(url.format(sid=sid)).get_json()
    # The last 5 solves are DNF, 10, 20, 15, 15: drop the 10 and the DNF
    assert data['rolling5'][-1] == pytest.approx(50 / 3, abs=0.01)


@finding('9b', 'the progress chart shows the oldest 500 sessions')
def test_progress_chart_shows_the_latest_sessions(app, client):
    from contextlib import closing
    from datetime import date, timedelta

    from helpers import to_record
    from speedcube import db
    start = date(2024, 1, 1)
    with closing(db.connect(app.config['DATABASE'])) as conn, conn:
        for i in range(520):
            cur = conn.execute("INSERT INTO sessions (date, event_id) VALUES (?, '333')",
                               ((start + timedelta(days=i)).isoformat(),))
            db.add_solves_to_new_session(conn, cur.lastrowid, [to_record(10 + i / 100)] * 5)
            db.recompute_session_stats(conn, cur.lastrowid)
    points = client.get('/api/charts/progress?event_id=333').get_json()['data']
    assert points[-1]['date'] == (start + timedelta(days=519)).isoformat()


# ---- 13: WCA rounding (Regulations 9f1 and 9f2) ----

@finding('13', 'singles are rounded, not truncated to hundredths')
def test_singles_are_truncated(app, client):
    sid = seed_session(app, [12.345])
    assert client.get('/api/sessions').get_json()[0]['best_single'] == 12.34
    assert client.get(f'/api/sessions/{sid}/solves').get_json()['solves'][0]['result_seconds'] == 12.34


@finding('13', 'averages come from the raw times, not the truncated singles')
def test_averages_use_truncated_singles(app, client):
    seed_session(app, [10.009] * 5)  # each single is 10.00, so the Ao5 is 10.00, not 10.01
    assert client.get('/api/sessions').get_json()[0]['ao5'] == 10.0


@finding('13', 'results of 10 minutes or more keep their hundredths')
def test_long_singles_are_truncated_to_seconds(app, client):
    seed_session(app, [612.345], event='777')
    assert client.get('/api/sessions').get_json()[0]['best_single'] == 612.0


# ---- 15 and 16: backups and the WCA lookup ----

def test_another_apps_backup_is_refused(app, client):
    """Finding 15 (fixed): a restore never checked that the file is this app's backup."""
    seed_session(app, [10])
    content = json.dumps({'app': 'another-app', 'cubes': [], 'sessions': [], 'solves': []})
    assert client.post('/api/backup/import', data=upload(content)).status_code == 400
    assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 1}]


def test_orphan_solves_are_left_out_of_a_restore(app, client, backup_v3):
    """Finding 15 (fixed): a restore keeps solves whose session is not in the file."""
    backup_v3['solves'].append({'id': 999, 'session_id': 4242, 'solve_number': 1, 'time_ms': 5000})
    assert client.post('/api/backup/import', data=upload(json.dumps(backup_v3))).status_code == 200
    assert query(app, 'SELECT COUNT(*) AS n FROM solves WHERE session_id = 4242') == [{'n': 0}]


def test_wca_lookup_failures_are_described_honestly(client, fake_wca):
    """Finding 16 (fixed): bad JSON from the WCA reads as "Could not connect", and failures are 500s."""
    fake_wca.replies['persons/2003POCH01'] = ValueError('bad JSON')
    response = client.post('/api/user/settings', json={'wca_id': '2003POCH01'})
    assert response.status_code == 502 and 'connect' not in response.get_json()['error'].lower()


def test_wca_ids_are_stored_in_capitals(client, fake_wca):
    """Finding 16 (fixed): a lower-case WCA ID is stored as sent."""
    fake_wca.replies['persons/2003POCH01'] = {'person': {'name': 'Test Person'}}
    client.post('/api/user/settings', json={'wca_id': '2003poch01'})
    assert client.get('/api/user/settings').get_json()['wca_id'] == '2003POCH01'


def test_every_finding_has_a_test():
    """Findings 5, 6, 8, 11, 12, and 13 (the page's side) are tested in the browser; 14 and 17
    are about the docs, which are checked by reading."""
    here = (PROJECT_DIR / 'tests' / 'test_regressions.py').read_text(encoding='utf-8')
    ui = (PROJECT_DIR / 'tests' / 'e2e' / 'test_regressions_ui.py').read_text(encoding='utf-8')
    numbers = set(re.findall(r"finding\('(\w+)'", here + ui)) | set(re.findall(r'Finding (\w+) \(fixed\):', here + ui))
    expected = {'1', '1a', '2', '2a', '2b', '2c', '2d', '2e', '3', '3a', '3b', '4', '4a', '4b',
                '4c', '5', '6', '7', '8', '9', '9a', '9b', '10', '11', '12', '13', '15', '16'}
    assert expected <= numbers, sorted(expected - numbers)
