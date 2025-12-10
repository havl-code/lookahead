"""
Database Manager
Manages personal training database only (no WCA import)
"""

import sqlite3
from pathlib import Path


class DatabaseManager:
    """Manage SQLite database for personal training data"""
    
    def __init__(self, db_path="data/speedcube.db"):
        self.db_path = Path(db_path)
        self.conn = None
    
    def connect(self):
        """Connect to database"""
        self.conn = sqlite3.connect(self.db_path)
        print(f"✓ Connected to: {self.db_path}")
    
    def disconnect(self):
        """Close connection"""
        if self.conn:
            self.conn.close()
            print("✓ Disconnected")
    
    def create_schema(self, schema_file="sql/schema.sql"):
        """Create database schema"""
        print("Creating database schema...")
        
        schema_path = Path(schema_file)
        if not schema_path.exists():
            print(f"✗ Schema file not found: {schema_file}")
            return False
        
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        
        self.conn.executescript(schema_sql)
        self.conn.commit()
        
        print("✓ Schema created")
        return True
    
    def get_table_info(self):
        """Show all tables and row counts"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        print("\nDatabase Tables:")
        print("-" * 40)
        for (table_name,) in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            print(f"  {table_name:<30} {count:>8,} rows")


def main():
    """Initialize database"""
    db = DatabaseManager()
    db.connect()
    db.create_schema()
    db.get_table_info()
    db.disconnect()


if __name__ == "__main__":
    main()