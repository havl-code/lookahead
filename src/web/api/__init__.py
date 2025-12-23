"""
Flask API Application
Main app initialization and configuration
"""

from flask import Flask, send_from_directory
from flask_cors import CORS
from pathlib import Path


def create_app():
    """Create and configure Flask application"""
    # Get the correct path to static files
    static_folder = str(Path(__file__).parent.parent.parent.parent / 'src' / 'web')
    
    app = Flask(__name__, static_folder=static_folder, static_url_path='')
    CORS(app)
    
    # Register blueprints
    from .routes import stats, sessions, cubes, charts, imports, user_settings
    
    app.register_blueprint(stats.bp)
    app.register_blueprint(sessions.bp)
    app.register_blueprint(cubes.bp)
    app.register_blueprint(charts.bp)
    app.register_blueprint(imports.bp)
    app.register_blueprint(user_settings.bp)
    
    # Root route
    @app.route('/')
    def index():
        return send_from_directory(static_folder, 'index.html')
    
    return app