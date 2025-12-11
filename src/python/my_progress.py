"""
Personal Progress Analyzer
Analyze YOUR training data and compare to WCA via API
"""

from training_logger import TrainingLogger
from wca_api_client import WCAApiClient
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

class MyProgressAnalyzer:
    """Analyze personal training progress"""
    
    def __init__(self):
        self.logger = TrainingLogger()
        self.wca_api = WCAApiClient()
        self.logger.connect()
    
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
    
    def compare_to_world(self):
        """Compare your times to WCA using live API"""
        print("\n" + "="*60)
        print("COMPARISON TO WCA (Live API)")
        print("="*60)
        
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
        wr_single = self.wca_api.get_world_record('333', 'single')
        wr_avg = self.wca_api.get_world_record('333', 'average')
        
        if wr_single:
            print(f"  Single: {wr_single['time_seconds']:.2f}s by {wr_single['holder']}")
        if wr_avg:
            print(f"  Average: {wr_avg['time_seconds']:.2f}s by {wr_avg['holder']}")
        
        # Compare your PB
        print(f"\n{'='*60}")
        print(f"YOUR PERSONAL BEST: {my_pb:.2f}s")
        print(f"{'='*60}")
        
        pb_comparison = self.wca_api.estimate_percentile(my_pb, '333', 'single')
        
        # Interpret percentile
        if pb_comparison['rank_estimate'] != 'N/A':
            rank = pb_comparison['rank_estimate']
            total_str = pb_comparison['total_ranked']
            pct = pb_comparison['percentile']

            if isinstance(total_str, str):
                total = int(total_str.replace('~', '').replace(',', ''))
            else:
                total = total_str
            
            if rank > 1000:  # Outside top 1000
                # Outside top ranked
                print(f"  Rank: Just outside top {total:,} (faster than most non-ranked competitors)")
                print(f"  Level: COMPETITIVE - You're faster than average competitors!")
                print(f"  Context: Top {total:,} ranked solvers are all sub-6 seconds")
                print(f"  Goal: Break into top 1000 = get consistent sub-6s")
            else:
                # Inside top ranked
                faster_than_pct = 100 - pct
                print(f"  Rank: ~{rank:,} out of {total:,} ranked competitors")
                print(f"  Faster than: ~{faster_than_pct:.1f}% of ranked competitors")
                
                if pct < 1:
                    print(f"  Level: ELITE (World-class)")
                elif pct < 10:
                    print(f"  Level: ADVANCED (National/Continental level)")
                elif pct < 50:
                    print(f"  Level: COMPETITIVE (Regional level)")
                else:
                    print(f"  Level: INTERMEDIATE (Ranked competitor)")
        else:
            # Fallback to description
            print(f"  {pb_comparison.get('description', '')}")
            print(f"  {pb_comparison['note']}")
        
        # Context about your time
        print(f"\n  Your time breakdown:")
        if my_pb < 6:
            print(f"    - Sub-6: Top tier! You can compete at high levels")
        elif my_pb < 8:
            print(f"    - Sub-8: Very fast! You're in competitive territory")
        elif my_pb < 10:
            print(f"    - Sub-10: Fast! You're ahead of most casual cubers")
        elif my_pb < 15:
            print(f"    - Sub-15: Good! Keep practicing for competitions")
        elif my_pb < 20:
            print(f"    - Sub-20: Solid! You've passed the beginner phase")
        else:
            print(f"    - Keep practicing! Aim for sub-20 first")
        
        # Compare your average
        print(f"\n{'='*60}")
        print(f"YOUR OVERALL AVERAGE: {my_avg:.2f}s")
        print(f"{'='*60}")
        
        avg_comparison = self.wca_api.estimate_percentile(my_avg, '333', 'average')
        
        if avg_comparison['rank_estimate'] != 'N/A':
            rank = avg_comparison['rank_estimate']
            total = avg_comparison['total_ranked']
            pct = avg_comparison['percentile']
            
            if rank > total:
                print(f"  Rank: Outside top {total:,} ranked")
                print(f"  Consistency: Working towards competitive consistency")
            else:
                faster_than_pct = 100 - pct
                print(f"  Rank: ~{rank:,} out of {total:,} ranked")
                print(f"  Faster than: ~{faster_than_pct:.1f}% of ranked competitors")
        else:
            print(f"  {avg_comparison.get('description', '')}")
        
        # Gap analysis
        pb_avg_gap = my_avg - my_pb
        print(f"\n  Gap between PB and Average: {pb_avg_gap:.2f}s")
        if pb_avg_gap < 2:
            print(f"    → Excellent consistency!")
        elif pb_avg_gap < 4:
            print(f"    → Good consistency, keep it up!")
        elif pb_avg_gap < 6:
            print(f"    → Room for improvement in consistency")
        else:
            print(f"    → Focus on consistency - reduce variance in solve times")
        
        print(f"\n  Total solves analyzed: {pb_comparison.get('total_ranked', 'N/A')}")
    
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
        
        # Convert from milliseconds to seconds
        for col in ['best_single', 'session_mean', 'ao5', 'ao12']:
            if col in progress.columns:
                progress[col] = progress[col] / 1000
        
        if len(progress) == 0:
            print("Not enough sessions yet!")
            return
        
        print(f"\nFirst session: {progress['date'].iloc[0]}")
        print(f"  Best: {progress['best_single'].iloc[0]:.2f}s")
        if progress['ao5'].iloc[0]:
            print(f"  Ao5: {progress['ao5'].iloc[0]:.2f}s")
        
        print(f"\nLatest session: {progress['date'].iloc[-1]}")
        print(f"  Best: {progress['best_single'].iloc[-1]:.2f}s")
        if progress['ao5'].iloc[-1]:
            print(f"  Ao5: {progress['ao5'].iloc[-1]:.2f}s")
        
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
        
        # Convert from milliseconds to seconds
        for col in ['best_single', 'session_mean', 'ao5']:
            if col in df.columns:
                df[col] = df[col] / 1000
        
        if len(df) < 2:
            print("\nNeed more sessions to plot progress")
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