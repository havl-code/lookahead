"""
Database Manager with connection pooling and WAL mode
"""

import sqlite3
from pathlib import Path
from contextlib import contextmanager
import threading

class DatabaseManager:
    """Manage SQLite database with proper locking"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, db_path="data/speedcube.db"):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, db_path="data/speedcube.db"):
        if self._initialized:
            return
            
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._initialized = True
        
        # Initialize WAL mode
        self._init_wal_mode()
    
    def _init_wal_mode(self):
        """Enable WAL mode for better concurrent access"""
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA busy_timeout=30000')
        conn.execute('PRAGMA synchronous=NORMAL')
        conn.close()
    
    @contextmanager
    def get_connection(self):
        """Get a thread-local connection"""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(
                self.db_path,
                timeout=30.0,
                check_same_thread=False
            )
            self._local.conn.execute('PRAGMA journal_mode=WAL')
            self._local.conn.execute('PRAGMA busy_timeout=30000')
        
        try:
            yield self._local.conn
        except Exception as e:
            self._local.conn.rollback()
            raise e
    
    def connect(self):
        """Legacy connect method for backward compatibility"""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(
                self.db_path,
                timeout=30.0,
                check_same_thread=False
            )
            self._local.conn.execute('PRAGMA journal_mode=WAL')
            self._local.conn.execute('PRAGMA busy_timeout=30000')
            self._local.conn.row_factory = sqlite3.Row
        return self._local.conn
    
    @property
    def conn(self):
        """Get current connection"""
        return self.connect()
    
    def disconnect(self):
        """Close connection"""
        if hasattr(self._local, 'conn') and self._local.conn:
            self._local.conn.close()
            self._local.conn = None
    
    def create_schema(self, schema_file="sql/schema.sql"):
        """Create database schema"""
        print("Creating database schema...")
        
        schema_path = Path(schema_file)
        if not schema_path.exists():
            print(f"✗ Schema file not found: {schema_file}")
            return False
        
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        
        with self.get_connection() as conn:
            conn.executescript(schema_sql)
            conn.commit()
        
        print("✓ Schema created")
        return True
    
    def get_table_info(self):
        """Show all tables and row counts"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
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
    db.create_schema()
    db.get_table_info()


if __name__ == "__main__":
    main()