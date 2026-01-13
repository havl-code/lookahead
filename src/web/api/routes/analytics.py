"""
Analytics API Routes
Heatmap and performance analytics endpoints
"""

from flask import Blueprint, jsonify, request
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent))
from src.python.db_manager import DatabaseManager

analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/analytics')


@analytics_bp.route('/heatmap')
def get_performance_heatmap():
    """
    Get performance heatmap data showing speed/accuracy across time periods
    Returns data suitable for a 2D heatmap visualization
    """
    event_id = request.args.get('event_id', '333')
    metric = request.args.get('metric', 'speed')  # speed, consistency, improvement
    
    db_manager = DatabaseManager()
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get solves grouped by date and hour
            query = """
            SELECT 
                DATE(ps.timestamp) as solve_date,
                CAST(strftime('%H', ps.timestamp) AS INTEGER) as hour_of_day,
                COUNT(*) as solve_count,
                AVG(CASE WHEN ps.dnf = 0 THEN ps.time_ms END) as avg_time,
                MIN(CASE WHEN ps.dnf = 0 THEN ps.time_ms END) as best_time,
                MAX(CASE WHEN ps.dnf = 0 THEN ps.time_ms END) as worst_time,
                (MAX(CASE WHEN ps.dnf = 0 THEN ps.time_ms END) - 
                 MIN(CASE WHEN ps.dnf = 0 THEN ps.time_ms END)) as time_range
            FROM personal_solves ps
            JOIN training_sessions ts ON ps.session_id = ts.id
            WHERE ts.event_id = ? AND ps.dnf = 0
            GROUP BY solve_date, hour_of_day
            HAVING solve_count >= 3
            ORDER BY solve_date, hour_of_day
            """
            
            cursor.execute(query, (event_id,))
            rows = cursor.fetchall()
            
            if not rows:
                return jsonify({'error': 'No data available'}), 404
            
            # Format data for heatmap
            heatmap_data = []
            for row in rows:
                date, hour, count, avg_time, best, worst, time_range = row
                
                # Calculate metric value based on selection
                if metric == 'speed':
                    value = avg_time / 1000 if avg_time else None
                elif metric == 'consistency':
                    # Lower is better (smaller range = more consistent)
                    value = time_range / 1000 if time_range else None
                elif metric == 'improvement':
                    # Best time relative to average
                    value = (avg_time - best) / 1000 if avg_time and best else None
                else:
                    value = avg_time / 1000
                
                heatmap_data.append({
                    'date': date,
                    'hour': hour,
                    'value': value,
                    'solve_count': count,
                    'avg_time': avg_time / 1000 if avg_time else None,
                    'best_time': best / 1000 if best else None
                })
            
            return jsonify({
                'data': heatmap_data,
                'event_id': event_id,
                'metric': metric
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@analytics_bp.route('/session-heatmap')
def get_session_heatmap():
    """
    Get per-session performance heatmap
    Shows performance across different sessions
    """
    event_id = request.args.get('event_id', '333')
    
    db_manager = DatabaseManager()
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get session statistics
            query = """
            SELECT 
                ts.id,
                ts.date,
                ts.solve_count,
                ts.best_single,
                ts.session_mean,
                ts.ao5,
                ts.ao12,
                COUNT(CASE WHEN ps.dnf = 1 THEN 1 END) as dnf_count,
                COUNT(CASE WHEN ps.plus_two = 1 THEN 1 END) as plus2_count
            FROM training_sessions ts
            LEFT JOIN personal_solves ps ON ts.id = ps.session_id
            WHERE ts.event_id = ?
            GROUP BY ts.id
            ORDER BY ts.date DESC
            LIMIT 50
            """
            
            cursor.execute(query, (event_id,))
            rows = cursor.fetchall()
            
            if not rows:
                return jsonify({'error': 'No sessions available'}), 404
            
            sessions = []
            for row in rows:
                sid, date, count, best, mean, ao5, ao12, dnf, plus2 = row
                
                # Calculate performance score (0-100, higher is better)
                # Based on: speed, consistency, and accuracy
                speed_score = 0
                consistency_score = 0
                accuracy_score = 0
                
                if mean and best:
                    # Speed: how fast compared to a baseline (e.g., 30s for 3x3)
                    baseline = 30000  # 30 seconds for 3x3
                    speed_score = max(0, 100 - ((mean / baseline) * 50))
                    
                    # Consistency: how close best is to mean
                    consistency_ratio = best / mean if mean > 0 else 0
                    consistency_score = consistency_ratio * 100
                
                if count > 0:
                    # Accuracy: fewer penalties = better
                    penalty_rate = (dnf + plus2) / count
                    accuracy_score = max(0, 100 - (penalty_rate * 100))
                
                overall_score = (speed_score + consistency_score + accuracy_score) / 3
                
                sessions.append({
                    'session_id': sid,
                    'date': date,
                    'solve_count': count,
                    'best': best / 1000 if best else None,
                    'mean': mean / 1000 if mean else None,
                    'ao5': ao5 / 1000 if ao5 else None,
                    'ao12': ao12 / 1000 if ao12 else None,
                    'dnf_count': dnf,
                    'plus2_count': plus2,
                    'speed_score': round(speed_score, 1),
                    'consistency_score': round(consistency_score, 1),
                    'accuracy_score': round(accuracy_score, 1),
                    'overall_score': round(overall_score, 1)
                })
            
            return jsonify({
                'sessions': sessions,
                'event_id': event_id
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@analytics_bp.route('/solve-grid')
def get_solve_grid():
    """
    Get a grid view of recent solves with performance indicators
    """
    event_id = request.args.get('event_id', '333')
    limit = int(request.args.get('limit', 100))
    
    db_manager = DatabaseManager()
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            query = """
            SELECT 
                ps.id,
                ps.solve_number,
                ps.time_ms,
                ps.dnf,
                ps.plus_two,
                ps.timestamp,
                ts.id as session_id,
                ts.date
            FROM personal_solves ps
            JOIN training_sessions ts ON ps.session_id = ts.id
            WHERE ts.event_id = ?
            ORDER BY ps.timestamp DESC
            LIMIT ?
            """
            
            cursor.execute(query, (event_id, limit))
            rows = cursor.fetchall()
            
            if not rows:
                return jsonify({'error': 'No solves available'}), 404
            
            # Calculate percentiles for color coding
            times = [r[2] for r in rows if not r[3]]  # Exclude DNF
            times.sort()
            
            p25 = times[len(times)//4] if times else 0
            p50 = times[len(times)//2] if times else 0
            p75 = times[3*len(times)//4] if times else 0
            
            solves = []
            for row in rows:
                sid, num, time_ms, dnf, plus2, timestamp, session_id, date = row
                
                # Determine performance category
                if dnf:
                    category = 'dnf'
                elif plus2:
                    category = 'penalty'
                elif time_ms <= p25:
                    category = 'excellent'
                elif time_ms <= p50:
                    category = 'good'
                elif time_ms <= p75:
                    category = 'average'
                else:
                    category = 'slow'
                
                solves.append({
                    'id': sid,
                    'solve_number': num,
                    'time': time_ms / 1000 if time_ms > 0 else 0,
                    'dnf': dnf == 1,
                    'plus_two': plus2 == 1,
                    'timestamp': timestamp,
                    'session_id': session_id,
                    'date': date,
                    'category': category
                })
            
            return jsonify({
                'solves': solves,
                'percentiles': {
                    'p25': p25 / 1000,
                    'p50': p50 / 1000,
                    'p75': p75 / 1000
                },
                'event_id': event_id
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@analytics_bp.route('/time-of-day')
def get_time_of_day_performance():
    """
    Analyze performance by time of day
    """
    event_id = request.args.get('event_id', '333')
    
    db_manager = DatabaseManager()
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            query = """
            SELECT 
                CAST(strftime('%H', ps.timestamp) AS INTEGER) as hour,
                COUNT(*) as solve_count,
                AVG(CASE WHEN ps.dnf = 0 THEN ps.time_ms END) as avg_time,
                MIN(CASE WHEN ps.dnf = 0 THEN ps.time_ms END) as best_time
            FROM personal_solves ps
            JOIN training_sessions ts ON ps.session_id = ts.id
            WHERE ts.event_id = ?
            GROUP BY hour
            HAVING solve_count >= 5
            ORDER BY hour
            """
            
            cursor.execute(query, (event_id,))
            rows = cursor.fetchall()
            
            if not rows:
                return jsonify({'error': 'Insufficient data'}), 404
            
            hourly_data = []
            for row in rows:
                hour, count, avg, best = row
                
                hourly_data.append({
                    'hour': hour,
                    'hour_label': f"{hour:02d}:00",
                    'solve_count': count,
                    'avg_time': avg / 1000 if avg else None,
                    'best_time': best / 1000 if best else None
                })
            
            return jsonify({
                'data': hourly_data,
                'event_id': event_id
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def init_analytics_routes(app):
    """Register analytics blueprint with Flask app"""
    app.register_blueprint(analytics_bp)