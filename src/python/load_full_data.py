"""
Load Full WCA Dataset
Load all important WCA tables (this takes a few minutes)
"""

from data_loader import WCADataLoader
from data_cleaner import WCADataCleaner


def load_full_dataset():
    """Load complete WCA dataset"""
    print("="*60)
    print("LOADING FULL WCA DATASET")
    print("="*60)
    print("\nThis will take 5-10 minutes...")
    print("Loading ALL rows from all tables\n")
    
    loader = WCADataLoader()
    
    # Load all tables (no row limit!)
    loader.load_table('Events')
    loader.load_table('Countries')
    loader.load_table('Persons')
    loader.load_table('Competitions')
    loader.load_table('RanksSingle')
    loader.load_table('RanksAverage')
    
    # Results is HUGE (643MB, millions of rows) - load last
    print("\nNow loading Results (this is the big one)...")
    loader.load_table('Results')
    
    print("\n" + "="*60)
    print("LOADING COMPLETE")
    print("="*60)
    
    # Show summary
    print("\nDataset Summary:")
    for name, df in loader.dataframes.items():
        print(f"  {name:<20} {len(df):>12,} rows  {df.memory_usage(deep=True).sum() / 1024**2:>8.1f} MB")
    
    return loader


def load_sample_dataset(nrows=10000):
    """Load sample dataset for quick testing"""
    print("="*60)
    print(f"LOADING SAMPLE DATASET ({nrows:,} rows per table)")
    print("="*60)
    
    loader = WCADataLoader()
    
    loader.load_table('Events')
    loader.load_table('Countries')
    loader.load_table('Persons', nrows=nrows)
    loader.load_table('Competitions', nrows=nrows)
    loader.load_table('Results', nrows=nrows)
    loader.load_table('RanksSingle', nrows=nrows)
    loader.load_table('RanksAverage', nrows=nrows)
    
    print("\n" + "="*60)
    print("Dataset Summary:")
    for name, df in loader.dataframes.items():
        print(f"  {name:<20} {len(df):>12,} rows")
    
    return loader


if __name__ == "__main__":
    import sys
    
    # Check command line argument
    if len(sys.argv) > 1 and sys.argv[1] == '--full':
        print("\n⚠️  WARNING: Loading FULL dataset (millions of rows)")
        response = input("This will use ~2GB RAM. Continue? (yes/no): ")
        if response.lower() == 'yes':
            loader = load_full_dataset()
        else:
            print("Cancelled.")
    else:
        print("\n💡 TIP: Run with --full flag to load complete dataset")
        print("   Example: python src/python/load_full_data.py --full\n")
        loader = load_sample_dataset(10000)