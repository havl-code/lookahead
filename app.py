"""Speedcube Training Explorer.

Start it with:

    uv run app.py

That starts a small server on this computer and opens the app in your browser. Your data is
saved in data/speedcube.db next to this file. Close the terminal window (or press Ctrl+C in it)
to stop the app.
"""

import logging
import socket
import webbrowser
from pathlib import Path

from werkzeug.serving import make_server

from speedcube import create_app

HOST = '127.0.0.1'  # only reachable from this computer, since the API has no login
PORT = 8577
DATABASE = Path(__file__).resolve().parent / 'data' / 'speedcube.db'


def port_is_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((HOST, port))
        except OSError:
            return False
    return True


def main():
    app = create_app(DATABASE)
    # Werkzeug logs every request by default; keep the console to warnings and errors.
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    # If the usual port is taken (another program, or the app is already open), let the OS pick one.
    server = make_server(HOST, PORT if port_is_free(PORT) else 0, app, threaded=True)
    url = f'http://{HOST}:{server.server_port}'

    # flush: when output is piped (e.g. an IDE's run console) it would otherwise sit in a buffer.
    print(f'\n  Speedcube Training Explorer is running at {url}\n'
          f'  Your data is saved in {DATABASE}\n'
          f'  Keep this window open while you use the app. Close it (or press Ctrl+C) to stop.\n',
          flush=True)

    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('Stopped.')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
