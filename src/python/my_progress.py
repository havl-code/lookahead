"""
Personal Progress Analyzer
Analyze YOUR training data and compare to WCA via REST API
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
        """Compare your times to WCA using REST API"""
        print("\n" + "="*60)
        print("COMPARISON TO WCA (REST API)")
        print("="*60)
        
        # Get PB for each event
        pbs_query = """
        SELECT 
            ts.event_id,
            MIN(ps.time_ms)/1000.0 as pb
        FROM personal_solves ps
        JOIN training_sessions ts ON ps.session_id = ts.id
        WHERE ps.dnf = 0
        GROUP BY ts.event_id
        """
        pbs_by_event = pd.read_sql_query(pbs_query, self.logger.conn)
        
        supported_events = ['222', '333', '444', '555', '666', '777', 'pyram', 'skewb', 'minx', 'sq1', 'clock']
        
        for _, row in pbs_by_event.iterrows():
            event_id = row['event_id']
            my_pb = row['pb']
            
            if event_id not in supported_events:
                print(f"\n{event_id}: WCA comparison not available for this event")
                continue
            
            # Get world record for context
            print(f"\nWorld Records ({event_id}):")
            wr_single = self.wca_api.get_world_record(event_id, 'single')
            
            if wr_single:
                print(f"  Single: {wr_single['time_seconds']:.2f}s by {wr_single['holder']}")
            
            # Compare your PB
            print(f"\n{'='*60}")
            print(f"YOUR PERSONAL BEST ({event_id}): {my_pb:.2f}s")
            print(f"{'='*60}")
            
            pb_comparison = self.wca_api.estimate_percentile(my_pb, event_id, 'single')
            
            # Interpret percentile
            if pb_comparison['rank_estimate'] != 'N/A':
                rank = pb_comparison['rank_estimate']
                total_str = pb_comparison['total_ranked']
                pct = pb_comparison['percentile']

                if isinstance(total_str, str):
                    total = int(total_str.replace('~', '').replace(',', ''))
                else:
                    total = total_str
                
                if rank > 1000:
                    print(f"  Rank: Outside top 1000")
                    print(f"  Level: COMPETITIVE")
                else:
                    faster_than_pct = 100 - pct
                    print(f"  Rank: ~{rank:,} out of ~{total:,} ranked competitors")
                    print(f"  Faster than: ~{faster_than_pct:.1f}% of ranked competitors")
                    
                    if pct < 0.1:
                        print(f"  Level: ELITE (World-class)")
                    elif pct < 1:
                        print(f"  Level: ELITE (National/Continental)")
                    elif pct < 10:
                        print(f"  Level: ADVANCED")
                    elif pct < 50:
                        print(f"  Level: COMPETITIVE")
                    else:
                        print(f"  Level: INTERMEDIATE")
            else:
                print(f"  {pb_comparison.get('description', '')}")
                print(f"  {pb_comparison['note']}")
        
        # Get average for 333 if available
        avg_query = """
        SELECT AVG(ps.time_ms)/1000.0 as avg 
        FROM personal_solves ps
        JOIN training_sessions ts ON ps.session_id = ts.id
        WHERE ps.dnf = 0 AND ts.event_id = '333'
        """
        avg_result = pd.read_sql_query(avg_query, self.logger.conn)
        
        if len(avg_result) > 0 and not pd.isna(avg_result['avg'].values[0]):
            my_avg = avg_result['avg'].values[0]
            
            print(f"\n{'='*60}")
            print(f"YOUR OVERALL AVERAGE (333): {my_avg:.2f}s")
            print(f"{'='*60}")
            
            avg_comparison = self.wca_api.estimate_percentile(my_avg, '333', 'average')
            
            if avg_comparison['rank_estimate'] != 'N/A':
                rank = avg_comparison['rank_estimate']
                total = avg_comparison['total_ranked']
                pct = avg_comparison['percentile']
                
                if rank > 200000:
                    print(f"  Rank: Outside top rankings")
                else:
                    faster_than_pct = 100 - pct
                    print(f"  Rank: ~{rank:,} out of ~{total}")
                    print(f"  Faster than: ~{faster_than_pct:.1f}% of ranked competitors")
    
    def improvement_over_time(self):
        """Show improvement trend"""
        print("\n" + "="*60)
        print("IMPROVEMENT OVER TIME")
        print("="*60)
        
        query = """
        SELECT 
            date,
            event_id,
            best_single,
            session_mean,
            ao5,
            ao12
        FROM training_sessions
        WHERE solve_count >= 5
        ORDER BY event_id, date
        """
        
        progress = pd.read_sql_query(query, self.logger.conn)
        
        # Convert from milliseconds to seconds
        for col in ['best_single', 'session_mean', 'ao5', 'ao12']:
            if col in progress.columns:
                progress[col] = progress[col] / 1000
        
        if len(progress) == 0:
            print("Not enough sessions yet!")
            return
        
        # Group by event
        for event_id in progress['event_id'].unique():
            event_progress = progress[progress['event_id'] == event_id]
            
            if len(event_progress) < 2:
                continue
            
            print(f"\n{event_id}:")
            print(f"First session: {event_progress['date'].iloc[0]}")
            print(f"  Best: {event_progress['best_single'].iloc[0]:.2f}s")
            if not pd.isna(event_progress['ao5'].iloc[0]):
                print(f"  Ao5: {event_progress['ao5'].iloc[0]:.2f}s")
            
            print(f"\nLatest session: {event_progress['date'].iloc[-1]}")
            print(f"  Best: {event_progress['best_single'].iloc[-1]:.2f}s")
            if not pd.isna(event_progress['ao5'].iloc[-1]):
                print(f"  Ao5: {event_progress['ao5'].iloc[-1]:.2f}s")
            
            # Calculate improvement
            if not pd.isna(event_progress['ao5'].iloc[0]) and not pd.isna(event_progress['ao5'].iloc[-1]):
                improvement = event_progress['ao5'].iloc[0] - event_progress['ao5'].iloc[-1]
                print(f"\nAo5 Improvement: {improvement:.2f}s")
    
    def plot_progress(self):
        """Plot progress over time"""
        query = """
        SELECT 
            date,
            event_id,
            best_single,
            session_mean,
            ao5
        FROM training_sessions
        WHERE solve_count >= 5
        ORDER BY event_id, date
        """
        
        df = pd.read_sql_query(query, self.logger.conn)
        
        # Convert from milliseconds to seconds
        for col in ['best_single', 'session_mean', 'ao5']:
            if col in df.columns:
                df[col] = df[col] / 1000
        
        if len(df) < 2:
            print("\nNeed more sessions to plot progress")
            return
        
        # Plot by event
        for event_id in df['event_id'].unique():
            event_df = df[df['event_id'] == event_id]
            
            if len(event_df) < 2:
                continue
            
            fig, ax = plt.subplots(figsize=(12, 6))
            
            ax.plot(event_df.index, event_df['best_single'], label='Best Single', marker='o')
            ax.plot(event_df.index, event_df['session_mean'], label='Session Mean', marker='s')
            if event_df['ao5'].notna().any():
                ax.plot(event_df.index, event_df['ao5'], label='Ao5', marker='^')
            
            ax.set_xlabel('Session Number')
            ax.set_ylabel('Time (seconds)')
            ax.set_title(f'Your Progress Over Time - {event_id}')
            ax.legend()
            ax.grid(True, alpha=0.3)
            
            plt.tight_layout()
            plt.savefig(f'data/processed/my_progress_{event_id}.png', dpi=300)
            print(f"\n✓ Saved progress chart: data/processed/my_progress_{event_id}.png")
        
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