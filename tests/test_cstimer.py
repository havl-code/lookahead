"""cstimer.py: reading CSTimer exports, keeping each solve's own date, comment, and penalty."""

import json
import time

import pytest

from helpers import FIXTURES, query
from speedcube import cstimer


def stamps(data, key):
    return [row[3] for row in data[key] if isinstance(row, list) and isinstance(row[0][0], int)]


def run_import(conn, data, keys, event='333', **options):
    with conn:
        return cstimer.import_sessions(conn, data, keys, event, **options)


class TestLoad:
    def test_reads_json(self, cstimer_bytes, cstimer_data):
        assert cstimer.load(cstimer_bytes) == cstimer_data

    def test_reads_the_txt_export_with_a_bom(self, cstimer_data):
        raw = (FIXTURES / 'cstimer_export.txt').read_bytes()
        assert raw.startswith(b'\xef\xbb\xbf')
        assert cstimer.load(raw) == cstimer_data

    @pytest.mark.parametrize('raw', [b'[1, 2]', b'"text"', b'{broken', b'\xff\xfe\x00', b''])
    def test_rejects_anything_else(self, raw):
        with pytest.raises(ValueError):
            cstimer.load(raw)


class TestNames:
    def test_names_come_from_session_data(self, cstimer_data):
        assert cstimer.session_names(cstimer_data) == {
            'session1': 'Main 3x3', 'session2': '2', 'session3': 'Empty'}

    def test_session_data_can_be_an_object(self):
        data = {'properties': {'sessionData': {'4': {'name': ' OH '}}}}
        assert cstimer.session_names(data) == {'session4': 'OH'}

    @pytest.mark.parametrize('properties', [None, 'x', {}, {'sessionData': '{broken'},
                                            {'sessionData': '[]'}, {'sessionData': '{"1": {"name": ""}}'}])
    def test_no_usable_names(self, properties):
        assert cstimer.session_names({'properties': properties}) == {}

    def test_sessions_without_a_name_are_numbered(self):
        names = [s['name'] for s in cstimer.preview({'session7': [], 'mine': []})]
        assert names == ['Session 7', 'mine']


class TestPreview:
    def test_lists_sessions_but_not_properties(self, cstimer_data):
        assert [s['key'] for s in cstimer.preview(cstimer_data)] == ['session1', 'session2', 'session3']

    def test_summaries_include_plus_two_and_leave_out_dnfs(self, cstimer_data):
        session1 = cstimer.preview(cstimer_data)[0]
        # Readable results: 12.345, 11 + 2, a DNF, 13, and 14. As the WCA records them, the
        # single is 12.34 and the mean (12.34 + 13 + 13 + 14) / 4 = 13.085 rounds to 13.09
        assert (session1['best'], session1['worst']) == (12.34, 14.0)
        assert session1['mean'] == 13.09

    def test_counts_readable_and_unreadable_rows(self, cstimer_data):
        session1 = cstimer.preview(cstimer_data)[0]
        assert (session1['solve_count'], session1['unreadable']) == (5, 2)

    def test_the_days_a_session_spans(self, cstimer_data):
        session1 = cstimer.preview(cstimer_data)[0]
        days = sorted({cstimer.local_date(t) for t in stamps(cstimer_data, 'session1')})
        assert (session1['first_date'], session1['last_date'], session1['days']) == (days[0], days[-1], 3)

    def test_an_empty_session(self, cstimer_data):
        session3 = cstimer.preview(cstimer_data)[2]
        assert (session3['solve_count'], session3['best'], session3['days'], session3['first_date']) == (0, None, 0, None)

    def test_skips_values_that_arent_lists(self):
        assert [s['key'] for s in cstimer.preview({'session1': 'oops', 'session2': []})] == ['session2']

    def test_counts_solves_already_in_the_app(self, conn, cstimer_data):
        run_import(conn, cstimer_data, ['session2'])
        preview = {s['key']: s for s in cstimer.preview(cstimer_data, conn)}
        assert preview['session2']['already_imported'] == 5
        assert preview['session1']['already_imported'] == 0


class TestRows:
    @pytest.mark.parametrize('row', [
        'not a solve', [], [[0]], [['fast', 9000]], [[0, 'slow']], [[4000, 9000]], [[0, 0]],
        [[0, -5]], [[0, 7_200_001]], [[True, 9000]], [[0, float('nan')]],
    ])
    def test_unreadable_rows(self, row):
        assert cstimer._parse_solve(row) is None

    def test_a_dnf_keeps_its_time_and_may_have_none(self):
        assert cstimer._parse_solve([[-1, 15000]])['time_ms'] == 15000
        assert cstimer._parse_solve([[-1, 0]])['dnf'] is True

    def test_the_comment_becomes_the_note(self):
        assert cstimer._parse_solve([[0, 9000], 'R', '  PB!  ', 1700000000])['notes'] == 'PB!'

    @pytest.mark.parametrize('stamp', [None, 'yesterday', 5, time.time() + 10 * 86400])
    def test_a_missing_or_impossible_timestamp_takes_the_one_before(self, stamp):
        rows = [[[0, 9000], 'R', '', 1700000000], [[0, 8000], 'U', '', stamp]]
        solves, unreadable = cstimer._readable_solves(rows)
        assert unreadable == 0 and solves[1]['unix'] == 1700000000

    def test_iso_time_matches_the_apps_timestamps(self):
        assert cstimer.iso_time(1700000000) == '2023-11-14T22:13:20.000Z'


class TestImport:
    def test_imports_only_the_chosen_sessions(self, app, conn, cstimer_data):
        result = run_import(conn, cstimer_data, ['session2'], '333oh')
        assert result == {'sessions_imported': 1, 'total_solves': 5, 'duplicates_skipped': 0,
                          'unreadable_skipped': 0, 'sessions_found': 1}
        assert query(app, 'SELECT event_id, solve_count, notes FROM sessions') == [
            {'event_id': '333oh', 'solve_count': 5, 'notes': 'Imported from CSTimer: 2'}]

    def test_one_session_per_day_dated_by_its_solves(self, app, conn, cstimer_data):
        run_import(conn, cstimer_data, ['session1'])
        days = sorted({cstimer.local_date(t) for t in stamps(cstimer_data, 'session1')})
        sessions = query(app, 'SELECT date, solve_count FROM sessions ORDER BY date')
        assert [s['date'] for s in sessions] == days
        assert [s['solve_count'] for s in sessions] == [3, 1, 1]

    def test_ok_plus_two_and_dnf_with_their_own_times(self, app, conn, cstimer_data):
        run_import(conn, cstimer_data, ['session1'])
        rows = query(app, 'SELECT time_ms, penalty, dnf, notes, scramble, timestamp FROM solves ORDER BY id')
        assert [(r['time_ms'], r['penalty'], r['dnf']) for r in rows] == [
            (12345, 'OK', 0), (11000, '+2', 0), (15000, 'DNF', 1), (13000, 'OK', 0), (14000, 'OK', 0)]
        assert [r['notes'] for r in rows] == ['', 'nice one', '', '', '']
        assert rows[1]['scramble'] == "F R U' R' U' R U R' F'"
        assert [r['timestamp'] for r in rows] == [cstimer.iso_time(t) for t in stamps(cstimer_data, 'session1')]

    def test_without_splitting_it_stays_one_session(self, app, conn, cstimer_data):
        run_import(conn, cstimer_data, ['session1'], split_by_day=False)
        first_day = cstimer.local_date(stamps(cstimer_data, 'session1')[0])
        assert query(app, 'SELECT date, solve_count FROM sessions') == [{'date': first_day, 'solve_count': 5}]

    def test_importing_again_skips_what_is_already_there(self, app, conn, cstimer_data):
        run_import(conn, cstimer_data, ['session1', 'session2'])
        result = run_import(conn, cstimer_data, ['session1', 'session2'], event='333oh')
        assert (result['total_solves'], result['duplicates_skipped'], result['sessions_imported']) == (0, 10, 0)
        assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 10}]

    def test_a_longer_export_adds_only_the_new_solves(self, app, conn, cstimer_data):
        run_import(conn, cstimer_data, ['session2'])
        cstimer_data['session2'].append([[0, 19000], 'F', '', cstimer_data['session2'][-1][3] + 60])
        result = run_import(conn, cstimer_data, ['session2'])
        assert (result['total_solves'], result['duplicates_skipped']) == (1, 5)

    def test_empty_sessions_and_properties_are_skipped(self, app, conn, cstimer_data):
        result = run_import(conn, cstimer_data, ['session3', 'properties'])
        assert (result['sessions_imported'], result['sessions_found']) == (0, 1)
        assert query(app, 'SELECT COUNT(*) AS n FROM sessions') == [{'n': 0}]

    def test_unreadable_rows_are_counted(self, conn, cstimer_data):
        assert run_import(conn, cstimer_data, ['session1'])['unreadable_skipped'] == 2

    def test_a_row_with_too_little_in_it(self, app, conn):
        data = {'s': [[[0]], [[0, 9000]], [[0, 8000], 'R']]}
        assert run_import(conn, data, ['s'])['total_solves'] == 2
        assert [r['scramble'] for r in query(app, 'SELECT scramble FROM solves ORDER BY id')] == ['', 'R']

    def test_preview_and_import_agree_on_times(self, app, conn, cstimer_data):
        preview = {s['key']: s for s in cstimer.preview(cstimer_data)}
        run_import(conn, cstimer_data, ['session2'])
        best = query(app, 'SELECT best_single FROM sessions')[0]['best_single']
        assert best / 1000 == preview['session2']['best']

    def test_the_fixture_names_its_sessions(self, cstimer_data):
        assert json.loads(cstimer_data['properties']['sessionData'])['1']['name'] == 'Main 3x3'
