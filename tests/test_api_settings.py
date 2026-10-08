"""The settings routes: the WCA ID (/api/user/settings, with the WCA lookup always faked) and
the timer settings (/api/settings/timer)."""

import json
import urllib.error

import pytest

from helpers import query, upload


def test_nothing_set(client):
    assert client.get('/api/user/settings').get_json() == {'wca_id': None, 'wca_name': None}


def test_save_looks_up_the_name(client, fake_wca):
    fake_wca.replies['persons/2003POCH01'] = {'person': {'name': 'Test Person'}}
    response = client.post('/api/user/settings', json={'wca_id': ' 2003POCH01 '})
    assert response.get_json() == {'success': True, 'wca_id': '2003POCH01', 'wca_name': 'Test Person'}
    assert client.get('/api/user/settings').get_json() == {'wca_id': '2003POCH01', 'wca_name': 'Test Person'}


def test_saving_again_replaces_it(app, client, fake_wca):
    fake_wca.replies['persons/2003POCH01'] = {'person': {'name': 'First'}}
    fake_wca.replies['persons/2009ZEMD01'] = {'person': {'name': 'Second'}}
    client.post('/api/user/settings', json={'wca_id': '2003POCH01'})
    client.post('/api/user/settings', json={'wca_id': '2009ZEMD01'})
    assert query(app, 'SELECT wca_id FROM settings') == [{'wca_id': '2009ZEMD01'}]


def test_an_id_is_required(client):
    response = client.post('/api/user/settings', json={'wca_id': '  '})
    assert response.status_code == 400 and response.get_json() == {'error': 'WCA ID is required'}


def test_an_unknown_id(client, fake_wca):
    fake_wca.replies['persons/2099XXXX01'] = urllib.error.HTTPError('u', 404, 'Not Found', {}, None)
    response = client.post('/api/user/settings', json={'wca_id': '2099XXXX01'})
    assert response.status_code == 404 and 'not found' in response.get_json()['error']
    assert client.get('/api/user/settings').get_json()['wca_id'] is None


def test_remove(client, fake_wca):
    fake_wca.replies['persons/2003POCH01'] = {'person': {'name': 'Test Person'}}
    client.post('/api/user/settings', json={'wca_id': '2003POCH01'})
    assert client.delete('/api/user/settings').get_json() == {'success': True}
    assert client.get('/api/user/settings').get_json() == {'wca_id': None, 'wca_name': None}


# ---- Timer settings ----

DEFAULTS = {'inspectionEnabled': True, 'inspectionCalls': 'off', 'hideTimer': False, 'hideStats': False}


def test_timer_settings_start_as_the_defaults(client):
    assert client.get('/api/settings/timer').get_json() == DEFAULTS


def test_timer_settings_are_saved(client):
    response = client.put('/api/settings/timer', json={'hideStats': True, 'inspectionCalls': 'voice'})
    assert response.get_json() == {**DEFAULTS, 'hideStats': True, 'inspectionCalls': 'voice'}
    client.put('/api/settings/timer', json={'inspectionEnabled': False})
    assert client.get('/api/settings/timer').get_json() == {
        **DEFAULTS, 'hideStats': True, 'inspectionCalls': 'voice', 'inspectionEnabled': False}


def test_timer_settings_leave_the_wca_id_alone(app, client, fake_wca):
    fake_wca.replies['persons/2003POCH01'] = {'person': {'name': 'Test Person'}}
    client.post('/api/user/settings', json={'wca_id': '2003POCH01'})
    client.put('/api/settings/timer', json={'hideTimer': True})
    assert client.get('/api/user/settings').get_json()['wca_name'] == 'Test Person'
    client.delete('/api/user/settings')
    assert client.get('/api/settings/timer').get_json()['hideTimer'] is True


@pytest.mark.parametrize('body', [{'colour': 'red'}, {'hideStats': 'yes'}, {'inspectionCalls': 'loud'},
                                  {'inspectionEnabled': 1}])
def test_only_real_timer_settings_are_accepted(client, body):
    assert client.put('/api/settings/timer', json=body).status_code == 400
    assert client.get('/api/settings/timer').get_json() == DEFAULTS


def test_a_damaged_settings_row_falls_back_to_the_defaults(app, client):
    from contextlib import closing

    from speedcube import db
    with closing(db.connect(app.config['DATABASE'])) as conn, conn:
        conn.execute("INSERT INTO settings (id, value) VALUES ('timer', '{not json')")
    assert client.get('/api/settings/timer').get_json() == DEFAULTS


def test_timer_settings_travel_in_backups(app, client, backup_v2):
    client.put('/api/settings/timer', json={'hideStats': True})
    exported = client.get('/api/backup/export').data
    client.put('/api/settings/timer', json={'hideStats': False})
    client.post('/api/backup/import', data=upload(exported))
    assert client.get('/api/settings/timer').get_json()['hideStats'] is True
    # A backup from before timer settings were saved resets them to the defaults
    client.post('/api/backup/import', data=upload(json.dumps(backup_v2)))
    assert client.get('/api/settings/timer').get_json() == DEFAULTS
