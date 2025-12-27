"""
Sessions and Solves API Routes
"""

from flask import Blueprint, jsonify, request
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / 'python'))
from training_logger import TrainingLogger

bp = Blueprint('sessions', __name__, url_prefix='/api')


@bp.route('/sessions', methods=['GET'])
def get_sessions():
    """Get all training sessions"""
    try:
        logger = TrainingLogger()
        with logger.db_manager.get_connection() as conn:
            sessions = logger.get_all_sessions()
        
        sessions_dict = sessions.to_dict('records')
        for session in sessions_dict:
            for key, value in session.items():
                if pd.isna(value):
                    session[key] = None
                elif isinstance(value, float):
                    session[key] = round(value, 2)
        
        return jsonify(sessions_dict)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a session"""
    try:
        logger = TrainingLogger()
        with logger.db_manager.get_connection() as conn:
            logger.delete_session(session_id)
            conn.commit()
        
        return jsonify({'success': True, 'message': 'Session deleted'})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/sessions/add', methods=['POST'])
def add_session():
    """Add a new session"""
    try:
        data = request.json
        event_id = data.get('event_id', '333')
        cube_id = data.get('cube_id')
        notes = data.get('notes', '')
        
        logger = TrainingLogger()
        with logger.db_manager.get_connection() as conn:
            session_id = logger.create_session(event_id, notes, cube_id)
            conn.commit()
        
        return jsonify({'success': True, 'session_id': session_id})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/sessions/<int:session_id>/solves', methods=['GET'])
def get_session_solves(session_id):
    """Get all solves for a session"""
    try:
        logger = TrainingLogger()
        
        query = """
        SELECT id, solve_number, 
               CASE WHEN dnf = 1 THEN NULL ELSE time_ms/1000.0 END as time_seconds,
               scramble, penalty, notes, timestamp
        FROM personal_solves
        WHERE session_id = ?
        ORDER BY solve_number
        """
        
        with logger.db_manager.get_connection() as conn:
            solves = pd.read_sql_query(query, conn, params=(session_id,))
        
        solves_dict = solves.to_dict('records')
        for solve in solves_dict:
            for key, value in solve.items():
                if pd.isna(value):
                    solve[key] = None
                elif isinstance(value, float) and key == 'time_seconds':
                    solve[key] = round(value, 2)
        
        return jsonify(solves_dict)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/sessions/<int:session_id>/solves/add', methods=['POST'])
def add_solve(session_id):
    """Add a solve to a session"""
    try:
        data = request.json
        time_seconds = data.get('time_seconds')
        scramble = data.get('scramble', '')
        penalty = data.get('penalty')
        notes = data.get('notes', '')
        
        logger = TrainingLogger()
        with logger.db_manager.get_connection() as conn:
            logger.add_solve(session_id, time_seconds, scramble, penalty, notes)
            logger.update_session_stats(session_id)
            conn.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/solves/<int:solve_id>', methods=['DELETE'])
def delete_solve(solve_id):
    """Delete a solve"""
    try:
        logger = TrainingLogger()
        
        with logger.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT session_id FROM personal_solves WHERE id = ?", (solve_id,))
            result = cursor.fetchone()
            
            if result:
                session_id = result[0]
                logger.delete_solve(solve_id)
                logger.update_session_stats(session_id)
                conn.commit()
        
        return jsonify({'success': True, 'message': 'Solve deleted'})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500