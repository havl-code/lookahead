"""
Stats and Dashboard API Routes
"""

from flask import Blueprint, jsonify, request
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / 'python'))
from training_logger import TrainingLogger
from wca_api_client import WCAApiClient

bp = Blueprint('stats', __name__, url_prefix='/api')
wca_api = WCAApiClient()


@bp.route('/stats', methods=['GET'])
def get_stats():
    """Get overall statistics"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        
        with logger.db_manager.get_connection() as conn:
            # Single optimized query for all solve stats
            if event_id == 'all':
                solve_query = """
                SELECT 
                    MIN(CASE WHEN ps.dnf = 0 THEN ps.time_ms END)/1000.0 as pb,
                    AVG(CASE WHEN ps.dnf = 0 THEN ps.time_ms END)/1000.0 as avg,
                    COUNT(ps.id) as total_solves
                FROM personal_solves ps
                """
                solve_result = pd.read_sql_query(solve_query, conn)
            else:
                solve_query = """
                SELECT 
                    MIN(CASE WHEN ps.dnf = 0 THEN ps.time_ms END)/1000.0 as pb,
                    AVG(CASE WHEN ps.dnf = 0 THEN ps.time_ms END)/1000.0 as avg,
                    COUNT(ps.id) as total_solves
                FROM personal_solves ps
                JOIN training_sessions ts ON ps.session_id = ts.id
                WHERE ts.event_id = ?
                """
                solve_result = pd.read_sql_query(solve_query, conn, params=(event_id,))
            
            pb = solve_result['pb'].values[0] if len(solve_result) > 0 and not pd.isna(solve_result['pb'].values[0]) else None
            avg = solve_result['avg'].values[0] if len(solve_result) > 0 and not pd.isna(solve_result['avg'].values[0]) else None
            total_solves = int(solve_result['total_solves'].values[0])
            
            # Single query for session and cube counts
            if event_id == 'all':
                meta_query = """
                SELECT 
                    (SELECT COUNT(*) FROM training_sessions) as total_sessions,
                    (SELECT COUNT(*) FROM cubes) as total_cubes,
                    (SELECT COUNT(*) FROM cubes WHERE is_active = 1) as active_cubes
                """
                meta_result = pd.read_sql_query(meta_query, conn)
            else:
                meta_query = """
                SELECT 
                    (SELECT COUNT(*) FROM training_sessions WHERE event_id = ?) as total_sessions,
                    (SELECT COUNT(*) FROM cubes) as total_cubes,
                    (SELECT COUNT(*) FROM cubes WHERE is_active = 1) as active_cubes
                """
                meta_result = pd.read_sql_query(meta_query, conn, params=(event_id,))
            
            total_sessions = int(meta_result['total_sessions'].values[0])
            total_cubes = int(meta_result['total_cubes'].values[0])
            active_cubes = int(meta_result['active_cubes'].values[0])
        
        wca_rank = None
        wca_percentile = None
        
        supported_events = ['222', '333', '444', '555', '666', '777', 'pyram', 'skewb', 'minx', 'sq1', 'clock']
        
        if pb and event_id in supported_events:
            try:
                wca_result = wca_api.estimate_percentile(pb, event_id, 'single')
                if wca_result:
                    wca_rank = wca_result.get('rank_estimate')
                    wca_percentile = wca_result.get('percentile')
            except Exception:
                pass
        
        return jsonify({
            'pb': round(pb, 2) if pb else None,
            'average': round(avg, 2) if avg else None,
            'total_solves': total_solves,
            'total_sessions': total_sessions,
            'total_cubes': total_cubes,
            'active_cubes': active_cubes,  # NEW: Active cubes count
            'wca_rank': wca_rank if wca_rank else None,
            'wca_percentile': round(wca_percentile, 2) if isinstance(wca_percentile, float) else None,
            'event_id': event_id
        })
    except Exception as e:
        return jsonify({'error': 'An error occurred loading statistics'}), 500


@bp.route('/pb-details', methods=['GET'])
def get_pb_details():
    """Get details about the personal best solve"""
    try:
        event_id = request.args.get('event_id', '333')
        pb_time = float(request.args.get('pb_time'))
        
        logger = TrainingLogger()
        logger.connect()
        
        # Find the solve that matches the PB (with rounding to match display)
        if event_id == 'all':
            query = """
            SELECT ps.id, ps.session_id, ps.scramble, ts.date, ts.event_id, ps.time_ms
            FROM personal_solves ps
            JOIN training_sessions ts ON ps.session_id = ts.id
            WHERE ps.dnf = 0
            ORDER BY ps.time_ms ASC
            LIMIT 1
            """
            result = pd.read_sql_query(query, logger.conn)
        else:
            query = """
            SELECT ps.id, ps.session_id, ps.scramble, ts.date, ts.event_id, ps.time_ms
            FROM personal_solves ps
            JOIN training_sessions ts ON ps.session_id = ts.id
            WHERE ps.dnf = 0 AND ts.event_id = ?
            ORDER BY ps.time_ms ASC
            LIMIT 1
            """
            result = pd.read_sql_query(query, logger.conn, params=(event_id,))
        
        logger.disconnect()
        
        if len(result) == 0:
            return jsonify({'error': 'PB solve not found'}), 404
        
        solve_data = result.iloc[0]
        
        return jsonify({
            'session_id': int(solve_data['session_id']),
            'date': solve_data['date'],
            'scramble': solve_data['scramble'] if pd.notna(solve_data['scramble']) else None,
            'event_id': solve_data['event_id']
        })
        
    except Exception as e:
        return jsonify({'error': 'An error occurred loading PB details'}), 500


@bp.route('/events', methods=['GET'])
def get_events():
    """Get list of available events"""
    try:
        logger = TrainingLogger()
        logger.connect()
        
        query = "SELECT DISTINCT event_id FROM training_sessions ORDER BY event_id"
        events = pd.read_sql_query(query, logger.conn)
        logger.disconnect()
        
        event_list = events['event_id'].tolist()
        return jsonify(event_list)
    except Exception as e:
        return jsonify({'error': str(e)}), 500