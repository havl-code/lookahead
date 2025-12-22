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
        logger.connect()
        
        if event_id == 'all':
            pb_query = "SELECT MIN(ps.time_ms)/1000.0 as pb FROM personal_solves ps WHERE ps.dnf = 0"
            pb_result = pd.read_sql_query(pb_query, logger.conn)
        else:
            pb_query = """
            SELECT MIN(ps.time_ms)/1000.0 as pb 
            FROM personal_solves ps
            JOIN training_sessions ts ON ps.session_id = ts.id
            WHERE ps.dnf = 0 AND ts.event_id = ?
            """
            pb_result = pd.read_sql_query(pb_query, logger.conn, params=(event_id,))
        
        pb = pb_result['pb'].values[0] if len(pb_result) > 0 and not pd.isna(pb_result['pb'].values[0]) else None
        
        if event_id == 'all':
            avg_query = "SELECT AVG(ps.time_ms)/1000.0 as avg FROM personal_solves ps WHERE ps.dnf = 0"
            avg_result = pd.read_sql_query(avg_query, logger.conn)
        else:
            avg_query = """
            SELECT AVG(ps.time_ms)/1000.0 as avg 
            FROM personal_solves ps
            JOIN training_sessions ts ON ps.session_id = ts.id
            WHERE ps.dnf = 0 AND ts.event_id = ?
            """
            avg_result = pd.read_sql_query(avg_query, logger.conn, params=(event_id,))
        
        avg = avg_result['avg'].values[0] if len(avg_result) > 0 and not pd.isna(avg_result['avg'].values[0]) else None
        
        if event_id == 'all':
            count_query = "SELECT COUNT(ps.id) as total_solves FROM personal_solves ps"
            count_result = pd.read_sql_query(count_query, logger.conn)
        else:
            count_query = """
            SELECT COUNT(ps.id) as total_solves 
            FROM personal_solves ps
            JOIN training_sessions ts ON ps.session_id = ts.id
            WHERE ts.event_id = ?
            """
            count_result = pd.read_sql_query(count_query, logger.conn, params=(event_id,))
        
        total_solves = int(count_result['total_solves'].values[0])
        
        if event_id == 'all':
            session_query = "SELECT COUNT(*) as total_sessions FROM training_sessions"
            session_result = pd.read_sql_query(session_query, logger.conn)
        else:
            session_query = "SELECT COUNT(*) as total_sessions FROM training_sessions WHERE event_id = ?"
            session_result = pd.read_sql_query(session_query, logger.conn, params=(event_id,))
        
        total_sessions = int(session_result['total_sessions'].values[0])
        
        # Get total cubes count
        cube_query = "SELECT COUNT(*) as total_cubes FROM cubes WHERE is_active = 1"
        cube_result = pd.read_sql_query(cube_query, logger.conn)
        total_cubes = int(cube_result['total_cubes'].values[0])
        
        logger.disconnect()
        
        wca_rank = None
        wca_percentile = None
        
        supported_events = ['222', '333', '444', '555', '666', '777', 'pyram', 'skewb', 'minx', 'sq1', 'clock']
        
        if pb and event_id in supported_events:
            try:
                wca_result = wca_api.estimate_percentile(pb, event_id, 'single')
                if wca_result:
                    wca_rank = wca_result.get('rank_estimate')
                    wca_percentile = wca_result.get('percentile')
            except Exception as e:
                print(f"WCA API error: {e}")
        
        return jsonify({
            'pb': round(pb, 2) if pb else None,
            'average': round(avg, 2) if avg else None,
            'total_solves': total_solves,
            'total_sessions': total_sessions,
            'total_cubes': total_cubes,
            'wca_rank': wca_rank if wca_rank else None,
            'wca_percentile': round(wca_percentile, 2) if isinstance(wca_percentile, float) else None,
            'event_id': event_id
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


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
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


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
