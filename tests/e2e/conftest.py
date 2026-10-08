"""Browser tests: the app served on a temporary database, driven in Chromium by Playwright.

They only run when asked for (`uv run --group e2e pytest -m e2e`), and are skipped quietly when
Playwright isn't installed, so the everyday `uv run pytest` stays fast. The first time, the
browser itself needs downloading once: `uv run --group e2e playwright install chromium`.
"""

import importlib.util
import threading

import pytest
from werkzeug.serving import make_server

import app as app_module
from speedcube import create_app, wca

PLAYWRIGHT_INSTALLED = importlib.util.find_spec('playwright') is not None
if not PLAYWRIGHT_INSTALLED:
    collect_ignore_glob = ['test_*.py']


def pytest_report_header(config):
    if not PLAYWRIGHT_INSTALLED and 'e2e' in (config.getoption('-m') or ''):
        return 'Playwright is not installed: run `uv run --group e2e pytest -m e2e`'


@pytest.fixture(autouse=True)
def offline_wca(monkeypatch):
    """The browser tests run as if there's no internet, so the Dashboard's world rank shows
    No data. A test that wants rankings asks for fake_wca, which replaces this."""
    def offline(url):
        raise OSError('no internet in the browser tests')
    monkeypatch.setattr(wca, '_fetch_json', offline)


@pytest.fixture
def live_app(tmp_path):
    """The real app (with app.py's lifetime routes) on a temporary database and a free port.
    Yields the Flask app, with its address in app.config['BASE_URL']."""
    flask_app = create_app(tmp_path / 'e2e.db')
    app_module.add_lifetime_routes(flask_app, app_module.OpenPages(), app_module.code_version())
    server = make_server('127.0.0.1', 0, flask_app, threaded=True)
    flask_app.config['PORT'] = server.server_port
    flask_app.config['BASE_URL'] = f'http://127.0.0.1:{server.server_port}'
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield flask_app
    server.shutdown()
    server.server_close()


@pytest.fixture
def app_page(live_app, page):
    """A page with the app open on the Dashboard, a fake clock (so timers and inspection can be
    fast-forwarded), native dialogs accepted and recorded, and console errors collected."""
    page.dialogs = []
    page.errors = []

    def on_dialog(dialog):
        page.dialogs.append(f'{dialog.type}: {dialog.message}')
        dialog.accept()

    page.on('dialog', on_dialog)
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    # Anything the Content-Security-Policy blocks shows up as an error, so tests notice
    page.add_init_script("document.addEventListener('securitypolicyviolation', e => "
                         "console.error(`CSP blocked ${e.violatedDirective}: ${e.blockedURI}`))")
    page.clock.install()
    page.goto(live_app.config['BASE_URL'])
    page.wait_for_function("() => document.getElementById('stat-solves').textContent !== '--'")
    return page

