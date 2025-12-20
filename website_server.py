"""
Flask server for Speedcube Training Explorer website
Serves from src/web directory
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sys
from pathlib import Path
import pandas as pd
import json

sys.path.insert(0, 'src/python')

from training_logger import TrainingLogger
from wca_api_client import WCAApiClient
from cube_manager import CubeManager
from import_cstimer import CSTimerImporter

app = Flask(__name__, static_folder='src/web', static_url_path='')
CORS(app)

wca_api = WCAApiClient()

@app.route('/')
def index():
    return send_from_directory('src/web', 'index.html')

# ============================================
# STATS & DASHBOARD ENDPOINTS
# ============================================

@app.route('/api/stats', methods=['GET'])
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
            'wca_rank': wca_rank if wca_rank else None,
            'wca_percentile': round(wca_percentile, 2) if isinstance(wca_percentile, float) else None,
            'event_id': event_id
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """Get all training sessions"""
    try:
        logger = TrainingLogger()
        logger.connect()
        sessions = logger.get_all_sessions()
        logger.disconnect()
        
        sessions_dict = sessions.to_dict('records')
        for session in sessions_dict:
            for key, value in session.items():
                if pd.isna(value):
                    session[key] = None
                elif isinstance(value, float):
                    session[key] = round(value, 2)
        
        return jsonify(sessions_dict)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/events', methods=['GET'])
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


# ============================================
# SESSION MANAGEMENT ENDPOINTS
# ============================================

@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a session"""
    try:
        logger = TrainingLogger()
        logger.connect()
        logger.delete_session(session_id)
        logger.disconnect()
        
        return jsonify({'success': True, 'message': 'Session deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/add', methods=['POST'])
def add_session():
    """Add a new session"""
    try:
        data = request.json
        event_id = data.get('event_id', '333')
        cube_id = data.get('cube_id')
        notes = data.get('notes', '')
        
        logger = TrainingLogger()
        logger.connect()
        session_id = logger.create_session(event_id, notes, cube_id)
        logger.disconnect()
        
        return jsonify({'success': True, 'session_id': session_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/<int:session_id>/solves', methods=['GET'])
def get_session_solves(session_id):
    """Get all solves for a session"""
    try:
        logger = TrainingLogger()
        logger.connect()
        
        query = """
        SELECT id, solve_number, time_ms/1000.0 as time_seconds, 
               scramble, penalty, notes, timestamp
        FROM personal_solves
        WHERE session_id = ?
        ORDER BY solve_number
        """
        
        solves = pd.read_sql_query(query, logger.conn, params=(session_id,))
        logger.disconnect()
        
        solves_dict = solves.to_dict('records')
        for solve in solves_dict:
            for key, value in solve.items():
                if pd.isna(value):
                    solve[key] = None
                elif isinstance(value, float) and key == 'time_seconds':
                    solve[key] = round(value, 2)
        
        return jsonify(solves_dict)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/<int:session_id>/solves/add', methods=['POST'])
def add_solve(session_id):
    """Add a solve to a session"""
    try:
        data = request.json
        time_seconds = data.get('time_seconds')
        scramble = data.get('scramble', '')
        penalty = data.get('penalty')
        notes = data.get('notes', '')
        
        logger = TrainingLogger()
        logger.connect()
        logger.add_solve(session_id, time_seconds, scramble, penalty, notes)
        logger.update_session_stats(session_id)
        logger.disconnect()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/solves/<int:solve_id>', methods=['DELETE'])
def delete_solve(solve_id):
    """Delete a solve"""
    try:
        logger = TrainingLogger()
        logger.connect()
        
        cursor = logger.conn.cursor()
        cursor.execute("SELECT session_id FROM personal_solves WHERE id = ?", (solve_id,))
        result = cursor.fetchone()
        
        if result:
            session_id = result[0]
            logger.delete_solve(solve_id)
            logger.update_session_stats(session_id)
        
        logger.disconnect()
        
        return jsonify({'success': True, 'message': 'Solve deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# CUBE MANAGEMENT ENDPOINTS
# ============================================

@app.route('/api/cubes', methods=['GET'])
def get_cubes():
    """Get all cubes"""
    try:
        cube_manager = CubeManager()
        cube_manager.connect()
        cubes = cube_manager.list_cubes(active_only=False)
        cube_manager.disconnect()
        
        cubes_dict = cubes.to_dict('records')
        for cube in cubes_dict:
            for key, value in cube.items():
                if pd.isna(value):
                    cube[key] = None
        
        return jsonify(cubes_dict)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cubes/add', methods=['POST'])
def add_cube():
    """Add a new cube"""
    try:
        data = request.json
        name = data.get('name')
        brand = data.get('brand', '')
        model = data.get('model', '')
        purchase_date = data.get('purchase_date')
        notes = data.get('notes', '')
        
        cube_manager = CubeManager()
        cube_manager.connect()
        cube_id = cube_manager.add_cube(name, brand, model, purchase_date, notes)
        cube_manager.disconnect()
        
        return jsonify({'success': True, 'cube_id': cube_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cubes/<int:cube_id>', methods=['PUT'])
def update_cube(cube_id):
    """Update an existing cube"""
    try:
        data = request.json
        
        cube_manager = CubeManager()
        cube_manager.connect()
        
        update_kwargs = {}
        if 'name' in data:
            update_kwargs['name'] = data['name']
        if 'brand' in data:
            update_kwargs['brand'] = data['brand']
        if 'model' in data:
            update_kwargs['model'] = data['model']
        if 'purchase_date' in data:
            update_kwargs['purchase_date'] = data['purchase_date']
        if 'notes' in data:
            update_kwargs['notes'] = data['notes']
        if 'is_active' in data:
            update_kwargs['is_active'] = data['is_active']
        
        success = cube_manager.update_cube(cube_id, **update_kwargs)
        cube_manager.disconnect()
        
        if success:
            return jsonify({'success': True, 'message': 'Cube updated'})
        else:
            return jsonify({'error': 'Failed to update cube'}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cubes/<int:cube_id>', methods=['DELETE'])
def delete_cube(cube_id):
    """Deactivate a cube"""
    try:
        cube_manager = CubeManager()
        cube_manager.connect()
        cube_manager.delete_cube(cube_id)
        cube_manager.disconnect()
        
        return jsonify({'success': True, 'message': 'Cube deactivated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# CHART DATA ENDPOINTS
# ============================================

@app.route('/api/charts/progress', methods=['GET'])
def get_progress_chart():
    """Get progress data by event"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        logger.connect()
        
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
        
        df = pd.read_sql_query(query, logger.conn, params=(event_id,))
        logger.disconnect()
        
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


@app.route('/api/charts/session-progress', methods=['GET'])
def get_session_progress():
    """Get progress within a single session"""
    try:
        session_id = request.args.get('session_id')
        
        if not session_id:
            return jsonify({'error': 'Missing session_id parameter'}), 400
        
        logger = TrainingLogger()
        logger.connect()
        
        query = """
        SELECT 
            solve_number,
            time_ms/1000.0 as time
        FROM personal_solves
        WHERE session_id = ? AND dnf = 0
        ORDER BY solve_number
        """
        
        df = pd.read_sql_query(query, logger.conn, params=(int(session_id),))
        logger.disconnect()
        
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


@app.route('/api/charts/distribution', methods=['GET'])
def get_distribution_chart():
    """Get distribution data by event"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        logger.connect()
        
        query = """
        SELECT ps.time_ms/1000.0 as time 
        FROM personal_solves ps
        JOIN training_sessions ts ON ps.session_id = ts.id
        WHERE ps.dnf = 0 AND ts.event_id = ?
        ORDER BY ps.time_ms
        """
        
        df = pd.read_sql_query(query, logger.conn, params=(event_id,))
        logger.disconnect()
        
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


@app.route('/api/charts/session-distribution', methods=['GET'])
def get_session_distribution():
    """Get distribution for a single session"""
    try:
        session_id = request.args.get('session_id')
        
        logger = TrainingLogger()
        logger.connect()
        
        query = """
        SELECT time_ms/1000.0 as time 
        FROM personal_solves
        WHERE session_id = ? AND dnf = 0
        ORDER BY time_ms
        """
        
        df = pd.read_sql_query(query, logger.conn, params=(int(session_id),))
        logger.disconnect()
        
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


@app.route('/api/charts/rolling-average', methods=['GET'])
def get_rolling_average():
    """Get rolling average data by event"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        logger.connect()
        
        query = """
        SELECT ps.time_ms/1000.0 as time 
        FROM personal_solves ps
        JOIN training_sessions ts ON ps.session_id = ts.id
        WHERE ps.dnf = 0 AND ts.event_id = ?
        ORDER BY ps.timestamp
        """
        
        df = pd.read_sql_query(query, logger.conn, params=(event_id,))
        logger.disconnect()
        
        if len(df) < 12:
            return jsonify({'error': 'Need at least 12 solves'}), 400
        
        times = df['time'].tolist()
        return jsonify({'times': times})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/charts/session-rolling', methods=['GET'])
def get_session_rolling():
    """Get rolling average for a single session"""
    try:
        session_id = request.args.get('session_id')
        
        logger = TrainingLogger()
        logger.connect()
        
        query = """
        SELECT time_ms/1000.0 as time 
        FROM personal_solves
        WHERE session_id = ? AND dnf = 0
        ORDER BY solve_number
        """
        
        df = pd.read_sql_query(query, logger.conn, params=(session_id,))
        logger.disconnect()
        
        if len(df) < 12:
            return jsonify({'error': 'Need at least 12 solves'}), 400
        
        times = df['time'].tolist()
        return jsonify({'times': times})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/charts/consistency', methods=['GET'])
def get_consistency_chart():
    """Get consistency data across sessions"""
    try:
        event_id = request.args.get('event_id', '333')
        
        logger = TrainingLogger()
        logger.connect()
        
        session_query = """
        SELECT id, date 
        FROM training_sessions
        WHERE event_id = ? AND solve_count >= 5
        ORDER BY date
        LIMIT 10
        """
        
        sessions = pd.read_sql_query(session_query, logger.conn, params=(event_id,))
        
        result = []
        for _, session in sessions.iterrows():
            solve_query = """
            SELECT time_ms/1000.0 as time
            FROM personal_solves
            WHERE session_id = ? AND dnf = 0
            """
            solves = pd.read_sql_query(solve_query, logger.conn, params=(int(session['id']),))
            
            if len(solves) >= 5:
                result.append({
                    'date': session['date'],
                    'times': solves['time'].tolist()
                })
        
        logger.disconnect()
        
        if len(result) < 2:
            return jsonify({'error': 'Need at least 2 sessions'}), 400
        
        return jsonify({'sessions': result})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ============================================
# IMPORT ENDPOINTS
# ============================================

@app.route('/api/import/preview', methods=['POST'])
def preview_cstimer():
    """Preview CSTimer sessions before importing"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        content = file.read().decode('utf-8')
        data = json.loads(content)
        
        sessions_preview = []
        for session_key, session_data in data.items():
            if not isinstance(session_data, list):
                continue
            
            solve_count = len(session_data)
            
            times = []
            for solve in session_data:
                try:
                    time_cs = solve[0][1]
                    penalty = solve[0][0]
                    if penalty != -1:
                        times.append(time_cs / 1000)
                except:
                    continue
            
            sessions_preview.append({
                'key': session_key,
                'solve_count': solve_count,
                'best': min(times) if times else None,
                'worst': max(times) if times else None,
                'mean': sum(times) / len(times) if times else None
            })
        
        return jsonify({'sessions': sessions_preview, 'filename': file.filename})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/import/selected', methods=['POST'])
def import_selected_sessions():
    """Import only selected CSTimer sessions"""
    try:
        data = request.json
        filename = data.get('filename')
        selected_sessions = data.get('sessions', [])
        event_id = data.get('event_id', '333')
        
        if not filename or not selected_sessions:
            return jsonify({'error': 'Missing filename or sessions'}), 400
        
        file_path = Path('data/raw') / filename
        
        if not file_path.exists():
            return jsonify({'error': 'File not found'}), 400
        
        with open(file_path, 'r', encoding='utf-8') as f:
            all_data = json.load(f)
        
        filtered_data = {k: v for k, v in all_data.items() if k in selected_sessions}
        
        temp_file = Path('data/raw') / f"temp_{filename}"
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(filtered_data, f)
        
        logger = TrainingLogger()
        logger.connect()
        importer = CSTimerImporter(logger)
        
        sessions_imported = importer.import_from_json(temp_file, event_id=event_id)
        
        logger.disconnect()
        
        temp_file.unlink()
        
        return jsonify({
            'success': True,
            'sessions_imported': sessions_imported,
            'message': f'Successfully imported {sessions_imported} sessions as {event_id}'
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("="*60)
    print("SPEEDCUBE TRAINING EXPLORER - WEB SERVER")
    print("="*60)
    print("\nStarting server...")
    print("Open your browser to: http://localhost:5000")
    print("\nPress Ctrl+C to stop the server")
    print("="*60)
    
    app.run(debug=True, host='0.0.0.0', port=5000)
