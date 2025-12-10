"""
Personal Progress Analyzer
Analyze YOUR training data and compare to WCA
"""
from wca_api_client import WCAApiClient
from training_logger import TrainingLogger
from analyzer import WCAAnalyzer
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

class MyProgressAnalyzer:
    """Analyze personal training progress"""
    
    def __init__(self):
        self.logger = TrainingLogger()
        self.analyzer = WCAAnalyzer()
        self.logger.connect()
        self.analyzer.connect()
    
    def my_stats(self):
        """Show your overall statistics"""
        print("="*60)
        print("YOUR TRAINING STATISTICS")
        print("="*60)
        
        # Get personal bests
        pbs = self.logger.get_personal_bests()
        print("\nPersonal Bests:")
        print(pbs.to_string(index=False))
        
        # Get all sessions
        sessions = self.logger.get_all_sessions()
        print(f"\nTotal Sessions: {len(sessions)}")
        print(f"Total Solves: {sessions['solve_count'].sum()}")
        
        # Calculate overall stats
        query = """
        SELECT 
            AVG(time_ms)/1000.0 as overall_avg,
            MIN(time_ms)/1000.0 as pb,
            MAX(time_ms)/1000.0 as worst,
            COUNT(*) as total_solves
        FROM personal_solves
        WHERE dnf = 0
        """
        stats = pd.read_sql_query(query, self.logger.conn)
        
        print("\nOverall Statistics:")
        print(f"  Personal Best: {stats['pb'].values[0]:.2f}s")
        print(f"  Average: {stats['overall_avg'].values[0]:.2f}s")
        print(f"  Worst: {stats['worst'].values[0]:.2f}s")
        print(f"  Total Solves: {int(stats['total_solves'].values[0]):,}")
    
    # def compare_to_world(self):
    #     """Compare your times to WCA database"""
    #     print("\n" + "="*60)
    #     print("COMPARISON TO WCA COMPETITORS")
    #     print("="*60)
        
    #     # Your PB
    #     pb_query = """
    #     SELECT MIN(time_ms)/1000.0 as pb 
    #     FROM personal_solves 
    #     WHERE dnf = 0
    #     """
    #     my_pb = pd.read_sql_query(pb_query, self.logger.conn)['pb'].values[0]
        
    #     # Your average
    #     avg_query = """
    #     SELECT AVG(time_ms)/1000.0 as avg 
    #     FROM personal_solves 
    #     WHERE dnf = 0
    #     """
    #     my_avg = pd.read_sql_query(avg_query, self.logger.conn)['avg'].values[0]
        
    #     print(f"\nYour PB: {my_pb:.2f}s")
    #     comparison = self.analyzer.compare_to_world(my_pb, '333')
    #     print(f"  Percentile: {comparison['faster_than']}")
    #     print(f"  Rank: {comparison['rank']:,} out of {comparison['total_solves']:,}")
        
    #     print(f"\nYour Average: {my_avg:.2f}s")
    #     comparison_avg = self.analyzer.compare_to_world(my_avg, '333')
    #     print(f"  Percentile: {comparison_avg['faster_than']}")
    #     print(f"  Rank: {comparison_avg['rank']:,} out of {comparison_avg['total_solves']:,}")

    def compare_to_world(self):
        """Compare your times to WCA using live API"""
        print("\n" + "="*60)
        print("COMPARISON TO WCA (Live API)")
        print("="*60)
        
        # Initialize API client
        wca = WCAApiClient()
        
        # Your PB
        pb_query = """
        SELECT MIN(time_ms)/1000.0 as pb 
        FROM personal_solves 
        WHERE dnf = 0
        """
        my_pb = pd.read_sql_query(pb_query, self.logger.conn)['pb'].values[0]
        
        # Your average
        avg_query = """
        SELECT AVG(time_ms)/1000.0 as avg 
        FROM personal_solves 
        WHERE dnf = 0
        """
        my_avg = pd.read_sql_query(avg_query, self.logger.conn)['avg'].values[0]
        
        # Get world record for context
        print("\nWorld Records (3x3x3):")
        wr_single = wca.get_world_record('333', 'single')
        wr_avg = wca.get_world_record('333', 'average')
        
        if wr_single:
            print(f"  Single: {wr_single['time_seconds']:.2f}s by {wr_single['holder']}")
        if wr_avg:
            print(f"  Average: {wr_avg['time_seconds']:.2f}s by {wr_avg['holder']}")
        
        # Compare your PB
        print(f"\nYour Personal Best: {my_pb:.2f}s")
        pb_comparison = wca.estimate_percentile(my_pb, '333', 'single')
        print(f"  Percentile: {pb_comparison['faster_than']}")
        if 'description' in pb_comparison:
            print(f"  Level: {pb_comparison['description']}")
        if 'rank_estimate' in pb_comparison:
            print(f"  Est. Rank: {pb_comparison['rank_estimate']} (of top ranked)")
        print(f"  Note: {pb_comparison['note']}")
        
        # Compare your average
        print(f"\nYour Overall Average: {my_avg:.2f}s")
        avg_comparison = wca.estimate_percentile(my_avg, '333', 'average')
        print(f"  Percentile: {avg_comparison['faster_than']}")
        if 'description' in avg_comparison:
            print(f"  Level: {avg_comparison['description']}")
        print(f"  Note: {avg_comparison['note']}")
    
    def improvement_over_time(self):
        """Show improvement trend"""
        print("\n" + "="*60)
        print("IMPROVEMENT OVER TIME")
        print("="*60)
        
        query = """
        SELECT 
            date,
            best_single,
            session_mean,
            ao5,
            ao12
        FROM training_sessions
        WHERE solve_count >= 5
        ORDER BY date
        """
        
        progress = pd.read_sql_query(query, self.logger.conn)
        
        for col in ['best_single', 'session_mean', 'ao5', 'ao12']:
            if col in progress.columns:
                progress[col] = progress[col] / 1000

        if len(progress) == 0:
            print("Not enough sessions yet!")
            return
        
        print(f"\nFirst session: {progress['date'].iloc[0]}")
        print(f"  Best: {progress['best_single'].iloc[0]:.2f}s")
        print(f"  Ao5: {progress['ao5'].iloc[0]:.2f}s" if progress['ao5'].iloc[0] else "  Ao5: N/A")
        
        print(f"\nLatest session: {progress['date'].iloc[-1]}")
        print(f"  Best: {progress['best_single'].iloc[-1]:.2f}s")
        print(f"  Ao5: {progress['ao5'].iloc[-1]:.2f}s" if progress['ao5'].iloc[-1] else "  Ao5: N/A")
        
        # Calculate improvement
        if progress['ao5'].iloc[0] and progress['ao5'].iloc[-1]:
            improvement = progress['ao5'].iloc[0] - progress['ao5'].iloc[-1]
            print(f"\nAo5 Improvement: {improvement:.2f}s")
    
    def plot_progress(self):
        """Plot progress over time"""
        query = """
        SELECT 
            date,
            best_single,
            session_mean,
            ao5
        FROM training_sessions
        WHERE solve_count >= 5
        ORDER BY date
        """
        
        df = pd.read_sql_query(query, self.logger.conn)
        
        if len(df) < 2:
            print("Need more sessions to plot progress")
            return
        
        fig, ax = plt.subplots(figsize=(12, 6))
        
        ax.plot(df.index, df['best_single'], label='Best Single', marker='o')
        ax.plot(df.index, df['session_mean'], label='Session Mean', marker='s')
        if df['ao5'].notna().any():
            ax.plot(df.index, df['ao5'], label='Ao5', marker='^')
        
        ax.set_xlabel('Session Number')
        ax.set_ylabel('Time (seconds)')
        ax.set_title('Your Progress Over Time')
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.savefig('data/processed/my_progress.png', dpi=300)
        print("\n✓ Saved progress chart: data/processed/my_progress.png")
        plt.show()
    
    def close(self):
        """Close connections"""
        self.logger.disconnect()
        self.analyzer.disconnect()


def main():
    """Analyze your progress"""
    analyzer = MyProgressAnalyzer()
    
    analyzer.my_stats()
    analyzer.compare_to_world()
    analyzer.improvement_over_time()
    analyzer.plot_progress()
    
    analyzer.close()


if __name__ == "__main__":
    main()
