"""Shared test setup.

Every test gets the app on its own temporary database, and two guards run for every test: one
fails any attempt to open a database inside data/ (the owner's real training history), and one
fails any attempt to reach the internet. Tests that need WCA replies use `fake_wca`.
"""

import json
import urllib.request
from pathlib import Path

import pytest

import app as app_module
from helpers import FIXTURES, REAL_DATA
from speedcube import create_app, db, wca

# The real fetcher, kept so its own test can call it (with urlopen faked)
REAL_FETCH_JSON = wca._fetch_json


@pytest.fixture(autouse=True)
def protect_real_data(monkeypatch, tmp_path):
    """Make sure no test can read or change data/, even by accident: opening a database there
    fails the test, and app.py's DATABASE points at a temporary file instead."""
    real_connect = db.connect

    def guarded_connect(path):
        resolved = Path(path).resolve()
        if resolved == REAL_DATA or REAL_DATA in resolved.parents:
            raise AssertionError(f'A test tried to open the real data: {resolved}')
        conn = real_connect(path)
        # Test databases are thrown away, so skip waiting for the disk (much quicker on Windows)
        conn.execute('PRAGMA synchronous = OFF')
        return conn

    monkeypatch.setattr(db, 'connect', guarded_connect)
    monkeypatch.setattr(app_module, 'DATABASE', tmp_path / 'app-module.db')


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Tests never reach the real WCA APIs (or anything else). Anything that tries fails loudly
    rather than quietly depending on the internet."""
    def refuse(url, *args, **kwargs):
        raise AssertionError(f'A test tried to reach the network: {url}')

    monkeypatch.setattr(wca, '_real_fetch_json', REAL_FETCH_JSON, raising=False)
    monkeypatch.setattr(wca, '_fetch_json', refuse)
    monkeypatch.setattr(urllib.request, 'urlopen', refuse)


class FakeWCA:
    """Stands in for wca._fetch_json. `replies` maps the end of a URL (such as
    'rank/world/single/333.json' or 'persons/2003POCH01') to the JSON to return, or to an
    exception to raise. Every URL asked for is kept in `calls`."""

    def __init__(self):
        self.replies = {}
        self.calls = []

    def __call__(self, url):
        self.calls.append(url)
        for ending, reply in self.replies.items():
            if url.endswith(ending):
                if isinstance(reply, BaseException):
                    raise reply
                return reply
        raise OSError(f'No fake WCA reply for {url}')


@pytest.fixture
def fake_wca(monkeypatch):
    fake = FakeWCA()
    monkeypatch.setattr(wca, '_fetch_json', fake)
    return fake


@pytest.fixture
def app(tmp_path):
    return create_app(tmp_path / 'test.db')


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def conn(app):
    """A connection to the test app's database, for checking what the API stored."""
    connection = db.connect(app.config['DATABASE'])
    yield connection
    connection.close()


@pytest.fixture
def set_today(monkeypatch):
    """Freeze the app's idea of today's date (YYYY-MM-DD), without any extra library."""
    def freeze(iso_date):
        monkeypatch.setattr(db, 'today', lambda: iso_date)
    return freeze


@pytest.fixture
def cstimer_bytes():
    return (FIXTURES / 'cstimer_export.json').read_bytes()


@pytest.fixture
def cstimer_data(cstimer_bytes):
    return json.loads(cstimer_bytes)


@pytest.fixture
def backup_v3():
    return json.loads((FIXTURES / 'backup_v3.json').read_text(encoding='utf-8'))


@pytest.fixture
def backup_v2():
    return json.loads((FIXTURES / 'backup_v2.json').read_text(encoding='utf-8'))
