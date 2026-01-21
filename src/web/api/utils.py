"""
API Utilities
Common error handling and helper functions
"""

from functools import wraps
from flask import jsonify


def handle_api_errors(f):
    """Decorator to standardize API error handling"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
        except FileNotFoundError as e:
            return jsonify({'error': 'File not found'}), 404
        except Exception as e:
            # Log error server-side only, return generic message to client
            return jsonify({'error': 'An error occurred processing your request'}), 500
    return decorated_function
