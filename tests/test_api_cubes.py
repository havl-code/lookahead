"""The Cubes tab's routes."""

from helpers import query


def add(client, **fields):
    return client.post('/api/cubes/add', json=fields)


def test_add_and_list(client):
    cube_id = add(client, cube_type='333', brand='GAN', model='14', purchase_date='2026-01-15',
                  notes='Main').get_json()['cube_id']
    assert client.get('/api/cubes').get_json() == [{
        'id': cube_id, 'cube_type': '333', 'brand': 'GAN', 'model': '14',
        'purchase_date': '2026-01-15', 'is_active': True, 'notes': 'Main'}]


def test_a_type_is_required(client):
    response = add(client, brand='GAN')
    assert response.status_code == 400 and response.get_json() == {'error': 'Cube type is required'}


def test_custom_types_and_ordering(client):
    for cube_type in ('skewb', 'Mirror blocks', '222'):
        add(client, cube_type=cube_type)
    assert [c['cube_type'] for c in client.get('/api/cubes').get_json()] == ['222', 'Mirror blocks', 'skewb']


def test_blank_fields_are_stored_empty(app, client):
    add(client, cube_type='333', purchase_date='')
    assert query(app, 'SELECT brand, model, purchase_date, notes FROM cubes') == [
        {'brand': '', 'model': '', 'purchase_date': None, 'notes': ''}]


def test_edit(client):
    cube_id = add(client, cube_type='333', brand='GAN').get_json()['cube_id']
    response = client.put(f'/api/cubes/{cube_id}', json={'brand': 'MoYu', 'model': 'RS3M'})
    assert response.get_json() == {'success': True, 'message': 'Cube updated'}
    cube = client.get('/api/cubes').get_json()[0]
    assert (cube['brand'], cube['model']) == ('MoYu', 'RS3M')


def test_edit_with_nothing_to_change(client):
    cube_id = add(client, cube_type='333').get_json()['cube_id']
    assert client.put(f'/api/cubes/{cube_id}', json={'colour': 'red'}).status_code == 400


def test_deactivate_and_reactivate(client):
    cube_id = add(client, cube_type='333').get_json()['cube_id']
    assert client.delete(f'/api/cubes/{cube_id}').get_json()['message'] == 'Cube deactivated'
    assert client.get('/api/cubes').get_json()[0]['is_active'] is False
    client.put(f'/api/cubes/{cube_id}', json={'is_active': 1})
    assert client.get('/api/cubes').get_json()[0]['is_active'] is True
