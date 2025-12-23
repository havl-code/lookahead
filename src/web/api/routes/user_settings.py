"""
User Settings API Routes
Handles WCA ID and user preferences
"""

from flask import Blueprint, jsonify, request
import requests
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / 'python'))
from training_logger import TrainingLogger

bp = Blueprint('user', __name__, url_prefix='/api')


@bp.route('/user/settings', methods=['GET'])
def get_user_settings():
    """Get user settings including WCA ID and name"""
    try:
        logger = TrainingLogger()
        logger.connect()
        
        # Check if user_settings table exists, if not create it
        cursor = logger.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                wca_id TEXT,
                wca_name TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        logger.conn.commit()
        
        # Get current settings
        cursor.execute("SELECT wca_id, wca_name FROM user_settings WHERE id = 1")
        result = cursor.fetchone()
        
        logger.disconnect()
        
        if result:
            return jsonify({
                'wca_id': result[0],
                'wca_name': result[1]
            })
        else:
            return jsonify({
                'wca_id': None,
                'wca_name': None
            })
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/user/settings', methods=['POST'])
def update_user_settings():
    """Update user settings - validate and fetch WCA name"""
    try:
        data = request.get_json()
        wca_id = data.get('wca_id', '').strip()
        
        if not wca_id:
            return jsonify({'error': 'WCA ID is required'}), 400
        
        # Fetch WCA name from official WCA API
        try:
            # Use the official WCA API to get person info
            url = f"https://www.worldcubeassociation.org/api/v0/persons/{wca_id}"
            headers = {'Accept': 'application/json'}
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 404:
                return jsonify({'error': 'WCA ID not found. Please check the ID and try again.'}), 404
            
            if response.status_code != 200:
                return jsonify({'error': 'Could not validate WCA ID. Please try again later.'}), 500
            
            person_data = response.json()
            wca_name = person_data.get('person', {}).get('name', '')
            
            if not wca_name:
                return jsonify({'error': 'Could not fetch name for this WCA ID'}), 500
                
        except requests.exceptions.Timeout:
            return jsonify({'error': 'Request timed out. Please try again.'}), 500
        except Exception as e:
            print(f"WCA API error: {e}")
            return jsonify({'error': 'Could not connect to WCA API. Please try again later.'}), 500
        
        # Save to database
        logger = TrainingLogger()
        logger.connect()
        
        cursor = logger.conn.cursor()
        
        # Create table if it doesn't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                wca_id TEXT,
                wca_name TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Insert or update
        cursor.execute("""
            INSERT INTO user_settings (id, wca_id, wca_name, updated_at)
            VALUES (1, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                wca_id = excluded.wca_id,
                wca_name = excluded.wca_name,
                updated_at = CURRENT_TIMESTAMP
        """, (wca_id, wca_name))
        
        logger.conn.commit()
        logger.disconnect()
        
        return jsonify({
            'success': True,
            'wca_id': wca_id,
            'wca_name': wca_name
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/user/settings', methods=['DELETE'])
def delete_user_settings():
    """Remove WCA ID from settings"""
    try:
        logger = TrainingLogger()
        logger.connect()
        
        cursor = logger.conn.cursor()
        cursor.execute("DELETE FROM user_settings WHERE id = 1")
        logger.conn.commit()
        logger.disconnect()
        
        return jsonify({'success': True})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500