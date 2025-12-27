"""
Charts Data API Routes
"""

from flask import Blueprint, jsonify, request
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / 'python'))
from training_logger import TrainingLogger

bp = Blueprint('charts', __name__, url_prefix='/api/charts')


@bp.route('/progress', methods=['GET'])
def get_progress_chart():
    """Get progress data by event"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        
        query = """
        SELECT 
            date,
            best_single/1000.0 as best,
            session_mean/1000.0 as mean,
            ao5/1000.0 as ao5
        FROM training_sessions
        WHERE solve_count >= 5 AND event_id = ?
        ORDER BY date
        """
        
        with logger.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(event_id,))
        
        if len(df) < 1:
            return jsonify({'error': 'Need at least 1 session for this event'}), 400
        
        data = []
        for _, row in df.iterrows():
            data.append({
                'date': row['date'],
                'best': round(row['best'], 2) if pd.notna(row['best']) else None,
                'mean': round(row['mean'], 2) if pd.notna(row['mean']) else None,
                'ao5': round(row['ao5'], 2) if pd.notna(row['ao5']) else None
            })
        
        return jsonify({'data': data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/session-progress', methods=['GET'])
def get_session_progress():
    """Get progress within a single session"""
    try:
        session_id = request.args.get('session_id')
        
        if not session_id:
            return jsonify({'error': 'Missing session_id parameter'}), 400
        
        logger = TrainingLogger()
        
        query = """
        SELECT 
            solve_number,
            time_ms/1000.0 as time
        FROM personal_solves
        WHERE session_id = ? AND dnf = 0
        ORDER BY solve_number
        """
        
        with logger.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(int(session_id),))
        
        if len(df) < 1:
            return jsonify({'error': 'No solves in this session'}), 400
        
        data = []
        for i, row in df.iterrows():
            ao5 = None
            if i >= 4:
                ao5_times = df['time'].iloc[i-4:i+1].tolist()
                ao5_sorted = sorted(ao5_times)
                ao5 = sum(ao5_sorted[1:-1]) / 3
            
            running_mean = df['time'].iloc[:i+1].mean()
            
            data.append({
                'solve_number': int(row['solve_number']),
                'time': round(row['time'], 2),
                'mean': round(running_mean, 2),
                'ao5': round(ao5, 2) if ao5 else None
            })
        
        return jsonify({'data': data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/distribution', methods=['GET'])
def get_distribution_chart():
    """Get distribution data by event"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        
        query = """
        SELECT ps.time_ms/1000.0 as time 
        FROM personal_solves ps
        JOIN training_sessions ts ON ps.session_id = ts.id
        WHERE ps.dnf = 0 AND ts.event_id = ?
        ORDER BY ps.time_ms
        """
        
        with logger.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(event_id,))
        
        if len(df) < 5:
            return jsonify({'error': 'Need at least 5 solves'}), 400
        
        times = df['time'].tolist()
        
        mean = sum(times) / len(times)
        std_dev = (sum((x - mean) ** 2 for x in times) / len(times)) ** 0.5
        
        filtered_times = [t for t in times if abs(t - mean) <= 3 * std_dev]
        
        if len(filtered_times) < len(times) * 0.9:
            sorted_times = sorted(times)
            p1 = int(len(sorted_times) * 0.01)
            p99 = int(len(sorted_times) * 0.99)
            filtered_times = sorted_times[p1:p99]
        
        return jsonify({'times': filtered_times})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/session-distribution', methods=['GET'])
def get_session_distribution():
    """Get distribution for a single session"""
    try:
        session_id = request.args.get('session_id')
        
        logger = TrainingLogger()
        
        query = """
        SELECT time_ms/1000.0 as time 
        FROM personal_solves
        WHERE session_id = ? AND dnf = 0
        ORDER BY time_ms
        """
        
        with logger.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(int(session_id),))
        
        if len(df) < 5:
            return jsonify({'error': 'Need at least 5 solves'}), 400
        
        times = df['time'].tolist()
        
        mean = sum(times) / len(times)
        std_dev = (sum((x - mean) ** 2 for x in times) / len(times)) ** 0.5
        filtered_times = [t for t in times if abs(t - mean) <= 5 * std_dev]
        
        return jsonify({'times': filtered_times})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/rolling-average', methods=['GET'])
def get_rolling_average():
    """Get rolling average data by event"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        
        query = """
        SELECT ps.time_ms/1000.0 as time 
        FROM personal_solves ps
        JOIN training_sessions ts ON ps.session_id = ts.id
        WHERE ps.dnf = 0 AND ts.event_id = ?
        ORDER BY ps.timestamp
        """
        
        with logger.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(event_id,))
        
        if len(df) < 12:
            return jsonify({'error': 'Need at least 12 solves'}), 400
        
        times = df['time'].tolist()
        return jsonify({'times': times})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/session-rolling', methods=['GET'])
def get_session_rolling():
    """Get rolling average for a single session"""
    try:
        session_id = request.args.get('session_id')
        
        logger = TrainingLogger()
        
        query = """
        SELECT time_ms/1000.0 as time 
        FROM personal_solves
        WHERE session_id = ? AND dnf = 0
        ORDER BY solve_number
        """
        
        with logger.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(session_id,))
        
        if len(df) < 12:
            return jsonify({'error': 'Need at least 12 solves'}), 400
        
        times = df['time'].tolist()
        return jsonify({'times': times})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/consistency', methods=['GET'])
def get_consistency_chart():
    """Get consistency data across sessions"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        
        with logger.db_manager.get_connection() as conn:
            session_query = """
            SELECT id, date 
            FROM training_sessions
            WHERE event_id = ? AND solve_count >= 5
            ORDER BY date
            LIMIT 10
            """
            
            sessions = pd.read_sql_query(session_query, conn, params=(event_id,))
            
            result = []
            for _, session in sessions.iterrows():
                solve_query = """
                SELECT time_ms/1000.0 as time
                FROM personal_solves
                WHERE session_id = ? AND dnf = 0
                """
                solves = pd.read_sql_query(solve_query, conn, params=(int(session['id']),))
                
                if len(solves) >= 5:
                    result.append({
                        'date': session['date'],
                        'times': solves['time'].tolist()
                    })
        
        if len(result) < 2:
            return jsonify({'error': 'Need at least 2 sessions'}), 400
        
        return jsonify({'sessions': result})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500