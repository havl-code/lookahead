"""
Database Manager
Import WCA data into SQLite database
"""

import sqlite3
from pathlib import Path
import pandas as pd
from data_loader import WCADataLoader
from data_cleaner import WCADataCleaner


class DatabaseManager:
    """Manage SQLite database for WCA data"""
    
    def __init__(self, db_path="data/speedcube.db"):
        self.db_path = Path(db_path)
        self.conn = None
        self.cursor = None
    
    def connect(self):
        """Connect to database"""
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        print(f"✓ Connected to database: {self.db_path}")
    
    def disconnect(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("✓ Database connection closed")
    
    def create_schema(self, schema_file="sql/schema.sql"):
        """Create database schema from SQL file"""
        print("\nCreating database schema...")
        
        schema_path = Path(schema_file)
        if not schema_path.exists():
            print(f"✗ Schema file not found: {schema_file}")
            return False
        
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        
        # Execute schema
        self.cursor.executescript(schema_sql)
        self.conn.commit()
        
        print("✓ Schema created successfully")
        return True
    
    def import_dataframe(self, df, table_name, if_exists='replace'):
        """Import pandas DataFrame into database table"""
        print(f"\nImporting {table_name}...")
        print(f"  Rows: {len(df):,}")
        
        # Import to SQLite
        df.to_sql(table_name, self.conn, if_exists=if_exists, index=False)
        
        print(f"✓ Imported {table_name}")
    
    def import_wca_data(self, loader, cleaner):
        """Import all cleaned WCA data"""
        print("\n" + "="*60)
        print("IMPORTING WCA DATA TO DATABASE")
        print("="*60)
        
        # Import cleaned data
        for table_name, df in cleaner.cleaned.items():
            # Map to database table names (lowercase)
            db_table_name = table_name.lower()
            self.import_dataframe(df, db_table_name, if_exists='replace')
        
        self.conn.commit()
        
        print("\n" + "="*60)
        print("IMPORT COMPLETE")
        print("="*60)
    
    def get_table_info(self):
        """Get info about all tables in database"""
        print("\n" + "="*60)
        print("DATABASE TABLES")
        print("="*60)
        
        # Get all tables
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = self.cursor.fetchall()
        
        for (table_name,) in tables:
            # Count rows
            self.cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = self.cursor.fetchone()[0]
            print(f"  {table_name:<30} {count:>10,} rows")
    
    def test_queries(self):
        """Run some test queries"""
        print("\n" + "="*60)
        print("TEST QUERIES")
        print("="*60)
        
        # Test 1: Count events
        print("\n1. Events in database:")
        df = pd.read_sql_query("SELECT id, name FROM events ORDER BY rank", self.conn)
        print(df.to_string(index=False))
        
        # Test 2: Top 5 countries by competitors
        print("\n2. Top 5 countries by number of competitors:")
        query = """
        SELECT countryId, COUNT(*) as competitors
        FROM persons
        GROUP BY countryId
        ORDER BY competitors DESC
        LIMIT 5
        """
        df = pd.read_sql_query(query, self.conn)
        print(df.to_string(index=False))
        
        # Test 3: Sample results
        print("\n3. Sample results (first 5):")
        query = """
        SELECT eventId, personId, best, average
        FROM results
        WHERE best IS NOT NULL
        LIMIT 5
        """
        df = pd.read_sql_query(query, self.conn)
        print(df.to_string(index=False))
        
        # Test 4: Fastest 3x3 single in sample
        print("\n4. Fastest 3x3 single in sample data:")
        query = """
        SELECT personId, best, average
        FROM results
        WHERE eventId = '333' AND best IS NOT NULL
        ORDER BY best
        LIMIT 1
        """
        df = pd.read_sql_query(query, self.conn)
        if len(df) > 0:
            best_time = df['best'].values[0] / 100  # Convert centiseconds to seconds
            print(f"  Person: {df['personId'].values[0]}")
            print(f"  Time: {best_time:.2f} seconds")


def main():
    """Main function to set up database"""
    print("="*60)
    print("WCA DATABASE SETUP")
    print("="*60)
    
    # Step 1: Load data
    print("\nStep 1: Loading WCA data...")
    loader = WCADataLoader()
    loader.load_table('Events')
    loader.load_table('Countries')
    loader.load_table('Persons', nrows=10000)
    loader.load_table('Results', nrows=10000)
    
    # Step 2: Clean data
    print("\nStep 2: Cleaning data...")
    cleaner = WCADataCleaner(loader)
    cleaner.clean_all_tables()
    
    # Step 3: Create database
    print("\nStep 3: Setting up database...")
    db = DatabaseManager()
    db.connect()
    
    # Create schema
    db.create_schema()
    
    # Import data
    db.import_wca_data(loader, cleaner)
    
    # Show info
    db.get_table_info()
    
    # Run test queries
    db.test_queries()
    
    # Cleanup
    db.disconnect()
    
    print("\n" + "="*60)
    print("✓ DATABASE READY!")
    print("="*60)
    print(f"\nDatabase location: {db.db_path.absolute()}")
    print("\nYou can now query it with:")
    print("  sqlite3 data/speedcube.db")
    
    return db


if __name__ == "__main__":
    db = main()