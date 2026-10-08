"""validation.py and events.py: what the app accepts before storing anything."""

import io
import json
import re

import pytest

from helpers import PROJECT_DIR, query, seed_cube, seed_session, upload
from speedcube import MAX_UPLOAD_MB, validation
from speedcube.events import EVENTS
from speedcube.validation import ValidationError


class TestSolveTime:
    @pytest.mark.parametrize('value', [0.01, 9.87, 59 * 60, 7200, 7200.0])
    def test_accepts_sensible_times(self, value):
        assert validation.solve_time(value) == float(value)

    @pytest.mark.parametrize('value, message', [
        (None, 'required'), ('', 'required'), ('12.5', 'number'), (True, 'number'), ([], 'number'),
        (float('nan'), 'number'), (float('inf'), 'number'), (-0.01, 'more than 0'),
        (0, 'more than 0'), (7200.001, 'at most 2 hours'),
    ])
    def test_refuses_the_rest(self, value, message):
        with pytest.raises(ValidationError, match=message):
            validation.solve_time(value)

    def test_a_dnf_may_have_no_time(self):
        assert validation.solve_time(0, allow_zero=True) == 0.0

    def test_the_limit_is_two_hours_not_the_wca_limit(self):
        assert validation.MAX_SOLVE_SECONDS == 2 * 60 * 60


class TestSmallFields:
    @pytest.mark.parametrize('value, expected', [(None, 'OK'), ('', 'OK'), ('OK', 'OK'), ('+2', '+2'), ('DNF', 'DNF')])
    def test_penalties(self, value, expected):
        assert validation.penalty(value) == expected

    @pytest.mark.parametrize('value', ['ok', 'dnf', '+4', 2, 'LOL'])
    def test_other_penalties(self, value):
        with pytest.raises(ValidationError):
            validation.penalty(value)

    def test_events(self):
        assert validation.event(None) == '333' and validation.event('', default='222') == '222'
        assert validation.event('333oh') == '333oh'
        with pytest.raises(ValidationError):
            validation.event('333fm')

    def test_text_is_trimmed_and_limited(self):
        assert validation.text('  hi  ', 'Notes', 10) == 'hi'
        assert validation.text(None, 'Notes', 10) == ''
        with pytest.raises(ValidationError, match='at most 3 characters'):
            validation.text('long', 'Notes', 3)
        with pytest.raises(ValidationError, match='must be text'):
            validation.text(5, 'Notes', 10)
        with pytest.raises(ValidationError, match='is required'):
            validation.text('   ', 'Cube type', 10, required=True)

    @pytest.mark.parametrize('value', ['2026-10-08', '2024-02-29'])
    def test_dates(self, value):
        assert validation.iso_date(value) == value

    @pytest.mark.parametrize('value, message', [
        ('2026-02-30', 'real date'), ('20261008', 'YYYY-MM-DD'), ('8/10/2026', 'YYYY-MM-DD'),
        (20261008, 'YYYY-MM-DD'), ('2026-10-09', 'future'),
    ])
    def test_bad_dates(self, value, message):
        with pytest.raises(ValidationError, match=message):
            validation.iso_date(value, today='2026-10-08')

    def test_a_blank_date(self):
        assert validation.iso_date('') is None
        with pytest.raises(ValidationError, match='required'):
            validation.iso_date(None, required=True)

    @pytest.mark.parametrize('value, expected', [('2003POCH01', '2003POCH01'), (' 2003poch01 ', '2003POCH01')])
    def test_wca_ids(self, value, expected):
        assert validation.wca_id(value) == expected

    @pytest.mark.parametrize('value', ['2003POCH1', 'POCH200301', '2003PO CH01', '2003POCH011'])
    def test_bad_wca_ids(self, value):
        with pytest.raises(ValidationError, match='four digits, four letters, and two digits'):
            validation.wca_id(value)

    @pytest.mark.parametrize('value, expected', [(None, None), ('', None), (5, 5), ('12', 12)])
    def test_record_ids(self, value, expected):
        assert validation.record_id(value, 'Cube') == expected

    @pytest.mark.parametrize('value', [0, -1, 'abc', True, 1.5])
    def test_bad_record_ids(self, value):
        with pytest.raises(ValidationError, match='must be a number'):
            validation.record_id(value, 'Cube')

    def test_require_answers_404(self, conn):
        with pytest.raises(ValidationError) as raised:
            validation.require(conn, 'cubes', 42, 'Cube')
        assert raised.value.status == 404 and str(raised.value) == 'Cube not found'


def test_the_event_list_matches_the_page():
    config = (PROJECT_DIR / 'web' / 'js' / 'config.js').read_text(encoding='utf-8')
    block = re.search(r'const EVENT_NAMES = \{(.*?)\};', config, re.S).group(1)
    page_events = dict(re.findall(r"'(\w+)': '([^']+)'", block))
    assert page_events == EVENTS


class TestRoutes:
    def test_messages_reach_the_page(self, app, client):
        sid = seed_session(app, [])
        response = client.post(f'/api/sessions/{sid}/solves/add', json={'time_seconds': 9000})
        assert response.status_code == 400
        assert response.get_json() == {'error': 'A solve can be at most 2 hours long.'}

    def test_a_dnf_typed_in_may_have_no_time(self, app, client):
        sid = seed_session(app, [])
        response = client.post(f'/api/sessions/{sid}/solves/add', json={'time_seconds': 0, 'penalty': 'DNF'})
        assert response.status_code == 200

    def test_new_solves_store_ok_as_ok(self, app, client):
        sid = seed_session(app, [])
        client.post(f'/api/sessions/{sid}/solves/add', json={'time_seconds': 10, 'penalty': None})
        assert query(app, 'SELECT penalty FROM solves') == [{'penalty': 'OK'}]

    def test_an_inspection_dnf_from_the_timer(self, app, client):
        result = client.post('/api/timer/solve', json={'follow_today': True, 'time': 0,
                                                       'penalty': 'DNF', 'dnf': True})
        assert result.status_code == 200

    def test_a_cube_id_from_a_menu(self, app, client):
        cube = seed_cube(app)
        sid = client.post('/api/sessions/add', json={'cube_id': str(cube)}).get_json()['session_id']
        assert query(app, 'SELECT cube_id FROM sessions WHERE id = ?', (sid,)) == [{'cube_id': cube}]

    def test_cube_edits(self, app, client):
        cube = seed_cube(app)
        assert client.put(f'/api/cubes/{cube}', json={'purchase_date': ''}).status_code == 200
        assert client.put(f'/api/cubes/{cube}', json={'is_active': 'yes'}).status_code == 400
        assert client.put(f'/api/cubes/{cube}', json={'brand': 'x' * 201}).status_code == 400

    def test_a_big_upload_is_refused_clearly(self, client):
        big = io.BytesIO(b'x' * (MAX_UPLOAD_MB * 1024 * 1024 + 1))
        response = client.post('/api/import/preview', data={'file': (big, 'huge.json')})
        assert response.status_code == 413
        assert response.get_json() == {'error': f'That file is too big (the limit is {MAX_UPLOAD_MB} MB).'}


class TestRestoreTidiesUp:
    def test_sessions_lose_a_cube_that_isnt_in_the_file(self, app, client, backup_v3):
        backup_v3['sessions'][0]['cube_id'] = 999
        response = client.post('/api/backup/import', data=upload(json.dumps(backup_v3)))
        assert response.status_code == 200
        assert query(app, 'SELECT cube_id FROM sessions WHERE id = ?', (backup_v3['sessions'][0]['id'],)) == [
            {'cube_id': None}]

    def test_left_out_solves_are_counted(self, client, backup_v3):
        backup_v3['solves'].append({'id': 999, 'session_id': 4242, 'solve_number': 1, 'time_ms': 5000})
        response = client.post('/api/backup/import', data=upload(json.dumps(backup_v3)))
        assert response.get_json()['solves_left_out'] == 1

    def test_a_backup_without_an_app_name_still_restores(self, client, backup_v3):
        del backup_v3['app']
        assert client.post('/api/backup/import', data=upload(json.dumps(backup_v3))).status_code == 200


def test_the_page_uses_the_same_time_limit():
    """config.js stops the timer at the same 2 hours the server accepts, and knows the WCA's
    longest limit (60 minutes, Regulation H1b) for its notice."""
    config = (PROJECT_DIR / 'web' / 'js' / 'config.js').read_text(encoding='utf-8')

    def seconds(name):
        product = 1
        for factor in re.search(rf'const {name} = ([\d\s*]+);', config).group(1).split('*'):
            product *= int(factor)
        return product

    assert seconds('MAX_SOLVE_SECONDS') == validation.MAX_SOLVE_SECONDS
    assert seconds('WCA_LONGEST_LIMIT_SECONDS') == 60 * 60
