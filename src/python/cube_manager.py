"""
Cube Manager
"""

from pathlib import Path
import pandas as pd
from datetime import datetime
import sys

# Import the DatabaseManager
sys.path.insert(0, str(Path(__file__).parent))
from db_manager import DatabaseManager


class CubeManager:
    """Manage speedcube inventory"""
    
    def __init__(self, db_path="data/speedcube.db"):
        self.db_manager = DatabaseManager(db_path)
    
    def connect(self):
        """Connect to database"""
        return self.db_manager.connect()
    
    @property
    def conn(self):
        """Get current connection"""
        return self.db_manager.conn
    
    def disconnect(self):
        """Close connection"""
        self.db_manager.disconnect()
    
    def add_cube(self, cube_type='', brand='', model='', purchase_date=None, notes=''):
        """Add a new cube to inventory"""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            query = """
            INSERT INTO cubes (cube_type, brand, model, purchase_date, notes)
            VALUES (?, ?, ?, ?, ?)
            """
            
            cursor.execute(query, (cube_type, brand, model, purchase_date, notes))
            conn.commit()
            
            cube_id = cursor.lastrowid
            print(f"✓ Added cube: {cube_type} (ID: {cube_id})")
            return cube_id
    
    def list_cubes(self, active_only=True):
        """List all cubes"""
        query = """
        SELECT id, cube_type, brand, model, purchase_date, is_active, notes
        FROM cubes
        """
        
        if active_only:
            query += " WHERE is_active = 1"
        
        query += " ORDER BY cube_type"
        
        with self.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn)
        return df
    
    def get_cube(self, cube_id):
        """Get cube details"""
        query = "SELECT * FROM cubes WHERE id = ?"
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, (cube_id,))
            return cursor.fetchone()
    
    def update_cube(self, cube_id, **kwargs):
        """Update cube details"""
        allowed_fields = ['cube_type', 'brand', 'model', 'purchase_date', 'notes', 'is_active']
        
        updates = []
        params = []
        
        for field, value in kwargs.items():
            if field in allowed_fields:
                updates.append(f"{field} = ?")
                params.append(value)
        
        if not updates:
            return False
        
        params.append(cube_id)
        query = f"UPDATE cubes SET {', '.join(updates)} WHERE id = ?"
        
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()
        
        print(f"✓ Updated cube ID {cube_id}")
        return True
    
    def delete_cube(self, cube_id):
        """Deactivate a cube"""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE cubes SET is_active = 0 WHERE id = ?", (cube_id,))
            conn.commit()
        print(f"✓ Deactivated cube ID {cube_id}")
    
    def get_cube_stats(self, cube_id):
        """Get performance stats for a cube"""
        query = """
        SELECT 
            COUNT(*) as sessions,
            SUM(solve_count) as total_solves,
            MIN(best_single)/1000.0 as pb,
            AVG(session_mean)/1000.0 as avg_mean
        FROM training_sessions
        WHERE cube_id = ? AND solve_count > 0
        """
        
        with self.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=(cube_id,))
        return df
    
    def compare_cubes(self):
        """Compare performance across all cubes"""
        query = """
        SELECT 
            c.cube_type,
            c.brand,
            c.model,
            COUNT(ts.id) as sessions,
            SUM(ts.solve_count) as total_solves,
            MIN(ts.best_single)/1000.0 as pb,
            AVG(ts.session_mean)/1000.0 as avg_mean
        FROM cubes c
        LEFT JOIN training_sessions ts ON c.id = ts.cube_id
        WHERE c.is_active = 1
        GROUP BY c.id
        ORDER BY pb
        """
        
        with self.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn)
        return df