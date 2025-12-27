"""
Cubes Inventory API Routes
"""

from flask import Blueprint, jsonify, request
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / 'python'))
from cube_manager import CubeManager

bp = Blueprint('cubes', __name__, url_prefix='/api')


@bp.route('/cubes', methods=['GET'])
def get_cubes():
    """Get all cubes"""
    try:
        cube_manager = CubeManager()
        with cube_manager.db_manager.get_connection() as conn:
            cubes = cube_manager.list_cubes(active_only=False)
        
        cubes_dict = cubes.to_dict('records')
        for cube in cubes_dict:
            for key, value in cube.items():
                if pd.isna(value):
                    cube[key] = None
        
        return jsonify(cubes_dict)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/cubes/add', methods=['POST'])
def add_cube():
    """Add a new cube"""
    try:
        data = request.json
        cube_type = data.get('cube_type', '')
        brand = data.get('brand', '')
        model = data.get('model', '')
        purchase_date = data.get('purchase_date')
        notes = data.get('notes', '')
        
        if not cube_type:
            return jsonify({'error': 'Cube type is required'}), 400
        
        cube_manager = CubeManager()
        with cube_manager.db_manager.get_connection() as conn:
            cube_id = cube_manager.add_cube(cube_type, brand, model, purchase_date, notes)
            conn.commit()
        
        return jsonify({'success': True, 'cube_id': cube_id})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/cubes/<int:cube_id>', methods=['PUT'])
def update_cube(cube_id):
    """Update an existing cube"""
    try:
        data = request.json
        
        cube_manager = CubeManager()
        with cube_manager.db_manager.get_connection() as conn:
            update_kwargs = {}
            if 'cube_type' in data:
                update_kwargs['cube_type'] = data['cube_type']
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
            conn.commit()
        
        if success:
            return jsonify({'success': True, 'message': 'Cube updated'})
        else:
            return jsonify({'error': 'Failed to update cube'}), 400
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/cubes/<int:cube_id>', methods=['DELETE'])
def delete_cube(cube_id):
    """Deactivate a cube"""
    try:
        cube_manager = CubeManager()
        with cube_manager.db_manager.get_connection() as conn:
            cube_manager.delete_cube(cube_id)
            conn.commit()
        
        return jsonify({'success': True, 'message': 'Cube deactivated'})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500