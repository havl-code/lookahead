"""
Flask server for Speedcube Training Explorer website
Serves static HTML and provides API endpoints for Python functions
"""

from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
import sys
from pathlib import Path
import pandas as pd
import json
import base64
from io import BytesIO

# Add src/python to path
sys.path.insert(0, 'src/python')

from training_logger import TrainingLogger
from wca_api_client import WCAApiClient
from cube_manager import CubeManager
from import_cstimer import CSTimerImporter
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns

app = Flask(__name__, static_folder='website', static_url_path='')
CORS(app)

# Initialize WCA API client (doesn't need connection)
wca_api = WCAApiClient()

# Serve the main HTML page
@app.route('/')
def index():
    return send_from_directory('website', 'index.html')

# API Endpoints

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get overall statistics"""
    try:
        logger = TrainingLogger()
        logger.connect()
        
        # Personal bests
        pb_query = "SELECT MIN(time_ms)/1000.0 as pb FROM personal_solves WHERE dnf = 0"
        pb_result = pd.read_sql_query(pb_query, logger.conn)
        pb = pb_result['pb'].values[0] if len(pb_result) > 0 and not pd.isna(pb_result['pb'].values[0]) else None
        
        # Average
        avg_query = "SELECT AVG(time_ms)/1000.0 as avg FROM personal_solves WHERE dnf = 0"
        avg_result = pd.read_sql_query(avg_query, logger.conn)
        avg = avg_result['avg'].values[0] if len(avg_result) > 0 and not pd.isna(avg_result['avg'].values[0]) else None
        
        # Total solves and sessions
        count_query = "SELECT COUNT(*) as total_solves FROM personal_solves"
        count_result = pd.read_sql_query(count_query, logger.conn)
        total_solves = int(count_result['total_solves'].values[0])
        
        session_query = "SELECT COUNT(*) as total_sessions FROM training_sessions"
        session_result = pd.read_sql_query(session_query, logger.conn)
        total_sessions = int(session_result['total_sessions'].values[0])
        
        logger.disconnect()
        
        # Get WCA comparison if we have data
        wca_rank = None
        wca_percentile = None
        if pb:
            wca_result = wca_api.estimate_percentile(pb, '333', 'single')
            wca_rank = wca_result.get('rank_estimate', 'N/A')
            wca_percentile = wca_result.get('percentile', 'N/A')
        
        return jsonify({
            'pb': round(pb, 2) if pb else None,
            'average': round(avg, 2) if avg else None,
            'total_solves': total_solves,
            'total_sessions': total_sessions,
            'wca_rank': wca_rank,
            'wca_percentile': round(wca_percentile, 2) if isinstance(wca_percentile, float) else wca_percentile
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """Get all training sessions"""
    try:
        logger = TrainingLogger()
        logger.connect()
        sessions = logger.get_all_sessions()
        logger.disconnect()
        
        # Convert to dict and handle NaN values
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

@app.route('/api/cubes', methods=['GET'])
def get_cubes():
    """Get all cubes"""
    try:
        cube_manager = CubeManager()
        cube_manager.connect()
        cubes = cube_manager.list_cubes()
        cube_manager.disconnect()
        
        cubes_dict = cubes.to_dict('records')
        for cube in cubes_dict:
            for key, value in cube.items():
                if pd.isna(value):
                    cube[key] = None
        
        return jsonify(cubes_dict)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/progress', methods=['GET'])
def get_progress():
    """Get progress over time data"""
    try:
        logger = TrainingLogger()
        logger.connect()
        
        query = """
        SELECT 
            date,
            best_single/1000.0 as best,
            session_mean/1000.0 as mean,
            ao5/1000.0 as ao5,
            ao12/1000.0 as ao12
        FROM training_sessions
        WHERE solve_count >= 5
        ORDER BY date
        """
        
        progress = pd.read_sql_query(query, logger.conn)
        logger.disconnect()
        
        progress_dict = progress.to_dict('records')
        for record in progress_dict:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = None
                elif isinstance(value, float):
                    record[key] = round(value, 2)
        
        return jsonify(progress_dict)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/charts/progress', methods=['GET'])
def get_progress_chart():
    """Generate interactive progress chart with Plotly"""
    try:
        logger = TrainingLogger()
        logger.connect()
        
        query = """
        SELECT 
            date,
            best_single/1000.0 as best,
            session_mean/1000.0 as mean,
            ao5/1000.0 as ao5
        FROM training_sessions
        WHERE solve_count >= 5
        ORDER BY date
        """
        
        df = pd.read_sql_query(query, logger.conn)
        logger.disconnect()
        
        if len(df) < 2:
            return jsonify({'error': 'Need at least 2 sessions'}), 400
        
        # Create Plotly chart
        import plotly.graph_objects as go
        
        fig = go.Figure()
        
        # Rubik's cube colors: White, Red, Blue, Orange, Green, Yellow
        colors = {
            'best': '#000000',      # Black
            'mean': '#666666',      # Dark gray  
            'ao5': '#999999'        # Light gray
        }
        
        fig.add_trace(go.Scatter(
            x=list(range(len(df))),
            y=df['best'],
            name='Best Single',
            line=dict(color=colors['best'], width=2),
            mode='lines+markers'
        ))
        
        fig.add_trace(go.Scatter(
            x=list(range(len(df))),
            y=df['mean'],
            name='Session Mean',
            line=dict(color=colors['mean'], width=2),
            mode='lines+markers'
        ))
        
        if df['ao5'].notna().any():
            fig.add_trace(go.Scatter(
                x=list(range(len(df))),
                y=df['ao5'],
                name='Ao5',
                line=dict(color=colors['ao5'], width=2),
                mode='lines+markers'
            ))
        
        fig.update_layout(
            title='Training Progress Over Time',
            xaxis_title='Session Number',
            yaxis_title='Time (seconds)',
            font=dict(family='Montserrat', size=12, color='#000000'),
            plot_bgcolor='#ffffff',
            paper_bgcolor='#ffffff',
            hovermode='x unified',
            showlegend=True,
            legend=dict(x=0, y=1),
            margin=dict(l=50, r=50, t=50, b=50)
        )
        
        fig.update_xaxes(showgrid=True, gridcolor='#e0e0e0')
        fig.update_yaxes(showgrid=True, gridcolor='#e0e0e0')
        
        # Return as HTML with unique div ID
        html = fig.to_html(include_plotlyjs='cdn', div_id='plotly-progress-chart')
        
        return jsonify({'html': html})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/charts/distribution', methods=['GET'])
def get_distribution_chart():
    """Generate interactive distribution chart with Plotly"""
    try:
        logger = TrainingLogger()
        logger.connect()
        
        query = "SELECT time_ms/1000.0 as time FROM personal_solves WHERE dnf = 0"
        df = pd.read_sql_query(query, logger.conn)
        logger.disconnect()
        
        if len(df) < 5:
            return jsonify({'error': 'Need at least 5 solves'}), 400
        
        import plotly.graph_objects as go
        
        fig = go.Figure()
        
        fig.add_trace(go.Histogram(
            x=df['time'],
            nbinsx=30,
            marker=dict(color='#000000', line=dict(color='#ffffff', width=1)),
            name='Solve Times'
        ))
        
        # Add median line
        median_time = df['time'].median()
        fig.add_vline(
            x=median_time,
            line=dict(color='#666666', width=2, dash='dash'),
            annotation_text=f'Median: {median_time:.2f}s',
            annotation_position='top'
        )
        
        fig.update_layout(
            title='Solve Time Distribution',
            xaxis_title='Time (seconds)',
            yaxis_title='Frequency',
            font=dict(family='Montserrat', size=12, color='#000000'),
            plot_bgcolor='#ffffff',
            paper_bgcolor='#ffffff',
            showlegend=False,
            margin=dict(l=50, r=50, t=50, b=50)
        )
        
        fig.update_xaxes(showgrid=True, gridcolor='#e0e0e0')
        fig.update_yaxes(showgrid=True, gridcolor='#e0e0e0')
        
        html = fig.to_html(include_plotlyjs='cdn', div_id='plotly-distribution-chart')
        
        return jsonify({'html': html})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/import/preview', methods=['POST'])
def preview_cstimer():
    """Preview CSTimer sessions before importing"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Read file content
        import json
        content = file.read().decode('utf-8')
        data = json.loads(content)
        
        # Parse sessions
        sessions_preview = []
        for session_key, session_data in data.items():
            if not isinstance(session_data, list):
                continue
            
            solve_count = len(session_data)
            
            # Get time range
            times = []
            for solve in session_data:
                try:
                    time_cs = solve[0][1]
                    penalty = solve[0][0]
                    if penalty != -1:  # Not DNF
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
        return jsonify({'error': str(e)}), 500

@app.route('/api/import/selected', methods=['POST'])
def import_selected_sessions():
    """Import only selected CSTimer sessions"""
    try:
        data = request.json
        filename = data.get('filename')
        selected_sessions = data.get('sessions', [])
        
        if not filename or not selected_sessions:
            return jsonify({'error': 'Missing filename or sessions'}), 400
        
        # Read file
        import json
        file_path = Path('data/raw') / filename
        
        if not file_path.exists():
            return jsonify({'error': 'File not found'}), 400
        
        with open(file_path, 'r', encoding='utf-8') as f:
            all_data = json.load(f)
        
        # Filter only selected sessions
        filtered_data = {k: v for k, v in all_data.items() if k in selected_sessions}
        
        # Save temporary file
        temp_file = Path('data/raw') / f"temp_{filename}"
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(filtered_data, f)
        
        # Import
        logger = TrainingLogger()
        logger.connect()
        importer = CSTimerImporter(logger)
        
        sessions_imported = importer.import_from_json(temp_file, event_id='333')
        
        logger.disconnect()
        
        # Clean up temp file
        temp_file.unlink()
        
        return jsonify({
            'success': True,
            'sessions_imported': sessions_imported,
            'message': f'Successfully imported {sessions_imported} sessions'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/import', methods=['POST'])
def import_cstimer():
    """Import CSTimer data from uploaded file"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Save temporarily
        temp_path = Path('data/raw') / file.filename
        temp_path.parent.mkdir(exist_ok=True)
        file.save(temp_path)
        
        # Import
        logger = TrainingLogger()
        logger.connect()
        importer = CSTimerImporter(logger)
        
        sessions_imported = importer.import_from_json(temp_path, event_id='333')
        
        logger.disconnect()
        
        return jsonify({
            'success': True,
            'sessions_imported': sessions_imported,
            'message': f'Successfully imported {sessions_imported} sessions'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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

@app.route('/api/sessions/<int:session_id>/solves', methods=['GET'])
def get_session_solves(session_id):
    """Get all solves for a session"""
    try:
        logger = TrainingLogger()
        logger.connect()
        solves = logger.get_session_solves(session_id)
        logger.disconnect()
        
        solves_dict = solves.to_dict('records')
        for solve in solves_dict:
            for key, value in solve.items():
                if pd.isna(value):
                    solve[key] = None
                elif isinstance(value, float):
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

@app.route('/api/solves/<int:solve_id>', methods=['PUT'])
def edit_solve(solve_id):
    """Edit a solve"""
    try:
        data = request.json
        
        logger = TrainingLogger()
        logger.connect()
        logger.edit_solve(
            solve_id,
            new_time_seconds=data.get('time_seconds'),
            new_scramble=data.get('scramble'),
            new_penalty=data.get('penalty'),
            new_notes=data.get('notes')
        )
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
        logger.delete_solve(solve_id)
        logger.disconnect()
        
        return jsonify({'success': True})
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

if __name__ == '__main__':
    print("="*60)
    print("SPEEDCUBE TRAINING EXPLORER - WEB SERVER")
    print("="*60)
    print("\nStarting server...")
    print("Open your browser to: http://localhost:5000")
    print("\nPress Ctrl+C to stop the server")
    print("="*60)
    
    app.run(debug=True, host='0.0.0.0', port=5000)