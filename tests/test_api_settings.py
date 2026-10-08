"""The WCA ID setting (/api/user/settings). The WCA lookup is always faked."""

import urllib.error

from helpers import query


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
