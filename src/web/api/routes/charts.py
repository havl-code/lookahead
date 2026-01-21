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
        LIMIT 500
        """
        
        with logger.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(event_id,))
        
        if len(df) < 1:
            return jsonify({'error': 'Need at least 1 session for this event'}), 400
        
        # Convert to list efficiently using pandas
        data = df.where(pd.notna(df), None).to_dict('records')
        
        # Round numeric values
        for row in data:
            for key in ['best', 'mean', 'ao5']:
                if row[key] is not None:
                    row[key] = round(row[key], 2)
        
        return jsonify({'data': data})
    except Exception as e:
        return jsonify({'error': 'An error occurred loading chart data'}), 500


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
        LIMIT 1000
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
        return jsonify({'error': 'An error occurred loading chart data'}), 500


@bp.route('/distribution', methods=['GET'])
def get_distribution_chart():
    """Get distribution data by event with outlier filtering"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        
        query = """
        SELECT ps.time_ms/1000.0 as time 
        FROM personal_solves ps
        JOIN training_sessions ts ON ps.session_id = ts.id
        WHERE ps.dnf = 0 AND ts.event_id = ?
        ORDER BY ps.time_ms
        LIMIT 10000
        """
        
        with logger.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(event_id,))
        
        if len(df) < 5:
            return jsonify({'error': 'Need at least 5 solves'}), 400
        
        times = df['time'].tolist()
        
        # Calculate statistics using pandas (more efficient)
        mean = df['time'].mean()
        std_dev = df['time'].std()
        
        # Filter outliers: 3 standard deviations or percentile-based
        if std_dev > 0:
            filtered_df = df[(df['time'] >= mean - 3 * std_dev) & (df['time'] <= mean + 3 * std_dev)]
            filtered_times = filtered_df['time'].tolist()
            
            # If too many outliers removed, use percentile method
            if len(filtered_times) < len(times) * 0.9:
                p1 = df['time'].quantile(0.01)
                p99 = df['time'].quantile(0.99)
                filtered_df = df[(df['time'] >= p1) & (df['time'] <= p99)]
                filtered_times = filtered_df['time'].tolist()
        else:
            filtered_times = times
        
        return jsonify({'times': filtered_times})
    except Exception as e:
        return jsonify({'error': 'An error occurred loading distribution data'}), 500


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
        return jsonify({'error': 'An error occurred loading session distribution data'}), 500


@bp.route('/rolling-average', methods=['GET'])
def get_rolling_average():
    """Get rolling average data by event with pre-calculated rolling averages"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        
        query = """
        SELECT ps.time_ms/1000.0 as time 
        FROM personal_solves ps
        JOIN training_sessions ts ON ps.session_id = ts.id
        WHERE ps.dnf = 0 AND ts.event_id = ?
        ORDER BY ps.timestamp DESC
        LIMIT 1000
        """
        
        with logger.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(event_id,))
        
        if len(df) < 12:
            return jsonify({'error': 'Need at least 12 solves'}), 400
        
        # Reverse to get chronological order (query returns DESC)
        times = df['time'].tolist()
        times.reverse()
        
        # Calculate rolling averages on backend
        rolling5 = []
        rolling12 = []
        
        for i in range(len(times)):
            if i >= 4:
                slice5 = times[i-4:i+1]
                rolling5.append(sum(slice5) / 5)
            else:
                rolling5.append(None)
            
            if i >= 11:
                slice12 = times[i-11:i+1]
                rolling12.append(sum(slice12) / 12)
            else:
                rolling12.append(None)
        
        return jsonify({
            'times': times,
            'rolling5': rolling5,
            'rolling12': rolling12
        })
    except Exception as e:
        return jsonify({'error': 'An error occurred loading rolling average data'}), 500


@bp.route('/session-rolling', methods=['GET'])
def get_session_rolling():
    """Get rolling average for a single session with pre-calculated rolling averages"""
    try:
        session_id = request.args.get('session_id')
        
        logger = TrainingLogger()
        
        query = """
        SELECT time_ms/1000.0 as time 
        FROM personal_solves
        WHERE session_id = ? AND dnf = 0
        ORDER BY solve_number
        LIMIT 1000
        """
        
        with logger.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(session_id,))
        
        if len(df) < 12:
            return jsonify({'error': 'Need at least 12 solves'}), 400
        
        times = df['time'].tolist()
        
        # Calculate rolling averages on backend
        rolling5 = []
        rolling12 = []
        
        for i in range(len(times)):
            if i >= 4:
                slice5 = times[i-4:i+1]
                rolling5.append(sum(slice5) / 5)
            else:
                rolling5.append(None)
            
            if i >= 11:
                slice12 = times[i-11:i+1]
                rolling12.append(sum(slice12) / 12)
            else:
                rolling12.append(None)
        
        return jsonify({
            'times': times,
            'rolling5': rolling5,
            'rolling12': rolling12
        })
    except Exception as e:
        return jsonify({'error': 'An error occurred loading session rolling average data'}), 500


@bp.route('/consistency', methods=['GET'])
def get_consistency_chart():
    """Get consistency data across sessions"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        
        with logger.db_manager.get_connection() as conn:
            # Single query to get all data at once (fixes N+1 problem)
            query = """
            SELECT 
                ts.id as session_id,
                ts.date,
                ps.time_ms/1000.0 as time
            FROM training_sessions ts
            INNER JOIN personal_solves ps ON ts.id = ps.session_id
            WHERE ts.event_id = ? 
                AND ts.solve_count >= 5
                AND ps.dnf = 0
            ORDER BY ts.date, ps.solve_number
            LIMIT 1000
            """
            
            df = pd.read_sql_query(query, conn, params=(event_id,))
            
            if len(df) == 0:
                return jsonify({'error': 'Need at least 2 sessions'}), 400
            
            # Group by session and convert to list format
            result = []
            for session_id, group in df.groupby('session_id'):
                times = group['time'].tolist()
                if len(times) >= 5:
                    result.append({
                        'date': group['date'].iloc[0],
                        'times': times
                    })
            
            # Limit to 10 most recent sessions
            result = result[-10:]
        
        if len(result) < 2:
            return jsonify({'error': 'Need at least 2 sessions'}), 400
        
        return jsonify({'sessions': result})
    except Exception as e:
        return jsonify({'error': 'An error occurred loading consistency data'}), 500