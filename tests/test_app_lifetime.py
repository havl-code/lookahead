"""app.py: starting up, the "already running" check, staying alive while a page is open, and
the Windows-only helpers. Nothing here starts a real server, browser, or shortcut."""

import io
import json
import shutil
import socket
import subprocess
import sys
import types
import webbrowser

import pytest

import app as app_module
from speedcube import create_app


# ---- Ports and the "already running" check ----

def test_a_taken_port_is_not_free():
    with socket.socket() as busy:
        busy.bind((app_module.HOST, 0))
        busy.listen()
        assert app_module.port_is_free(busy.getsockname()[1]) is False


def test_a_free_port_is_free():
    with socket.socket() as probe:
        probe.bind((app_module.HOST, 0))
        port = probe.getsockname()[1]
    assert app_module.port_is_free(port) is True


def serve_app_info(monkeypatch, info):
    monkeypatch.setattr('urllib.request.urlopen',
                        lambda url, timeout: io.BytesIO(json.dumps(info).encode()))


def this_copy(**changes):
    return {'app': app_module.APP_NAME, 'database': str(app_module.DATABASE), 'version': 'v1',
            'stale': False, **changes}


def test_already_running_when_it_is_this_copy(monkeypatch):
    serve_app_info(monkeypatch, this_copy())
    assert app_module.already_running('http://127.0.0.1:8577', 'v1') is True


@pytest.mark.parametrize('info', [
    this_copy(database='/somewhere/else.db'),
    this_copy(version='v2'),
    this_copy(stale=True),
    {'hello': 'another program'},
    ['not', 'a', 'dict'],
])
def test_not_running_when_it_is_something_else(monkeypatch, info):
    serve_app_info(monkeypatch, info)
    assert app_module.already_running('http://127.0.0.1:8577', 'v1') is False


@pytest.mark.parametrize('error', [OSError('refused'), ValueError('not JSON')])
def test_not_running_when_nothing_answers(monkeypatch, error):
    def fail(url, timeout):
        raise error
    monkeypatch.setattr('urllib.request.urlopen', fail)
    assert app_module.already_running('http://127.0.0.1:8577', 'v1') is False


# ---- Code version ----

@pytest.fixture
def code_copy(tmp_path, monkeypatch):
    """A copy of the server's code that code_version() reads instead of the real files."""
    project = tmp_path / 'project'
    (project / 'speedcube').mkdir(parents=True)
    shutil.copy(app_module.PROJECT_DIR / 'app.py', project / 'app.py')
    for path in (app_module.PROJECT_DIR / 'speedcube').glob('*.py'):
        shutil.copy(path, project / 'speedcube' / path.name)
    shutil.copy(app_module.PROJECT_DIR / 'speedcube' / 'wca_reference.json', project / 'speedcube')
    monkeypatch.setattr(app_module, 'PROJECT_DIR', project)
    return project


def test_code_version_is_stable(code_copy):
    assert app_module.code_version() == app_module.code_version()
    assert len(app_module.code_version()) == 16


def test_code_version_changes_with_the_code(code_copy):
    before = app_module.code_version()
    (code_copy / 'speedcube' / 'stats.py').write_text('# changed\n', encoding='utf-8')
    assert app_module.code_version() != before


def test_code_version_with_a_file_missing(code_copy):
    (code_copy / 'speedcube' / 'wca_reference.json').unlink()
    assert app_module.code_version() == 'unknown'


# ---- /api/app and /api/presence ----

@pytest.fixture
def lifetime(tmp_path):
    flask_app = create_app(tmp_path / 'lifetime.db')
    pages = app_module.OpenPages()
    app_module.add_lifetime_routes(flask_app, pages, 'v1')
    return flask_app.test_client(), pages


def test_api_app_identifies_this_copy(lifetime, monkeypatch):
    client, _ = lifetime
    monkeypatch.setattr(app_module, 'code_version', lambda: 'v1')
    assert client.get('/api/app').get_json() == {
        'app': app_module.APP_NAME, 'database': str(app_module.DATABASE), 'version': 'v1',
        'stale': False}


def test_api_app_says_when_the_code_has_changed(lifetime, monkeypatch):
    client, _ = lifetime
    monkeypatch.setattr(app_module, 'code_version', lambda: 'v2')
    assert client.get('/api/app').get_json()['stale'] is True


def test_presence_counts_open_pages(lifetime):
    client, pages = lifetime
    response = client.get('/api/presence', buffered=False)
    assert response.content_type.startswith('text/event-stream')
    assert response.headers['Cache-Control'] == 'no-store'
    assert next(iter(response.response)) == b': open\n\n'
    assert pages._count == 1
    response.close()
    assert pages._count == 0


# ---- Stopping when unused ----

@pytest.fixture
def fake_clock(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(app_module, 'time', types.SimpleNamespace(
        monotonic=lambda: now[0], sleep=lambda seconds: None))
    return now


def test_waits_for_the_first_page(fake_clock):
    pages = app_module.OpenPages()
    fake_clock[0] += app_module.STARTUP_WAIT - 1
    assert pages.unused() is False
    fake_clock[0] += 2
    assert pages.unused() is True


def test_stays_up_while_a_page_is_open(fake_clock):
    pages = app_module.OpenPages()
    pages.opened()
    fake_clock[0] += 10_000
    assert pages.unused() is False


def test_stops_a_little_after_the_last_page_closes(fake_clock):
    pages = app_module.OpenPages()
    pages.opened()
    pages.opened()
    pages.closed()
    fake_clock[0] += 10_000
    assert pages.unused() is False  # one page is still open
    pages.closed()
    fake_clock[0] += app_module.CLOSE_WAIT - 1
    assert pages.unused() is False  # long enough to survive a reload
    fake_clock[0] += 2
    assert pages.unused() is True


def test_stop_when_unused_shuts_the_server_down(fake_clock):
    class Pages:
        checks = 0

        def unused(self):
            self.checks += 1
            return self.checks >= 3

    class Server:
        stopped = False

        def shutdown(self):
            self.stopped = True

    server, pages = Server(), Pages()
    app_module.stop_when_unused(server, pages)
    assert server.stopped and pages.checks == 3


# ---- Windows-only helpers (mocked, so they're tested on every system) ----

@pytest.fixture
def windows(monkeypatch, tmp_path):
    """Pretend to be Windows: the platform, the Windows-only subprocess flags, and a Python
    with a pythonw.exe next to it."""
    monkeypatch.setattr(sys, 'platform', 'win32')
    for name, value in (('DETACHED_PROCESS', 0x8), ('CREATE_NEW_PROCESS_GROUP', 0x200),
                        ('CREATE_NO_WINDOW', 0x08000000)):
        monkeypatch.setattr(subprocess, name, value, raising=False)
    (tmp_path / 'pythonw.exe').write_bytes(b'')
    monkeypatch.setattr(sys, 'executable', str(tmp_path / 'python.exe'))
    return tmp_path


def test_leave_console_window_only_on_windows(monkeypatch):
    monkeypatch.setattr(sys, 'platform', 'linux')
    monkeypatch.setenv(app_module.LAUNCHER_ENV, 'windows')
    assert app_module.leave_console_window() is False


def test_leave_console_window_only_from_the_launcher(windows, monkeypatch):
    monkeypatch.delenv(app_module.LAUNCHER_ENV, raising=False)
    assert app_module.leave_console_window() is False


def test_leave_console_window_restarts_with_pythonw(windows, monkeypatch):
    monkeypatch.setenv(app_module.LAUNCHER_ENV, 'windows')
    started = []
    monkeypatch.setattr(subprocess, 'Popen', lambda args, **kwargs: started.append((args, kwargs)))
    assert app_module.leave_console_window() is True
    (args, kwargs), = started
    assert args == [str(windows / 'pythonw.exe'), str(app_module.PROJECT_DIR / 'app.py')]
    assert app_module.LAUNCHER_ENV not in kwargs['env']  # so the new copy doesn't do it again
    assert kwargs['stdin'] == kwargs['stdout'] == kwargs['stderr'] == subprocess.DEVNULL


def test_leave_console_window_without_pythonw(windows, monkeypatch):
    monkeypatch.setenv(app_module.LAUNCHER_ENV, 'windows')
    (windows / 'pythonw.exe').unlink()
    assert app_module.leave_console_window() is False


def test_leave_console_window_carries_on_if_it_cant_restart(windows, monkeypatch):
    monkeypatch.setenv(app_module.LAUNCHER_ENV, 'windows')

    def fail(*args, **kwargs):
        raise OSError('blocked')
    monkeypatch.setattr(subprocess, 'Popen', fail)
    assert app_module.leave_console_window() is False


@pytest.fixture
def shortcut(windows, monkeypatch, tmp_path):
    runs = []
    monkeypatch.setattr(app_module, 'SHORTCUT', tmp_path / 'Lookahead.lnk')
    monkeypatch.setattr(shutil, 'which', lambda name: r'C:\uv\uvw.exe' if name == 'uvw' else None)
    monkeypatch.setattr(subprocess, 'run', lambda args, **kwargs: runs.append((args, kwargs)))
    return runs


def test_make_shortcut_runs_powershell_with_paths_in_the_environment(shortcut):
    app_module.make_shortcut()
    (args, kwargs), = shortcut
    assert args[:4] == ['powershell', '-NoProfile', '-NonInteractive', '-Command']
    assert kwargs['env']['SC_UVW'] == r'C:\uv\uvw.exe'
    assert kwargs['env']['SC_LINK'] == str(app_module.SHORTCUT)
    assert kwargs['env']['SC_DIR'] == str(app_module.PROJECT_DIR)


def test_make_shortcut_leaves_an_existing_one(shortcut):
    app_module.SHORTCUT.write_bytes(b'')
    app_module.make_shortcut()
    assert shortcut == []


def test_make_shortcut_needs_uvw(shortcut, monkeypatch):
    monkeypatch.setattr(shutil, 'which', lambda name: None)
    app_module.make_shortcut()
    assert shortcut == []


def test_make_shortcut_only_on_windows(shortcut, monkeypatch):
    monkeypatch.setattr(sys, 'platform', 'darwin')
    app_module.make_shortcut()
    assert shortcut == []


def test_make_shortcut_failing_is_harmless(windows, monkeypatch, tmp_path):
    monkeypatch.setattr(app_module, 'SHORTCUT', tmp_path / 'x.lnk')
    monkeypatch.setattr(shutil, 'which', lambda name: 'uvw')

    def fail(*args, **kwargs):
        raise subprocess.TimeoutExpired('powershell', 60)
    monkeypatch.setattr(subprocess, 'run', fail)
    app_module.make_shortcut()  # no exception


# ---- main() ----

class FakeServer:
    def __init__(self, port):
        self.server_port = port
        self.closed = False

    def serve_forever(self):
        raise KeyboardInterrupt  # as if the user pressed Ctrl+C straight away

    def server_close(self):
        self.closed = True

    def shutdown(self):
        pass


@pytest.fixture
def started(monkeypatch):
    """Runs main() with everything outside the process faked; returns what it did."""
    record = {'opened': [], 'threads': [], 'server': None}
    monkeypatch.setattr(app_module, 'leave_console_window', lambda: False)
    monkeypatch.setattr(app_module, 'code_version', lambda: 'v1')
    monkeypatch.setattr(webbrowser, 'open', record['opened'].append)

    def make_server(host, port, app, threaded):
        record.update(host=host, port=port, app=app, server=FakeServer(port or 51234))
        return record['server']
    monkeypatch.setattr(app_module, 'make_server', make_server)

    class Thread:
        def __init__(self, target, args=(), daemon=None):
            record['threads'].append(target.__name__)

        def start(self):
            pass
    monkeypatch.setattr(app_module.threading, 'Thread', Thread)
    return record


def test_main_serves_on_the_usual_port_and_opens_the_browser(started, monkeypatch):
    monkeypatch.setattr(app_module, 'port_is_free', lambda port: True)
    app_module.main()
    assert (started['host'], started['port']) == ('127.0.0.1', 8577)
    assert started['opened'] == ['http://127.0.0.1:8577']
    assert started['app'].config['DATABASE'] == app_module.DATABASE  # temporary in tests
    assert started['app'].config['PORT'] == 8577  # for the security checks
    assert sorted(started['threads']) == ['make_shortcut', 'stop_when_unused']
    assert started['server'].closed


def test_main_opens_another_tab_of_a_running_copy(started, monkeypatch):
    monkeypatch.setattr(app_module, 'port_is_free', lambda port: False)
    monkeypatch.setattr(app_module, 'already_running', lambda url, version: True)
    app_module.main()
    assert started['opened'] == ['http://127.0.0.1:8577']
    assert started['server'] is None


def test_main_picks_another_port_when_the_usual_one_is_taken(started, monkeypatch):
    monkeypatch.setattr(app_module, 'port_is_free', lambda port: False)
    monkeypatch.setattr(app_module, 'already_running', lambda url, version: False)
    app_module.main()
    assert started['port'] == 0
    assert started['opened'] == ['http://127.0.0.1:51234']
    assert started['app'].config['PORT'] == 51234  # the port the OS picked


def test_main_hands_over_to_pythonw(started, monkeypatch):
    monkeypatch.setattr(app_module, 'leave_console_window', lambda: True)
    app_module.main()
    assert started['server'] is None and started['opened'] == []
