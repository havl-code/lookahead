"""
Speedcube Training Explorer - Web Server
Entry point for Flask application
"""

import sys
from pathlib import Path

# Add src/web/api to path
sys.path.insert(0, str(Path(__file__).parent / 'src' / 'web' / 'api'))

from __init__ import create_app

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