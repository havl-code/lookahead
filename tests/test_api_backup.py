"""The backup routes in the footer (/api/backup/export and /api/backup/import)."""

import json

from helpers import query, seed_session, upload


def test_export_downloads_a_dated_file(app, client, set_today):
    set_today('2026-10-08')
    seed_session(app, [10, 11])
    response = client.get('/api/backup/export')
    assert response.headers['Content-Disposition'] == 'attachment; filename="lookahead-backup-2026-10-08.json"'
    payload = json.loads(response.data)
    assert len(payload['solves']) == 2 and payload['app'] == 'lookahead'


def test_restore_its_own_export(app, client):
    seed_session(app, [10, 11, 12])
    exported = client.get('/api/backup/export').data
    seed_session(app, [99])
    response = client.post('/api/backup/import', data=upload(exported, 'backup.json'))
    reply = response.get_json()
    assert (reply['success'], reply['solves_left_out']) == (True, 0)
    assert reply['safety_copy'].startswith('lookahead-') and reply['safety_copy'].endswith('-before-restore.db')
    assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 3}]


def test_restore_a_2x_backup(app, client, backup_v2):
    response = client.post('/api/backup/import', data=upload(json.dumps(backup_v2), 'old.json'))
    assert response.status_code == 200
    assert client.get('/api/sessions').get_json()[0]['ao5'] == 12.67


def test_restore_reads_a_bom(client, backup_v3):
    content = b'\xef\xbb\xbf' + json.dumps(backup_v3).encode()
    assert client.post('/api/backup/import', data=upload(content)).status_code == 200


def test_restore_needs_a_file(client):
    response = client.post('/api/backup/import', data={})
    assert response.status_code == 400 and response.get_json() == {'error': 'No file provided'}


def test_restore_rejects_other_files(app, client):
    seed_session(app, [10])
    for content in (b'hello', b'[]', b'{"cubes": []}',
                    b'{"cubes": [], "sessions": [], "solves": [{"id": 1, "session_id": 1}]}'):
        response = client.post('/api/backup/import', data=upload(content))
        assert response.status_code == 400
        assert response.get_json() == {'error': 'This file does not look like a valid backup.'}
    assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 1}]  # nothing changed
