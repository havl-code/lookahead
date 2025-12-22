"""
Import Data API Routes
"""

from flask import Blueprint, jsonify, request
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / 'python'))
from training_logger import TrainingLogger
from import_cstimer import CSTimerImporter

bp = Blueprint('imports', __name__, url_prefix='/api/import')


@bp.route('/preview', methods=['POST'])
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
        
        # Save file to data/raw for later import
        filepath = Path('data/raw') / file.filename
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f)
        
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


@bp.route('/selected', methods=['POST'])
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
            all