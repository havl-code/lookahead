"""
Timer API Routes - Fixed for database locking
"""

from flask import Blueprint, jsonify, request
import sys
from pathlib import Path
from datetime import datetime
import traceback

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / 'python'))
from training_logger import TrainingLogger

bp = Blueprint('timer', __name__, url_prefix='/api/timer')


@bp.route('/session', methods=['POST'])
def create_timer_session():
    """Create a new timer session"""
    try:
        data = request.get_json()
        event_id = data.get('event_id', '333')
        
        logger = TrainingLogger()
        with logger.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO training_sessions (event_id, date, notes)
                VALUES (?, ?, ?)
            """, (event_id, datetime.now().strftime('%Y-%m-%d'), 'Live timer session'))
            
            session_id = cursor.lastrowid
            conn.commit()
        
        return jsonify({
            'success': True,
            'session_id': session_id
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/solve', methods=['POST'])
def save_timer_solve():
    """Save a solve from the timer"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        time = data.get('time')
        scramble = data.get('scramble', '')
        penalty = data.get('penalty', '')
        dnf = data.get('dnf', False)
        
        if not session_id or time is None:
            return jsonify({'error': 'Missing required fields'}), 400
        
        logger = TrainingLogger()
        with logger.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get current solve count
            cursor.execute("""
                SELECT COUNT(*) FROM personal_solves WHERE session_id = ?
            """, (session_id,))
            
            solve_number = cursor.fetchone()[0] + 1
            
            # Convert time to milliseconds
            time_ms = int(time * 1000)
            
            # Insert solve
            cursor.execute("""
                INSERT INTO personal_solves 
                (session_id, solve_number, time_ms, scramble, penalty, dnf, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (session_id, solve_number, time_ms, scramble, penalty, 1 if dnf else 0, 
                  datetime.now().isoformat()))
            
            solve_id = cursor.lastrowid
            
            # Update session statistics
            _update_session_stats(cursor, session_id)
            
            conn.commit()
        
        return jsonify({
            'success': True,
            'solve_id': solve_id
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/solve/<int:solve_id>', methods=['DELETE'])
def delete_timer_solve(solve_id):
    """Delete a solve"""
    try:
        logger = TrainingLogger()
        with logger.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get session_id before deleting
            cursor.execute("SELECT session_id FROM personal_solves WHERE id = ?", (solve_id,))
            result = cursor.fetchone()
            
            if not result:
                return jsonify({'error': 'Solve not found'}), 404
            
            session_id = result[0]
            
            # Delete solve
            cursor.execute("DELETE FROM personal_solves WHERE id = ?", (solve_id,))
            
            # Update session statistics
            _update_session_stats(cursor, session_id)
            
            conn.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/solve/<int:solve_id>/penalty', methods=['PUT'])
def update_solve_penalty(solve_id):
    """Update solve penalty"""
    try:
        data = request.get_json()
        new_penalty = data.get('penalty', 'OK')
        
        logger = TrainingLogger()
        with logger.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get current solve
            cursor.execute("""
                SELECT session_id, time_ms FROM personal_solves WHERE id = ?
            """, (solve_id,))
            
            result = cursor.fetchone()
            if not result:
                return jsonify({'error': 'Solve not found'}), 404
            
            session_id, base_time = result
            
            # Calculate new dnf status
            new_dnf = 1 if new_penalty == 'DNF' else 0
            
            # Update solve
            cursor.execute("""
                UPDATE personal_solves
                SET penalty = ?, dnf = ?
                WHERE id = ?
            """, (new_penalty, new_dnf, solve_id))
            
            # Update session stats
            _update_session_stats(cursor, session_id)
            
            conn.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/session/<int:session_id>/solves', methods=['GET'])
def get_session_solves(session_id):
    """Get all solves for a session"""
    try:
        logger = TrainingLogger()
        with logger.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, time_ms, penalty, dnf, scramble
                FROM personal_solves
                WHERE session_id = ?
                ORDER BY solve_number DESC
            """, (session_id,))
            
            solves = []
            for row in cursor.fetchall():
                base_time = row[1] / 1000.0
                penalty = row[2] or 'OK'
                dnf = bool(row[3])
                scramble = row[4] or ''
                
                # Apply penalty to time
                final_time = base_time
                if penalty == '+2' and not dnf:
                    final_time += 2
                
                solves.append({
                    'id': row[0],
                    'time': final_time,
                    'penalty': penalty,
                    'dnf': dnf,
                    'scramble': scramble
                })
        
        return jsonify({'solves': solves})
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def _update_session_stats(cursor, session_id):
    """Update session statistics after adding/removing solves"""
    
    # Get all non-DNF solves with penalties
    cursor.execute("""
        SELECT time_ms, penalty
        FROM personal_solves
        WHERE session_id = ? AND dnf = 0
        ORDER BY solve_number
    """, (session_id,))
    
    rows = cursor.fetchall()
    times = []
    for row in rows:
        base_time = row[0]
        penalty = row[1] or 'OK'
        if penalty == '+2':
            times.append(base_time + 2000)
        else:
            times.append(base_time)
    
    # Get total solve count including DNFs
    cursor.execute("""
        SELECT COUNT(*) FROM personal_solves WHERE session_id = ?
    """, (session_id,))
    solve_count = cursor.fetchone()[0]
    
    if not times:
        cursor.execute("""
            UPDATE training_sessions
            SET solve_count = ?,
                best_single = NULL,
                session_mean = NULL,
                ao5 = NULL,
                ao12 = NULL
            WHERE id = ?
        """, (solve_count, session_id))
        return
    
    best_single = min(times)
    session_mean = sum(times) / len(times)
    
    # Calculate Ao5
    ao5 = None
    if len(times) >= 5:
        last_5 = sorted(times[-5:])
        ao5 = sum(last_5[1:4]) / 3
    
    # Calculate Ao12
    ao12 = None
    if len(times) >= 12:
        last_12 = sorted(times[-12:])
        ao12 = sum(last_12[1:11]) / 10
    
    # Update session
    cursor.execute("""
        UPDATE training_sessions
        SET solve_count = ?,
            best_single = ?,
            session_mean = ?,
            ao5 = ?,
            ao12 = ?
        WHERE id = ?
    """, (solve_count, best_single, int(session_mean), 
          int(ao5) if ao5 else None, int(ao12) if ao12 else None, session_id))