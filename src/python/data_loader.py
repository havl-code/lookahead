"""
WCA Database Loader
Loads WCA export TSV files into pandas DataFrames
"""

import pandas as pd
import os
from pathlib import Path
import yaml


class WCADataLoader:
    """Load and manage WCA database exports"""
    
    def __init__(self, data_dir="data/raw"):
        self.data_dir = Path(data_dir)
        self.dataframes = {}
        
    def list_available_files(self):
        """List all TSV files in the data directory"""
        tsv_files = list(self.data_dir.glob("*.tsv"))
        print(f"Found {len(tsv_files)} TSV files:")
        for f in tsv_files:
            size_mb = f.stat().st_size / (1024 * 1024)
            print(f"  - {f.name:<40} ({size_mb:.1f} MB)")
        return tsv_files
    
    def load_table(self, table_name, nrows=None):
        """
        Load a specific WCA table
        
        Args:
            table_name: Name of table (e.g., 'Persons', 'Results', 'Competitions')
            nrows: Number of rows to load (None = all rows)
        
        Returns:
            pandas DataFrame
        """
        filename = f"WCA_export_{table_name}.tsv"
        filepath = self.data_dir / filename
        
        if not filepath.exists():
            raise FileNotFoundError(f"File not found: {filepath}")
        
        print(f"Loading {table_name}...", end=" ")
        
        try:
            df = pd.read_csv(filepath, sep='\t', nrows=nrows, low_memory=False)
            self.dataframes[table_name] = df
            print(f"✓ Loaded {len(df):,} rows, {len(df.columns)} columns")
            return df
        except Exception as e:
            print(f"✗ Error: {e}")
            return None
    
    def load_all_tables(self, sample=False):
        """
        Load all main WCA tables
        
        Args:
            sample: If True, load only first 10000 rows of each table
        """
        tables = [
            'Persons',
            'Competitions', 
            'Results',
            'Events',
            'Countries',
            'RanksSingle',
            'RanksAverage'
        ]
        
        nrows = 10000 if sample else None
        
        for table in tables:
            self.load_table(table, nrows=nrows)
        
        return self.dataframes
    
    def get_table_info(self, table_name):
        """Get detailed info about a loaded table"""
        if table_name not in self.dataframes:
            print(f"Table '{table_name}' not loaded yet")
            return
        
        df = self.dataframes[table_name]
        
        print(f"\n{'='*60}")
        print(f"TABLE: {table_name}")
        print(f"{'='*60}")
        print(f"Rows: {len(df):,}")
        print(f"Columns: {len(df.columns)}")
        print(f"\nColumn Details:")
        print(f"{'Column':<30} {'Type':<15} {'Non-Null':<12} {'Nulls'}")
        print("-" * 70)
        
        for col in df.columns:
            dtype = str(df[col].dtype)
            non_null = df[col].count()
            null_count = df[col].isnull().sum()
            print(f"{col:<30} {dtype:<15} {non_null:<12,} {null_count:,}")
        
        print(f"\nMemory usage: {df.memory_usage(deep=True).sum() / 1024**2:.2f} MB")
        
    def preview_table(self, table_name, n=5):
        """Show first n rows of a table"""
        if table_name not in self.dataframes:
            print(f"Table '{table_name}' not loaded yet")
            return
        
        df = self.dataframes[table_name]
        print(f"\n{table_name} - First {n} rows:")
        print(df.head(n))


# Quick test function
def quick_test():
    """Quick test to see if data loads"""
    loader = WCADataLoader()
    
    print("Available files:")
    loader.list_available_files()
    
    print("\n" + "="*60)
    print("Loading sample data (first 1000 rows)...")
    print("="*60 + "\n")
    
    # Load small samples first
    loader.load_table('Persons', nrows=1000)
    loader.load_table('Results', nrows=1000)
    loader.load_table('Events')
    
    # Show info
    loader.get_table_info('Persons')
    loader.preview_table('Persons', n=3)
    
    loader.get_table_info('Events')
    loader.preview_table('Events')
    
    return loader


if __name__ == "__main__":
    # Run quick test
    loader = quick_test()