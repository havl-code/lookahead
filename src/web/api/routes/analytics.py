"""
Analytics API Routes
Heatmap and performance analytics endpoints
"""

from flask import Blueprint, jsonify, request
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / 'python'))
from db_manager import DatabaseManager

analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/analytics')


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
        return jsonify({'error': 'An error occurred loading analytics data'}), 500



def init_analytics_routes(app):
    """Register analytics blueprint with Flask app"""
    app.register_blueprint(analytics_bp)