"""Speedcube Training Explorer.

Start it with:

    uv run app.py

or by double-clicking the launcher for your system ("Start Speedcube Training Explorer" .bat on
Windows, .command on a Mac, .sh on Linux), which does the same. That starts a small server on
this computer and opens the app in your browser. Your data is saved in
data/speedcube.db next to this file. The app stops by itself shortly after its last browser tab
is closed.
"""

import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

from flask import Response, jsonify
from werkzeug.serving import make_server

from speedcube import create_app

APP_NAME = 'speedcube-training-explorer'
HOST = '127.0.0.1'  # only reachable from this computer, since the API has no login
PORT = 8577
PROJECT_DIR = Path(__file__).resolve().parent
DATABASE = PROJECT_DIR / 'data' / 'speedcube.db'
SHORTCUT = PROJECT_DIR / 'Speedcube Training Explorer.lnk'
SHORTCUT_ICON = PROJECT_DIR / 'web' / 'images' / 'app-icon.ico'

# The app may be running without a terminal window, so it stops itself once no page is open.
STARTUP_WAIT = 120     # seconds to wait for the browser to open the first page
CLOSE_WAIT = 10        # seconds after the last page closes; long enough to survive a reload
KEEPALIVE_EVERY = 2    # seconds between keepalives, which is how a closed page gets noticed


class OpenPages:
    """Counts the pages holding a connection to /api/presence, and when the last one closed."""

    def __init__(self):
        self._lock = threading.Lock()
        self._count = 0
        self._seen_one = False
        self._empty_since = time.monotonic()

    def opened(self):
        with self._lock:
            self._count += 1
            self._seen_one = True

    def closed(self):
        with self._lock:
            self._count -= 1
            if self._count == 0:
                self._empty_since = time.monotonic()

    def unused(self):
        with self._lock:
            wait = CLOSE_WAIT if self._seen_one else STARTUP_WAIT
            return self._count == 0 and time.monotonic() - self._empty_since > wait


def add_lifetime_routes(app, pages):
    @app.get('/api/app')
    def which_app():
        return jsonify(app=APP_NAME)

    # Each open page keeps this event stream open. Writing to a closed page fails, which ends the
    # generator, so the count drops within KEEPALIVE_EVERY seconds of a tab closing.
    @app.get('/api/presence')
    def presence():
        def stream():
            pages.opened()
            try:
                while True:
                    yield ': open\n\n'
                    time.sleep(KEEPALIVE_EVERY)
            finally:
                pages.closed()
        return Response(stream(), mimetype='text/event-stream',
                        headers={'Cache-Control': 'no-store'})


def stop_when_unused(server, pages):
    while not pages.unused():
        time.sleep(1)
    server.shutdown()


def port_is_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((HOST, port))
        except OSError:
            return False
    return True


def already_running(url):
    try:
        with urllib.request.urlopen(f'{url}/api/app', timeout=2) as response:
            return json.load(response).get('app') == APP_NAME
    except (OSError, ValueError, AttributeError):
        return False


def make_shortcut():
    """On Windows, put a shortcut with the app's icon in the project folder. It starts the app
    through uvw, which opens no terminal window at all. A shortcut holds this computer's paths, so
    it can't come with the download; the .bat launcher does, and this runs on its first start."""
    uvw = shutil.which('uvw')
    if sys.platform != 'win32' or SHORTCUT.exists() or not uvw:
        return
    # Paths go in through the environment so quotes in a folder name can't break the script.
    script = (
        '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:SC_LINK); '
        "$s.TargetPath = $env:SC_UVW; $s.Arguments = 'run app.py'; "
        "$s.WorkingDirectory = $env:SC_DIR; $s.IconLocation = $env:SC_ICON + ',0'; "
        "$s.Description = 'Start Speedcube Training Explorer'; $s.Save()"
    )
    env = dict(os.environ, SC_LINK=str(SHORTCUT), SC_UVW=uvw, SC_DIR=str(PROJECT_DIR),
               SC_ICON=str(SHORTCUT_ICON))
    try:
        subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', script],
                       env=env, capture_output=True, timeout=60,
                       creationflags=subprocess.CREATE_NO_WINDOW)
    except (OSError, subprocess.SubprocessError):
        pass  # only a convenience; the .bat launcher still works without it


def main():
    usual_url = f'http://{HOST}:{PORT}'
    port_free = port_is_free(PORT)
    # Starting the app again while it's open (say, a double-click on the shortcut) just opens
    # another tab of the running one.
    if not port_free and already_running(usual_url):
        webbrowser.open(usual_url)
        return

    app = create_app(DATABASE)
    pages = OpenPages()
    add_lifetime_routes(app, pages)
    # Werkzeug logs every request by default; keep the console to warnings and errors.
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    # If the usual port is taken by another program, let the OS pick one.
    server = make_server(HOST, PORT if port_free else 0, app, threaded=True)
    url = f'http://{HOST}:{server.server_port}'

    # flush: when output is piped (e.g. an IDE's run console) it would otherwise sit in a buffer.
    print(f'\n  Speedcube Training Explorer is running at {url}\n'
          f'  Your data is saved in {DATABASE}\n'
          f'  The app stops by itself shortly after you close its last browser tab.\n',
          flush=True)

    threading.Thread(target=stop_when_unused, args=(server, pages), daemon=True).start()
    threading.Thread(target=make_shortcut, daemon=True).start()
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    print('Stopped.', flush=True)


if __name__ == '__main__':
    main()
