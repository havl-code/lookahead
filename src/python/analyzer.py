"""
WCA Data Analyzer
Statistical analysis and performance metrics
"""

import pandas as pd
import numpy as np
import sqlite3
from pathlib import Path


class WCAAnalyzer:
    """Analyze WCA results and personal performance"""
    
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
    
    def get_event_statistics(self, event_id='333'):
        """Get statistics for a specific event"""
        query = f"""
        SELECT 
            COUNT(*) as total_solves,
            MIN(best) as world_record,
            AVG(best) as average_time,
            MEDIAN(best) as median_time,
            MAX(best) as slowest_time
        FROM results
        WHERE eventId = '{event_id}' 
        AND best IS NOT NULL
        AND best > 0
        """
        
        df = pd.read_sql_query(query, self.conn)
        
        # Convert from centiseconds to seconds
        for col in ['world_record', 'average_time', 'median_time', 'slowest_time']:
            if col in df.columns:
                df[col] = df[col] / 100
        
        return df
    
    def get_top_solvers(self, event_id='333', limit=10):
        """Get top solvers for an event"""
        query = f"""
        SELECT 
            p.name,
            p.countryId,
            MIN(r.best) as personal_best,
            AVG(r.best) as avg_time,
            COUNT(*) as competition_count
        FROM results r
        JOIN persons p ON r.personId = p.id
        WHERE r.eventId = '{event_id}'
        AND r.best IS NOT NULL
        AND r.best > 0
        GROUP BY r.personId
        ORDER BY personal_best
        LIMIT {limit}
        """
        
        df = pd.read_sql_query(query, self.conn)
        
        # Convert times to seconds
        df['personal_best'] = df['personal_best'] / 100
        df['avg_time'] = df['avg_time'] / 100
        
        return df
    
    def get_country_statistics(self, country_id):
        """Get statistics for a specific country"""
        query = f"""
        SELECT 
            COUNT(DISTINCT p.id) as total_competitors,
            COUNT(DISTINCT r.competitionId) as competitions_attended,
            COUNT(*) as total_solves
        FROM persons p
        LEFT JOIN results r ON p.id = r.personId
        WHERE p.countryId = '{country_id}'
        """
        
        return pd.read_sql_query(query, self.conn)
    
    def compare_to_world(self, your_time, event_id='333'):
        """Compare your time to world statistics"""
        query = f"""
        SELECT best FROM results
        WHERE eventId = '{event_id}'
        AND best IS NOT NULL
        AND best > 0
        """
        
        df = pd.read_sql_query(query, self.conn)
        times = df['best'].values
        
        # Your time in centiseconds
        your_time_cs = your_time * 100
        
        # Calculate percentile
        percentile = (times < your_time_cs).sum() / len(times) * 100
        
        # Find rank
        rank = (times < your_time_cs).sum() + 1
        
        return {
            'your_time': your_time,
            'percentile': percentile,
            'rank': rank,
            'total_solves': len(times),
            'faster_than': f"{percentile:.1f}%"
        }
    
    def get_progression_data(self, person_id, event_id='333'):
        """Get progression over time for a person"""
        query = f"""
        SELECT 
            c.year,
            c.month,
            MIN(r.best) as best_single,
            AVG(r.average) as avg_average
        FROM results r
        JOIN competitions c ON r.competitionId = c.id
        WHERE r.personId = '{person_id}'
        AND r.eventId = '{event_id}'
        AND r.best IS NOT NULL
        GROUP BY c.year, c.month
        ORDER BY c.year, c.month
        """
        
        df = pd.read_sql_query(query, self.conn)
        
        # Convert to seconds
        df['best_single'] = df['best_single'] / 100
        df['avg_average'] = df['avg_average'] / 100
        
        return df
    
    def analyze_distribution(self, event_id='333'):
        """Analyze time distribution for an event"""
        query = f"""
        SELECT best FROM results
        WHERE eventId = '{event_id}'
        AND best IS NOT NULL
        AND best > 0
        """
        
        df = pd.read_sql_query(query, self.conn)
        times = df['best'] / 100  # Convert to seconds
        
        stats = {
            'mean': times.mean(),
            'median': times.median(),
            'std': times.std(),
            'min': times.min(),
            'max': times.max(),
            'q25': times.quantile(0.25),
            'q75': times.quantile(0.75)
        }
        
        return stats


def main():
    """Test analyzer"""
    print("="*60)
    print("WCA DATA ANALYSIS")
    print("="*60)
    
    analyzer = WCAAnalyzer()
    analyzer.connect()
    
    # Test 1: Event statistics
    print("\n1. 3x3x3 Cube Statistics:")
    stats = analyzer.get_event_statistics('333')
    print(stats.to_string(index=False))
    
    # Test 2: Top solvers
    print("\n2. Top 10 3x3x3 Solvers (in sample data):")
    top = analyzer.get_top_solvers('333', limit=10)
    print(top.to_string(index=False))
    
    # Test 3: Time distribution
    print("\n3. 3x3x3 Time Distribution:")
    dist = analyzer.analyze_distribution('333')
    print(f"  Mean: {dist['mean']:.2f}s")
    print(f"  Median: {dist['median']:.2f}s")
    print(f"  Std Dev: {dist['std']:.2f}s")
    print(f"  Range: {dist['min']:.2f}s - {dist['max']:.2f}s")
    
    # Test 4: Compare your time
    print("\n4. Compare a 20-second solve to world:")
    comparison = analyzer.compare_to_world(20.0, '333')
    print(f"  Your time: {comparison['your_time']:.2f}s")
    print(f"  Percentile: {comparison['faster_than']}")
    print(f"  Rank: {comparison['rank']:,} out of {comparison['total_solves']:,}")
    
    analyzer.disconnect()
    
    print("\n" + "="*60)
    print("ANALYSIS COMPLETE")
    print("="*60)


if __name__ == "__main__":
    main()