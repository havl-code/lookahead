"""
Speedcube Training Explorer - Web Server
Entry point for Flask application
"""

import sys
from pathlib import Path

project_root = str(Path(__file__).parent)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from src.web.api import create_app

if __name__ == '__main__':
    app = create_app()
    
    print("="*60)
    print("SPEEDCUBE TRAINING EXPLORER - WEB SERVER")
    print("="*60)
    print("\nStarting server...")
    print("Open your browser to: http://localhost:5000")
    print("\nPress Ctrl+C to stop the server")
    print("="*60)
    
    app.run(debug=True, host='0.0.0.0', port=5000)