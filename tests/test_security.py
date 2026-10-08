"""speedcube/security.py: other websites can't read or change anything (README, "Security")."""

import pytest

from helpers import APP_URL, query, seed_session, upload
from speedcube import create_app, security

EVIL = 'https://evil.example'


def page_headers(**extra):
    """What the app's own page sends with a request that changes something."""
    return {'Host': '127.0.0.1:8577', 'Origin': APP_URL, 'X-Requested-With': 'speedcube', **extra}


class TestHost:
    @pytest.mark.parametrize('host', ['127.0.0.1:8577', 'localhost:8577'])
    def test_the_app_answers_on_its_own_addresses(self, raw_client, host):
        assert raw_client.get('/api/events', headers={'Host': host}).status_code == 200

    @pytest.mark.parametrize('host', ['evil.example:8577', '127.0.0.1:9999', 'localhost',
                                      '127.0.0.1.evil.example:8577', '192.168.1.5:8577'])
    def test_any_other_address_is_refused(self, raw_client, host):
        response = raw_client.get('/api/events', headers={'Host': host})
        assert response.status_code == 403 and 'error' in response.get_json()

    def test_pages_are_checked_too(self, raw_client):
        response = raw_client.get('/', headers={'Host': 'evil.example:8577'})
        assert response.status_code == 403 and response.content_type.startswith('text/html')

    def test_before_the_port_is_known_any_local_port_is_fine(self, tmp_path):
        client = create_app(tmp_path / 'x.db').test_client()
        assert client.get('/api/events', headers={'Host': '127.0.0.1:1234'}).status_code == 200
        assert client.get('/api/events', headers={'Host': 'localhost'}).status_code == 200
        assert client.get('/api/events', headers={'Host': 'evil.example'}).status_code == 403
        assert client.get('/api/events', headers={'Host': 'localhost:evil'}).status_code == 403


class TestOtherWebsites:
    @pytest.mark.parametrize('site', ['cross-site', 'same-site'])
    def test_their_reads_are_refused(self, client, site):
        assert client.get('/api/backup/export', headers={'Sec-Fetch-Site': site}).status_code == 403

    def test_presence_cant_be_held_open_from_another_site(self, client):
        assert client.get('/api/presence', headers={'Sec-Fetch-Site': 'cross-site'}).status_code == 403

    def test_a_cors_preflight_is_refused(self, client):
        response = client.options('/api/backup/import', headers={
            'Origin': EVIL, 'Sec-Fetch-Site': 'cross-site',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'x-requested-with'})
        assert response.status_code == 403
        assert 'Access-Control-Allow-Origin' not in response.headers

    @pytest.mark.parametrize('site', ['same-origin', 'none'])
    def test_the_apps_own_requests_are_fine(self, client, site):
        assert client.get('/api/events', headers={'Sec-Fetch-Site': site}).status_code == 200

    def test_navigating_to_the_page_from_another_site_is_fine(self, client):
        # Following a link to the app (say, from GitHub) is a normal visit
        assert client.get('/', headers={'Sec-Fetch-Site': 'cross-site'}).status_code == 200


class TestChanges:
    def test_from_the_page_they_work(self, raw_client):
        response = raw_client.post('/api/sessions/add', json={}, headers=page_headers())
        assert response.status_code == 200

    @pytest.mark.parametrize('origin', [EVIL, 'null', 'http://127.0.0.1:9999', 'https://127.0.0.1:8577'])
    def test_from_anywhere_else_they_are_refused(self, app, raw_client, origin):
        response = raw_client.post('/api/sessions/add', json={}, headers=page_headers(Origin=origin))
        assert response.status_code == 403
        assert query(app, 'SELECT COUNT(*) AS n FROM sessions') == [{'n': 0}]

    def test_the_referer_counts_when_there_is_no_origin(self, raw_client):
        headers = page_headers(Referer=f'{APP_URL}/#timer')
        del headers['Origin']
        assert raw_client.post('/api/sessions/add', json={}, headers=headers).status_code == 200
        headers['Referer'] = f'{EVIL}/attack'
        assert raw_client.post('/api/sessions/add', json={}, headers=headers).status_code == 403

    def test_no_origin_and_no_referer_is_refused(self, raw_client):
        headers = page_headers()
        del headers['Origin']
        assert raw_client.post('/api/sessions/add', json={}, headers=headers).status_code == 403

    @pytest.mark.parametrize('value', [None, 'XMLHttpRequest', ''])
    def test_the_header_must_be_exact(self, raw_client, value):
        headers = page_headers()
        if value is None:
            del headers['X-Requested-With']
        else:
            headers['X-Requested-With'] = value
        assert raw_client.post('/api/sessions/add', json={}, headers=headers).status_code == 403

    @pytest.mark.parametrize('method, route', [
        ('put', '/api/cubes/1'), ('delete', '/api/sessions/1'), ('delete', '/api/user/settings')])
    def test_every_kind_of_change_is_checked(self, app, raw_client, method, route):
        seed_session(app, [10])
        response = getattr(raw_client, method)(route, json={}, headers=page_headers(Origin=EVIL))
        assert response.status_code == 403

    def test_reads_need_no_header(self, raw_client):
        assert raw_client.get('/api/sessions', headers={'Host': '127.0.0.1:8577'}).status_code == 200

    def test_a_cross_site_restore_leaves_everything(self, app, raw_client):
        seed_session(app, [10, 11])
        raw_client.post('/api/backup/import', headers=page_headers(Origin=EVIL, **{'Sec-Fetch-Site': 'cross-site'}),
                        data=upload(b'{"cubes": [], "sessions": [], "solves": []}'))
        assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 2}]


class TestHeaders:
    @pytest.mark.parametrize('path', ['/', '/js/config.js', '/api/events', '/api/nope'])
    def test_every_response_carries_them(self, client, path):
        with client.get(path) as response:
            for name, value in security.SECURITY_HEADERS.items():
                assert response.headers[name] == value

    def test_api_replies_are_never_cached(self, client):
        assert client.get('/api/sessions').headers['Cache-Control'] == 'no-store'

    def test_pages_can_still_be_cached(self, client):
        with client.get('/js/config.js') as response:
            assert response.headers.get('Cache-Control') != 'no-store'

    def test_refusals_carry_them_too(self, raw_client):
        response = raw_client.get('/api/events', headers={'Host': 'evil.example'})
        assert response.headers['X-Frame-Options'] == 'DENY'

    def test_the_policy_only_runs_the_apps_own_scripts(self):
        policy = dict(part.split(' ', 1) for part in security.CONTENT_SECURITY_POLICY.split('; '))
        assert policy['script-src'] == "'self'"
        assert policy['connect-src'] == "'self'" and policy['object-src'] == "'none'"
        assert policy['frame-ancestors'] == "'none'"
