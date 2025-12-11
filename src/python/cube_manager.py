"""
Cube Manager
Manage your speedcube inventory
"""

import sqlite3
from pathlib import Path
import pandas as pd
from datetime import datetime


class CubeManager:
    """Manage speedcube inventory"""
    
    def __init__(self, db_path="data/speedcube.db"):
        self.db_path = Path(db_path)
        self.conn = None
    
    def connect(self):
        """Connect to database"""
        self.conn = sqlite3.connect(self.db_path)
    
    def disconnect(self):
        """Close connection"""
        if self.conn:
            self.conn.close()
    
    def add_cube(self, name, brand='', model='', purchase_date=None, notes=''):
        """Add a new cube to inventory"""
        cursor = self.conn.cursor()
        
        query = """
        INSERT INTO cubes (name, brand, model, purchase_date, notes)
        VALUES (?, ?, ?, ?, ?)
        """
        
        cursor.execute(query, (name, brand, model, purchase_date, notes))
        self.conn.commit()
        
        cube_id = cursor.lastrowid
        print(f"✓ Added cube: {name} (ID: {cube_id})")
        return cube_id
    
    def list_cubes(self, active_only=True):
        """List all cubes"""
        query = """
        SELECT id, name, brand, model, purchase_date, is_active
        FROM cubes
        """
        
        if active_only:
            query += " WHERE is_active = 1"
        
        query += " ORDER BY name"
        
        df = pd.read_sql_query(query, self.conn)
        return df
    
    def get_cube(self, cube_id):
        """Get cube details"""
        query = "SELECT * FROM cubes WHERE id = ?"
        cursor = self.conn.cursor()
        cursor.execute(query, (cube_id,))
        return cursor.fetchone()
    
    def update_cube(self, cube_id, **kwargs):
        """Update cube details"""
        allowed_fields = ['name', 'brand', 'model', 'purchase_date', 'notes', 'is_active']
        
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
        
        cursor = self.conn.cursor()
        cursor.execute(query, params)
        self.conn.commit()
        
        print(f"✓ Updated cube ID {cube_id}")
        return True
    
    def delete_cube(self, cube_id):
        """Deactivate a cube"""
        cursor = self.conn.cursor()
        cursor.execute("UPDATE cubes SET is_active = 0 WHERE id = ?", (cube_id,))
        self.conn.commit()
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
        
        df = pd.read_sql_query(query, self.conn, params=(cube_id,))
        return df
    
    def compare_cubes(self):
        """Compare performance across all cubes"""
        query = """
        SELECT 
            c.name as cube_name,
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
        
        df = pd.read_sql_query(query, self.conn)
        return df


def interactive_cube_management():
    """Interactive cube management menu"""
    manager = CubeManager()
    manager.connect()
    
    while True:
        print("\n" + "="*60)
        print("CUBE MANAGEMENT")
        print("="*60)
        print("1. List all cubes")
        print("2. Add new cube")
        print("3. View cube stats")
        print("4. Compare cubes")
        print("5. Edit cube")
        print("6. Deactivate cube")
        print("7. Back")
        
        choice = input("\nChoice: ").strip()
        
        if choice == '1':
            cubes = manager.list_cubes()
            print("\n" + cubes.to_string(index=False))
        
        elif choice == '2':
            print("\nAdd New Cube")
            name = input("Cube name (e.g., 'Main 3x3'): ").strip()
            brand = input("Brand (e.g., 'GAN'): ").strip()
            model = input("Model (e.g., '14 MagLev'): ").strip()
            notes = input("Notes (optional): ").strip()
            
            manager.add_cube(name, brand, model, notes=notes)
        
        elif choice == '3':
            cube_id = int(input("Cube ID: "))
            stats = manager.get_cube_stats(cube_id)
            print("\n" + stats.to_string(index=False))
        
        elif choice == '4':
            comparison = manager.compare_cubes()
            print("\n" + comparison.to_string(index=False))
        
        elif choice == '5':
            cube_id = int(input("Cube ID to edit: "))
            print("Leave blank to skip field")
            name = input("New name: ").strip()
            brand = input("New brand: ").strip()
            
            updates = {}
            if name: updates['name'] = name
            if brand: updates['brand'] = brand
            
            if updates:
                manager.update_cube(cube_id, **updates)
        
        elif choice == '6':
            cube_id = int(input("Cube ID to deactivate: "))
            confirm = input("Confirm? (yes/no): ")
            if confirm.lower() == 'yes':
                manager.delete_cube(cube_id)
        
        elif choice == '7':
            break
    
    manager.disconnect()


if __name__ == "__main__":
    interactive_cube_management()