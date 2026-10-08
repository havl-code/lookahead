"""The CSV export of solves (/api/export/solves.csv)."""

import csv
import io
import time
from contextlib import closing

import pytest

from helpers import seed_cube, seed_session
from speedcube import db


def export(client, query_string=''):
    response = client.get(f'/api/export/solves.csv{query_string}')
    return response, response.get_data(as_text=True)


def rows_of(text):
    return list(csv.DictReader(io.StringIO(text.lstrip('﻿'))))


def test_every_solve_in_order_with_its_session_and_cube(app, client, set_today):
    set_today('2026-10-08')
    cube = seed_cube(app, '333', 'GAN', '14 MagLev')
    seed_session(app, [12.345, (11, '+2'), 'DNF'], cube_id=cube, date='2026-09-02')
    seed_session(app, [3.21], event='222', date='2026-09-01')
    response, text = export(client)
    assert response.mimetype == 'text/csv'
    assert response.headers['Content-Disposition'] == 'attachment; filename="speedcube-solves-2026-10-08.csv"'
    assert text.startswith('﻿session_id,session_date,event_id,event,cube,solve_number,time_seconds,')
    rows = rows_of(text)
    assert [(r['session_date'], r['event'], r['solve_number']) for r in rows] == [
        ('2026-09-01', '2x2x2', '1'), ('2026-09-02', '3x3x3', '1'), ('2026-09-02', '3x3x3', '2'),
        ('2026-09-02', '3x3x3', '3')]
    first, plus_two, dnf = rows[1:]
    assert (first['time_seconds'], first['penalty'], first['result_seconds']) == ('12.345', 'OK', '12.34')
    assert (plus_two['time_seconds'], plus_two['penalty'], plus_two['result_seconds']) == ('11.000', '+2', '13.00')
    assert (dnf['penalty'], dnf['result_seconds']) == ('DNF', '')
    assert first['cube'] == 'GAN 14 MagLev (3x3x3)' and rows[0]['cube'] == ''


def test_one_session(app, client, set_today):
    set_today('2026-10-08')
    seed_session(app, [10, 11])
    sid = seed_session(app, [12, 13, 14])
    response, text = export(client, f'?session_id={sid}')
    assert response.headers['Content-Disposition'] == (
        f'attachment; filename="speedcube-solves-session-{sid}-2026-10-08.csv"')
    assert [r['time_seconds'] for r in rows_of(text)] == ['12.000', '13.000', '14.000']


def test_long_results_go_to_whole_seconds(app, client):
    seed_session(app, [612.345], event='777')
    assert rows_of(export(client)[1])[0]['result_seconds'] == '612.00'  # 10:12 (Regulation 9f2)


@pytest.mark.parametrize('text, safe', [('=1+2', "'=1+2"), ('+SUM(A1)', "'+SUM(A1)"), ('-2', "'-2"),
                                         ('@cmd', "'@cmd"), ('R U F', 'R U F'), ('nice one', 'nice one')])
def test_text_that_looks_like_a_formula_stays_text(app, client, text, safe):
    sid = seed_session(app, [])
    client.post(f'/api/sessions/{sid}/solves/add', json={'time_seconds': 10, 'scramble': text, 'notes': text})
    row = rows_of(export(client)[1])[0]
    assert (row['scramble'], row['notes']) == (safe, safe)


def test_no_solves_is_just_the_heading(client):
    assert rows_of(export(client)[1]) == []


@pytest.mark.parametrize('query_string, status', [('?session_id=999', 404), ('?session_id=abc', 400)])
def test_bad_sessions(client, query_string, status):
    assert export(client, query_string)[0].status_code == status


def test_a_big_history_streams_quickly(app, client):
    seed_session(app, [10 + (i % 50) / 10 for i in range(20_000)])
    start = time.perf_counter()
    response, text = export(client)
    assert len(rows_of(text)) == 20_000 and time.perf_counter() - start < 5
    assert 'Content-Length' not in response.headers  # sent as it's made, not built up first


def test_another_site_cant_read_it(client):
    response = client.get('/api/export/solves.csv', headers={'Sec-Fetch-Site': 'cross-site'})
    assert response.status_code == 403


def test_imported_comments_come_out_as_notes(app, client, cstimer_bytes):
    from helpers import upload
    client.post('/api/import/selected', data={**upload(cstimer_bytes), 'sessions': '["session1"]'})
    notes = [r['notes'] for r in rows_of(export(client)[1])]
    assert 'nice one' in notes
    with closing(db.connect(app.config['DATABASE'])) as conn:
        assert conn.execute('SELECT COUNT(*) FROM solves').fetchone()[0] == len(notes)
