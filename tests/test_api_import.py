"""The Import tab's routes (CSTimer preview and import)."""

import json

import pytest

from helpers import query, upload


class TestPreview:
    def test_lists_the_sessions(self, client, cstimer_bytes):
        data = client.post('/api/import/preview', data=upload(cstimer_bytes, 'cstimer.txt')).get_json()
        assert data['filename'] == 'cstimer.txt'
        assert [s['key'] for s in data['sessions']] == ['session1', 'session2', 'session3']

    def test_needs_a_file(self, client):
        response = client.post('/api/import/preview', data={})
        assert response.status_code == 400 and response.get_json() == {'error': 'No file provided'}

    @pytest.mark.parametrize('content', [b'[1, 2]', b'{broken', b'\xff\xfe'])
    def test_rejects_files_that_arent_exports(self, client, content):
        assert client.post('/api/import/preview', data=upload(content)).status_code == 400


class TestImport:
    def form(self, content, sessions, event_id=None):
        data = {**upload(content, 'cstimer.json'), 'sessions': json.dumps(sessions)}
        if event_id:
            data['event_id'] = event_id
        return data

    def test_imports_the_chosen_sessions(self, app, client, cstimer_bytes):
        response = client.post('/api/import/selected',
                               data=self.form(cstimer_bytes, ['session1', 'session2'], '333oh'))
        # session1 spans three days, so it becomes three sessions; session2 is one day
        assert response.get_json() == {
            'success': True, 'message': "Imported 10 solves into 4 sessions (skipped 2 that couldn't be read)",
            'details': {'sessions_imported': 4, 'total_solves': 10, 'duplicates_skipped': 0,
                        'unreadable_skipped': 2}}
        assert query(app, 'SELECT DISTINCT event_id FROM sessions') == [{'event_id': '333oh'}]

    def test_defaults_to_3x3x3(self, app, client, cstimer_bytes):
        client.post('/api/import/selected', data=self.form(cstimer_bytes, ['session2']))
        assert query(app, 'SELECT event_id FROM sessions') == [{'event_id': '333'}]

    def test_needs_a_file_and_a_choice(self, client, cstimer_bytes):
        assert client.post('/api/import/selected', data={'sessions': '["session1"]'}).status_code == 400
        assert client.post('/api/import/selected', data=self.form(cstimer_bytes, [])).status_code == 400

    @pytest.mark.parametrize('sessions', ['not json', '{"a": 1}'])
    def test_a_garbled_choice(self, client, cstimer_bytes, sessions):
        data = {**upload(cstimer_bytes), 'sessions': sessions}
        assert client.post('/api/import/selected', data=data).status_code == 400

    def test_split_by_day_can_be_turned_off(self, app, client, cstimer_bytes):
        data = {**self.form(cstimer_bytes, ['session1']), 'split_by_day': 'false'}
        assert client.post('/api/import/selected', data=data).get_json()['details']['sessions_imported'] == 1

    def test_importing_twice_says_so(self, client, cstimer_bytes):
        client.post('/api/import/selected', data=self.form(cstimer_bytes, ['session2']))
        response = client.post('/api/import/selected', data=self.form(cstimer_bytes, ['session2']))
        assert response.get_json()['message'] == 'Imported 0 solves into 0 sessions (skipped 5 already in the app)'

    def test_the_preview_counts_what_is_already_imported(self, client, cstimer_bytes):
        client.post('/api/import/selected', data=self.form(cstimer_bytes, ['session2']))
        sessions = client.post('/api/import/preview', data=upload(cstimer_bytes)).get_json()['sessions']
        assert [s['already_imported'] for s in sessions] == [0, 5, 0]

    def test_a_bad_file(self, client):
        response = client.post('/api/import/selected', data=self.form(b'{broken', ['session1']))
        assert response.status_code == 400 and response.get_json() == {'error': 'An error occurred during import'}
