"""
Data Visualizer
Create charts and graphs using WCA REST API data
"""

import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, 'src/python')
from wca_api_client import WCAApiClient
from training_logger import TrainingLogger

# Set style
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (12, 6)


class Visualizer:
    """Create visualizations using WCA API data"""
    
    def __init__(self):
        self.api = WCAApiClient()
        self.output_dir = Path("data/processed")
        self.output_dir.mkdir(exist_ok=True, parents=True)
    
    def plot_time_distribution(self, event_id='333', save=True):
        """Plot distribution of top ranked solve times"""
        print(f"Fetching {event_id} rankings...")
        rankings = self.api.get_rankings('world', 'single', event_id)
        
        if not rankings:
            print("✗ Could not fetch rankings")
            return None
        
        # Extract times
        times = []
        for rank in rankings:
            result = rank.get('best', 0)
            if result > 0:
                times.append(result / 100)  # Convert to seconds
        
        times = pd.Series(times)
        
        # Create plot
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
        
        # Histogram
        ax1.hist(times, bins=50, edgecolor='black', alpha=0.7, color='steelblue')
        ax1.set_xlabel('Time (seconds)')
        ax1.set_ylabel('Frequency')
        ax1.set_title(f'{event_id} - Time Distribution (Top Ranked)')
        ax1.axvline(times.median(), color='red', linestyle='--', 
                   label=f'Median: {times.median():.2f}s', linewidth=2)
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        # Box plot
        bp = ax2.boxplot(times, vert=True, patch_artist=True)
        bp['boxes'][0].set_facecolor('lightblue')
        ax2.set_ylabel('Time (seconds)')
        ax2.set_title(f'{event_id} - Box Plot')
        ax2.set_xticklabels([event_id])
        ax2.grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        if save:
            filename = self.output_dir / f"{event_id}_distribution.png"
            plt.savefig(filename, dpi=300, bbox_inches='tight')
            print(f"✓ Saved: {filename}")
        
        plt.show()
        return fig
    
    def plot_top_solvers(self, event_id='333', limit=15, save=True):
        """Bar chart of top solvers"""
        print(f"Fetching top {limit} solvers for {event_id}...")
        rankings = self.api.get_rankings('world', 'single', event_id)
        
        if not rankings:
            print("✗ Could not fetch rankings")
            return None
        
        # Get top N with person details
        top_data = []
        for rank in rankings[:limit]:
            person_id = rank.get('personId')
            time = rank.get('best', 0) / 100
            world_rank = rank.get('rank', {}).get('world', 0)
            
            # Get person details
            person = self.api.get_person(person_id)
            name = person.get('name', person_id) if person else person_id
            country = person.get('country', 'Unknown') if person else 'Unknown'
            
            top_data.append({
                'name': name,
                'country': country,
                'time': time,
                'rank': world_rank
            })
        
        df = pd.DataFrame(top_data)
        
        fig, ax = plt.subplots(figsize=(10, 8))
        
        # Create bar chart
        bars = ax.barh(range(len(df)), df['time'], color='steelblue')
        ax.set_yticks(range(len(df)))
        ax.set_yticklabels([f"#{row['rank']}. {row['name']}" for _, row in df.iterrows()])
        ax.set_xlabel('Personal Best (seconds)')
        ax.set_title(f'Top {limit} Solvers - {event_id}')
        ax.invert_yaxis()
        ax.grid(True, alpha=0.3, axis='x')
        
        # Add country labels
        for i, row in df.iterrows():
            ax.text(row['time'] + 0.1, i, f"({row['country']})", 
                   va='center', fontsize=8, color='gray')
        
        plt.tight_layout()
        
        if save:
            filename = self.output_dir / f"{event_id}_top_solvers.png"
            plt.savefig(filename, dpi=300, bbox_inches='tight')
            print(f"✓ Saved: {filename}")
        
        plt.show()
        return fig
    
    def plot_percentile_comparison(self, times_to_compare, event_id='333', save=True):
        """Show where different times rank"""
        print(f"Calculating percentiles for {len(times_to_compare)} times...")
        
        fig, ax = plt.subplots(figsize=(12, 6))
        
        percentiles = []
        ranks = []
        
        for time in times_to_compare:
            comp = self.api.estimate_percentile(time, event_id, 'single')
            percentiles.append(comp['percentile'])
            ranks.append(comp['rank_estimate'])
        
        # Create bar chart
        x_pos = np.arange(len(times_to_compare))
        bars = ax.bar(x_pos, percentiles, color='steelblue', alpha=0.7)
        
        ax.set_xticks(x_pos)
        ax.set_xticklabels([f"{t:.1f}s" for t in times_to_compare])
        ax.set_xlabel('Solve Time')
        ax.set_ylabel('Percentile (faster than %)')
        ax.set_title(f'Percentile Ranking - {event_id}')
        ax.set_ylim(0, 100)
        ax.grid(True, alpha=0.3, axis='y')
        
        # Add value labels on bars
        for i, (bar, pct, rank) in enumerate(zip(bars, percentiles, ranks)):
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height + 1,
                   f'{pct:.1f}%\n~#{rank}', 
                   ha='center', va='bottom', fontsize=9)
        
        plt.tight_layout()
        
        if save:
            filename = self.output_dir / f"{event_id}_percentile_comparison.png"
            plt.savefig(filename, dpi=300, bbox_inches='tight')
            print(f"✓ Saved: {filename}")
        
        plt.show()
        return fig
    
    def plot_personal_progress(self, save=True):
        """Plot personal training progress"""
        print("Loading personal training data...")
        
        logger = TrainingLogger()
        logger.connect()
        
        query = """
        SELECT 
            date,
            best_single/1000.0 as best,
            session_mean/1000.0 as mean,
            ao5/1000.0 as ao5,
            ao12/1000.0 as ao12
        FROM training_sessions
        WHERE solve_count >= 5
        ORDER BY date
        """
        
        df = pd.read_sql_query(query, logger.conn)
        logger.disconnect()
        
        if len(df) < 2:
            print("✗ Need at least 2 sessions to plot progress")
            return None
        
        fig, ax = plt.subplots(figsize=(12, 6))
        
        # Plot lines
        ax.plot(df.index, df['best'], label='Best Single', 
               marker='o', linewidth=2, markersize=6)
        ax.plot(df.index, df['mean'], label='Session Mean', 
               marker='s', linewidth=2, markersize=6)
        
        if df['ao5'].notna().any():
            ax.plot(df.index, df['ao5'], label='Ao5', 
                   marker='^', linewidth=2, markersize=6)
        
        if df['ao12'].notna().any():
            ax.plot(df.index, df['ao12'], label='Ao12', 
                   marker='d', linewidth=2, markersize=6)
        
        ax.set_xlabel('Session Number')
        ax.set_ylabel('Time (seconds)')
        ax.set_title('Your Training Progress Over Time')
        ax.legend(loc='best')
        ax.grid(True, alpha=0.3)
        
        # Add trend line for mean
        if len(df) > 3:
            z = np.polyfit(df.index, df['mean'], 1)
            p = np.poly1d(z)
            ax.plot(df.index, p(df.index), "--", alpha=0.5, 
                   color='gray', label='Trend')
        
        plt.tight_layout()
        
        if save:
            filename = self.output_dir / "my_progress.png"
            plt.savefig(filename, dpi=300, bbox_inches='tight')
            print(f"✓ Saved: {filename}")
        
        plt.show()
        return fig


def main():
    """Generate all visualizations"""
    print("="*60)
    print("CREATING VISUALIZATIONS")
    print("="*60)
    
    viz = Visualizer()
    
    # 1. Time distribution
    print("\n1. Time Distribution (Top Ranked)...")
    viz.plot_time_distribution('333')
    
    # 2. Top solvers
    print("\n2. Top Solvers...")
    viz.plot_top_solvers('333', limit=10)
    
    # 3. Percentile comparison
    print("\n3. Percentile Comparison...")
    test_times = [5.0, 8.0, 10.0, 12.0, 15.0, 20.0, 25.0, 30.0]
    viz.plot_percentile_comparison(test_times, '333')
    
    # 4. Personal progress (if data exists)
    print("\n4. Personal Progress...")
    try:
        viz.plot_personal_progress()
    except Exception as e:
        print(f"✗ Could not plot personal progress: {e}")
        print("  (This is normal if you haven't logged any sessions yet)")
    
    print("\n" + "="*60)
    print("✓ VISUALIZATIONS CREATED")
    print("="*60)
    print(f"Saved to: data/processed/")


if __name__ == "__main__":
    main()