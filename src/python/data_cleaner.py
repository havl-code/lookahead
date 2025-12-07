"""
WCA Data Cleaner
Clean and prepare WCA data for analysis
"""

import pandas as pd
import numpy as np
from data_loader import WCADataLoader


class WCADataCleaner:
    """Clean WCA database for analysis"""
    
    def __init__(self, loader):
        self.loader = loader
        self.cleaned = {}
    
    def clean_results(self):
        """Clean Results table"""
        df = self.loader.dataframes.get('Results')
        if df is None:
            print("Results table not loaded")
            return None
        
        print("\nCleaning Results table...")
        original_rows = len(df)
        
        cleaned = df.copy()
        
        # Handle special WCA values: -1 = DNF, -2 = DNS, 0 = not applicable
        time_cols = ['best', 'average', 'value1', 'value2', 'value3', 'value4', 'value5']
        
        for col in time_cols:
            if col in cleaned.columns:
                # Replace DNF/DNS/0 with NaN for numerical analysis
                cleaned[col] = cleaned[col].replace(-1, np.nan)
                cleaned[col] = cleaned[col].replace(-2, np.nan)
                cleaned[col] = cleaned[col].replace(0, np.nan)
        
        # Remove rows with no valid best time
        cleaned = cleaned.dropna(subset=['best'], how='all')
        
        # Clean IDs
        if 'eventId' in cleaned.columns:
            cleaned['eventId'] = cleaned['eventId'].str.strip()
        if 'personId' in cleaned.columns:
            cleaned['personId'] = cleaned['personId'].str.strip()
        
        print(f"  Original: {original_rows:,} rows")
        print(f"  Cleaned: {len(cleaned):,} rows")
        print(f"  Removed: {original_rows - len(cleaned):,} rows")
        
        self.cleaned['Results'] = cleaned
        return cleaned
    
    def clean_persons(self):
        """Clean Persons table"""
        df = self.loader.dataframes.get('Persons')
        if df is None:
            print("Persons table not loaded")
            return None
        
        print("\nCleaning Persons table...")
        original_rows = len(df)
        
        cleaned = df.copy()
        
        # Remove rows without IDs
        cleaned = cleaned.dropna(subset=['id'])
        
        # Clean text columns
        if 'name' in cleaned.columns:
            cleaned['name'] = cleaned['name'].str.strip()
        if 'countryId' in cleaned.columns:
            cleaned['countryId'] = cleaned['countryId'].str.strip()
        
        # Standardize gender
        if 'gender' in cleaned.columns:
            cleaned['gender'] = cleaned['gender'].str.lower()
            cleaned['gender'] = cleaned['gender'].fillna('o')
        
        print(f"  Original: {original_rows:,} rows")
        print(f"  Cleaned: {len(cleaned):,} rows")
        
        self.cleaned['Persons'] = cleaned
        return cleaned
    
    def clean_all_tables(self):
        """Clean all loaded tables"""
        print("="*60)
        print("CLEANING WCA DATA")
        print("="*60)
        
        self.clean_persons()
        self.clean_results()
        
        # Copy reference tables without changes
        for table in ['Events', 'Countries']:
            if table in self.loader.dataframes:
                self.cleaned[table] = self.loader.dataframes[table].copy()
                print(f"\n{table}: Copied without changes ({len(self.cleaned[table]):,} rows)")
        
        print("\n" + "="*60)
        print("CLEANING COMPLETE")
        print("="*60)
        
        return self.cleaned
    
    def summary(self):
        """Show cleaned data summary"""
        print("\n" + "="*60)
        print("CLEANED DATA SUMMARY")
        print("="*60)
        for table_name, df in self.cleaned.items():
            print(f"{table_name:<20} {len(df):>10,} rows")


def main():
    """Test data cleaning"""
    loader = WCADataLoader()
    
    print("Loading sample data...")
    loader.load_table('Persons', nrows=5000)
    loader.load_table('Results', nrows=5000)
    loader.load_table('Events')
    loader.load_table('Countries')
    
    cleaner = WCADataCleaner(loader)
    cleaner.clean_all_tables()
    cleaner.summary()
    
    print("\n" + "="*60)
    print("SAMPLE: First 3 cleaned Results")
    print("="*60)
    if 'Results' in cleaner.cleaned:
        print(cleaner.cleaned['Results'][['eventId', 'personId', 'best', 'average']].head(3))
    
    return cleaner


if __name__ == "__main__":
    cleaner = main()