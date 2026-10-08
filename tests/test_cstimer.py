"""cstimer.py: reading CSTimer exports."""

import json

import pytest

from helpers import query
from speedcube import cstimer


class TestLoad:
    def test_reads_json(self, cstimer_bytes, cstimer_data):
        assert cstimer.load(cstimer_bytes) == cstimer_data

    def test_reads_the_txt_export_with_a_bom(self, cstimer_data):
        from helpers import FIXTURES
        raw = (FIXTURES / 'cstimer_export.txt').read_bytes()
        assert raw.startswith(b'\xef\xbb\xbf')
        assert cstimer.load(raw) == cstimer_data

    @pytest.mark.parametrize('raw', [b'[1, 2]', b'"text"', b'{broken', b'\xff\xfe\x00', b''])
    def test_rejects_anything_else(self, raw):
        with pytest.raises(ValueError):
            cstimer.load(raw)


class TestPreview:
    def test_lists_sessions_but_not_properties(self, cstimer_data):
        assert [s['key'] for s in cstimer.preview(cstimer_data)] == ['session1', 'session2', 'session3']

    def test_summaries_include_plus_two_and_leave_out_dnfs(self, cstimer_data):
        session1 = cstimer.preview(cstimer_data)[0]
        # Readable results: 12.345, 11 + 2, a DNF, 13, and 14
        assert session1['best'] == 12.345
        assert session1['worst'] == 14.0
        assert session1['mean'] == pytest.approx((12.345 + 13 + 13 + 14) / 4)

    def test_an_empty_session(self, cstimer_data):
        session3 = cstimer.preview(cstimer_data)[2]
        assert (session3['solve_count'], session3['best'], session3['mean']) == (0, None, None)

    def test_skips_values_that_arent_lists(self):
        assert cstimer.preview({'session1': 'oops', 'session2': []}) == [
            {'key': 'session2', 'solve_count': 0, 'best': None, 'worst': None, 'mean': None}]


class TestImport:
    def test_imports_only_the_chosen_sessions(self, app, conn, cstimer_data):
        with conn:
            result = cstimer.import_sessions(conn, cstimer_data, ['session2'], '333oh')
        assert result == {'sessions_imported': 1, 'total_solves': 5}
        assert query(app, 'SELECT event_id, solve_count FROM sessions') == [
            {'event_id': '333oh', 'solve_count': 5}]

    def test_ok_plus_two_and_dnf(self, app, conn, cstimer_data):
        with conn:
            cstimer.import_sessions(conn, cstimer_data, ['session1'], '333')
        rows = query(app, 'SELECT solve_number, time_ms, penalty, dnf, scramble FROM solves '
                          'ORDER BY solve_number')
        assert [r['solve_number'] for r in rows] == [1, 2, 3, 4, 5]  # the two bad rows are skipped
        assert [(r['penalty'], r['dnf']) for r in rows] == [
            (None, 0), ('+2', 0), ('DNF', 1), (None, 0), (None, 0)]
        assert [rows[i]['time_ms'] for i in (0, 1, 3, 4)] == [12345, 11000, 13000, 14000]
        assert rows[1]['scramble'] == "F R U' R' U' R U R' F'"
        stats = query(app, 'SELECT best_single, solve_count FROM sessions')[0]
        assert stats == {'best_single': 12345, 'solve_count': 5}

    def test_empty_sessions_and_properties_are_skipped(self, app, conn, cstimer_data):
        with conn:
            result = cstimer.import_sessions(conn, cstimer_data, ['session3', 'properties'], '333')
        assert result == {'sessions_imported': 0, 'total_solves': 0}
        assert query(app, 'SELECT COUNT(*) AS n FROM sessions') == [{'n': 0}]

    def test_a_row_with_too_little_in_it(self, app, conn):
        data = {'s': [[[0]], [[0, 9000]], [[0, 8000], 'R']]}
        with conn:
            result = cstimer.import_sessions(conn, data, ['s'], '333')
        assert result['total_solves'] == 2
        assert [r['scramble'] for r in query(app, 'SELECT scramble FROM solves ORDER BY id')] == ['', 'R']

    def test_preview_and_import_agree_on_times(self, app, conn, cstimer_data):
        preview = {s['key']: s for s in cstimer.preview(cstimer_data)}
        with conn:
            cstimer.import_sessions(conn, cstimer_data, ['session2'], '333')
        best = query(app, 'SELECT best_single FROM sessions')[0]['best_single']
        assert best / 1000 == preview['session2']['best']

    def test_session_names_are_in_properties(self, cstimer_data):
        names = json.loads(cstimer_data['properties']['sessionData'])
        assert names['1']['name'] == 'Main 3x3'
