"""
Data Visualizer
Create charts and graphs for WCA data
"""

import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
from analyzer import WCAAnalyzer
from pathlib import Path

# Set style
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (12, 6)


class Visualizer:
    """Create visualizations for WCA data"""
    
    def __init__(self, analyzer):
        self.analyzer = analyzer
        self.output_dir = Path("data/processed")
        self.output_dir.mkdir(exist_ok=True)
    
    def plot_time_distribution(self, event_id='333', save=True):
        """Plot distribution of solve times"""
        query = f"""
        SELECT best FROM results
        WHERE eventId = '{event_id}'
        AND best IS NOT NULL
        AND best > 0
        """
        
        df = pd.read_sql_query(query, self.analyzer.conn)
        times = df['best'] / 100  # Convert to seconds
        
        # Create plot
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
        
        # Histogram
        ax1.hist(times, bins=50, edgecolor='black', alpha=0.7)
        ax1.set_xlabel('Time (seconds)')
        ax1.set_ylabel('Frequency')
        ax1.set_title(f'{event_id} - Time Distribution')
        ax1.axvline(times.median(), color='red', linestyle='--', label=f'Median: {times.median():.2f}s')
        ax1.legend()
        
        # Box plot
        ax2.boxplot(times, vert=True)
        ax2.set_ylabel('Time (seconds)')
        ax2.set_title(f'{event_id} - Box Plot')
        ax2.set_xticklabels([event_id])
        
        plt.tight_layout()
        
        if save:
            filename = self.output_dir / f"{event_id}_distribution.png"
            plt.savefig(filename, dpi=300, bbox_inches='tight')
            print(f"✓ Saved: {filename}")
        
        plt.show()
        return fig
    
    def plot_top_solvers(self, event_id='333', limit=15, save=True):
        """Bar chart of top solvers"""
        top = self.analyzer.get_top_solvers(event_id, limit)
        
        fig, ax = plt.subplots(figsize=(10, 8))
        
        # Create bar chart
        bars = ax.barh(range(len(top)), top['personal_best'])
        ax.set_yticks(range(len(top)))
        ax.set_yticklabels(top['name'])
        ax.set_xlabel('Personal Best (seconds)')
        ax.set_title(f'Top {limit} Solvers - {event_id}')
        ax.invert_yaxis()
        
        # Add country flags as text
        for i, country in enumerate(top['countryId']):
            ax.text(0.1, i, f"({country})", va='center', fontsize=8)
        
        plt.tight_layout()
        
        if save:
            filename = self.output_dir / f"{event_id}_top_solvers.png"
            plt.savefig(filename, dpi=300, bbox_inches='tight')
            print(f"✓ Saved: {filename}")
        
        plt.show()
        return fig
    
    def plot_percentile_comparison(self, times_to_compare, event_id='333', save=True):
        """Show where different times rank"""
        fig, ax = plt.subplots(figsize=(12, 6))
        
        percentiles = []
        for time in times_to_compare:
            comp = self.analyzer.compare_to_world(time, event_id)
            percentiles.append(comp['percentile'])
        
        # Create bar chart
        bars = ax.bar(range(len(times_to_compare)), percentiles)
        ax.set_xticks(range(len(times_to_compare)))
        ax.set_xticklabels([f"{t}s" for t in times_to_compare])
        ax.set_xlabel('Solve Time')
        ax.set_ylabel('Percentile (% faster than)')
        ax.set_title(f'Percentile Ranking - {event_id}')
        ax.set_ylim(0, 100)
        
        # Add value labels on bars
        for i, (bar, pct) in enumerate(zip(bars, percentiles)):
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height,
                   f'{pct:.1f}%', ha='center', va='bottom')
        
        plt.tight_layout()
        
        if save:
            filename = self.output_dir / f"{event_id}_percentile_comparison.png"
            plt.savefig(filename, dpi=300, bbox_inches='tight')
            print(f"✓ Saved: {filename}")
        
        plt.show()
        return fig
    
    def plot_country_comparison(self, countries, event_id='333', save=True):
        """Compare performance across countries"""
        fig, ax = plt.subplots(figsize=(12, 6))
        
        data = []
        for country in countries:
            query = f"""
            SELECT best FROM results r
            JOIN persons p ON r.personId = p.id
            WHERE r.eventId = '{event_id}'
            AND p.countryId = '{country}'
            AND r.best IS NOT NULL
            AND r.best > 0
            """
            df = pd.read_sql_query(query, self.analyzer.conn)
            if len(df) > 0:
                times = df['best'] / 100
                data.append(times)
            else:
                data.append([])
        
        # Create box plot
        ax.boxplot(data, labels=countries)
        ax.set_ylabel('Time (seconds)')
        ax.set_xlabel('Country')
        ax.set_title(f'Country Comparison - {event_id}')
        plt.xticks(rotation=45)
        
        plt.tight_layout()
        
        if save:
            filename = self.output_dir / f"{event_id}_country_comparison.png"
            plt.savefig(filename, dpi=300, bbox_inches='tight')
            print(f"✓ Saved: {filename}")
        
        plt.show()
        return fig


def main():
    """Test visualizer"""
    print("="*60)
    print("CREATING VISUALIZATIONS")
    print("="*60)
    
    # Set up
    analyzer = WCAAnalyzer()
    analyzer.connect()
    
    viz = Visualizer(analyzer)
    
    # Create visualizations
    print("\n1. Time Distribution...")
    viz.plot_time_distribution('333')
    
    print("\n2. Top Solvers...")
    viz.plot_top_solvers('333', limit=10)
    
    print("\n3. Percentile Comparison...")
    viz.plot_percentile_comparison([10, 15, 20, 25, 30], '333')
    
    analyzer.disconnect()
    
    print("\n" + "="*60)
    print("✓ VISUALIZATIONS CREATED")
    print("="*60)
    print(f"Saved to: data/processed/")


if __name__ == "__main__":
    main()