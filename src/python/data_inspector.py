"""
WCA Data Quality Inspector
Check for missing values, outliers, and data issues
"""

import pandas as pd
import numpy as np
from data_loader import WCADataLoader


class DataInspector:
    """Inspect WCA data quality"""
    
    def __init__(self, loader):
        self.loader = loader
        self.issues = []
    
    def check_missing_values(self, table_name):
        """Check for missing values in a table"""
        df = self.loader.dataframes.get(table_name)
        if df is None:
            print(f"Table {table_name} not loaded")
            return
        
        print(f"\n{'='*60}")
        print(f"MISSING VALUES: {table_name}")
        print(f"{'='*60}")
        
        missing = df.isnull().sum()
        missing_pct = (missing / len(df)) * 100
        
        missing_df = pd.DataFrame({
            'Missing': missing,
            'Percentage': missing_pct
        })
        
        # Only show columns with missing values
        missing_df = missing_df[missing_df['Missing'] > 0].sort_values('Missing', ascending=False)
        
        if len(missing_df) == 0:
            print("✓ No missing values!")
        else:
            print(missing_df.to_string())
            self.issues.append(f"{table_name}: {len(missing_df)} columns with missing values")
    
    def check_results_quality(self):
        """Check Results table for data quality issues"""
        df = self.loader.dataframes.get('Results')
        if df is None:
            print("Results table not loaded")
            return
        
        print(f"\n{'='*60}")
        print(f"RESULTS DATA QUALITY")
        print(f"{'='*60}")
        
        # Check for negative times
        time_cols = ['best', 'average', 'value1', 'value2', 'value3', 'value4', 'value5']
        
        for col in time_cols:
            if col in df.columns:
                negative = (df[col] < 0).sum()
                zero = (df[col] == 0).sum()
                dnf = (df[col] == -1).sum()
                dns = (df[col] == -2).sum()
                
                print(f"\n{col}:")
                print(f"  Negative values: {negative:,}")
                print(f"  Zero values: {zero:,}")
                print(f"  DNF (-1): {dnf:,}")
                print(f"  DNS (-2): {dns:,}")
        
        # Check position values
        if 'pos' in df.columns:
            max_pos = df['pos'].max()
            negative_pos = (df['pos'] < 0).sum()
            print(f"\nPosition (pos):")
            print(f"  Max position: {max_pos:,}")
            print(f"  Negative positions: {negative_pos:,}")
        
        # Check for duplicates
        duplicates = df.duplicated().sum()
        print(f"\nDuplicate rows: {duplicates:,}")
    
    def check_persons_quality(self):
        """Check Persons table quality"""
        df = self.loader.dataframes.get('Persons')
        if df is None:
            print("Persons table not loaded")
            return
        
        print(f"\n{'='*60}")
        print(f"PERSONS DATA QUALITY")
        print(f"{'='*60}")
        
        # Check IDs
        print(f"Total persons: {len(df):,}")
        print(f"Unique IDs: {df['id'].nunique():,}")
        
        # Check names
        if 'name' in df.columns:
            empty_names = df['name'].isnull().sum()
            print(f"Empty names: {empty_names:,}")
        
        # Check countries
        if 'countryId' in df.columns:
            unique_countries = df['countryId'].nunique()
            missing_country = df['countryId'].isnull().sum()
            print(f"Unique countries: {unique_countries}")
            print(f"Missing country: {missing_country:,}")
        
        # Check gender distribution
        if 'gender' in df.columns:
            print(f"\nGender distribution:")
            print(df['gender'].value_counts())
    
    def check_events_info(self):
        """Show events information"""
        df = self.loader.dataframes.get('Events')
        if df is None:
            print("Events table not loaded")
            return
        
        print(f"\n{'='*60}")
        print(f"EVENTS INFORMATION")
        print(f"{'='*60}")
        print(df.to_string())
    
    def generate_report(self):
        """Generate full data quality report"""
        print("\n" + "="*60)
        print("WCA DATA QUALITY REPORT")
        print("="*60)
        
        # Check all loaded tables
        for table_name in self.loader.dataframes.keys():
            self.check_missing_values(table_name)
        
        # Detailed checks
        self.check_persons_quality()
        self.check_results_quality()
        self.check_events_info()
        
        # Summary
        print(f"\n{'='*60}")
        print("SUMMARY")
        print(f"{'='*60}")
        if len(self.issues) == 0:
            print("✓ No major data quality issues found!")
        else:
            print(f"Found {len(self.issues)} potential issues:")
            for issue in self.issues:
                print(f"  - {issue}")


def main():
    """Run data quality inspection"""
    print("Loading WCA data...")
    loader = WCADataLoader()
    
    # Load sample data first
    print("\nLoading sample data (first 5000 rows)...")
    loader.load_table('Persons', nrows=5000)
    loader.load_table('Results', nrows=5000)
    loader.load_table('Events')
    loader.load_table('Countries')
    
    # Inspect
    inspector = DataInspector(loader)
    inspector.generate_report()
    
    return inspector


if __name__ == "__main__":
    inspector = main()