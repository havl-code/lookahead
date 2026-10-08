"""Speedcube Training Explorer backend: a small Flask app that serves the web UI (web/) and
the JSON API it talks to (/api/...), storing everything in a local SQLite file."""

import mimetypes
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from . import db, security
from .api import api

WEB_DIR = Path(__file__).resolve().parent.parent / 'web'

# Content types come from the operating system, and some Windows setups map these to the wrong
# thing (e.g. .js as text/plain) or not at all, so set the ones the web page needs.
for mime_type, extension in (
    ('text/javascript', '.js'), ('text/css', '.css'), ('font/woff2', '.woff2'),
):
    mimetypes.add_type(mime_type, extension)


# The biggest upload (a CSTimer export or a backup) the app accepts. Even a huge history of
# 100,000 solves is a few tens of MB, so this only stops a mistake, like the wrong file.
MAX_UPLOAD_MB = 128


def create_app(database_path, port=None):
    """The app, storing its data in `database_path`. `port` is the one it's served on, which
    the security checks use (app.py sets it once the server has picked one)."""
    app = Flask(__name__, static_folder=WEB_DIR, static_url_path='')
    app.config['DATABASE'] = Path(database_path)
    app.config['PORT'] = port
    app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_MB * 1024 * 1024
    db.init_app(app)
    security.init_app(app)
    app.register_blueprint(api, url_prefix='/api')

    @app.get('/')
    def index():
        return send_from_directory(WEB_DIR, 'index.html')

    # The UI expects JSON errors from the API, so don't hand it Flask's HTML error pages.
    # This also catches unhandled exceptions, which Flask turns into a 500 and logs first.
    @app.errorhandler(HTTPException)
    def api_error(e):
        if not request.path.startswith('/api/'):
            return e
        if e.code == 500:
            message = 'An unexpected error occurred'
        elif e.code == 413:
            message = f'That file is too big (the limit is {MAX_UPLOAD_MB} MB).'
        else:
            message = e.name
        return jsonify(error=message), e.code

    return app
