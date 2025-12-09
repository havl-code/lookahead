"""
Training Logger
Log personal speedcubing training sessions
"""

import sqlite3
from datetime import datetime
from pathlib import Path
import pandas as pd


class TrainingLogger:
    """Log and manage personal training sessions"""
    
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
    
    def create_session(self, event_id='333', notes=''):
        """Create a new training session"""
        cursor = self.conn.cursor()
        
        query = """
        INSERT INTO training_sessions (date, event_id, notes)
        VALUES (DATE('now'), ?, ?)
        """
        
        cursor.execute(query, (event_id, notes))
        self.conn.commit()
        
        session_id = cursor.lastrowid
        print(f"✓ Created session #{session_id}")
        return session_id
    
    def add_solve(self, session_id, time_seconds, scramble='', penalty=None, notes=''):
        """Add a solve to a session"""
        cursor = self.conn.cursor()
        
        # Convert to milliseconds
        time_ms = int(time_seconds * 1000)
        
        # Determine DNF/+2
        dnf = 1 if penalty == 'DNF' else 0
        plus_two = 1 if penalty == '+2' else 0
        
        # Get current solve number
        cursor.execute(
            "SELECT COUNT(*) FROM personal_solves WHERE session_id = ?",
            (session_id,)
        )
        solve_number = cursor.fetchone()[0] + 1
        
        query = """
        INSERT INTO personal_solves 
        (session_id, solve_number, time_ms, scramble, penalty, dnf, plus_two, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        cursor.execute(query, (
            session_id, solve_number, time_ms, scramble,
            penalty, dnf, plus_two, notes
        ))
        self.conn.commit()
        
        print(f"  Solve #{solve_number}: {time_seconds:.2f}s" + 
              (f" ({penalty})" if penalty else ""))
    
    def add_multiple_solves(self, session_id, times):
        """Add multiple solves at once"""
        print(f"\nAdding {len(times)} solves to session #{session_id}...")
        
        for time in times:
            self.add_solve(session_id, time)
        
        # Calculate session stats
        self.update_session_stats(session_id)
    
    def update_session_stats(self, session_id):
        """Calculate and update session statistics"""
        cursor = self.conn.cursor()
        
        # Get all solves for this session (excluding DNF)
        query = """
        SELECT time_ms FROM personal_solves
        WHERE session_id = ? AND dnf = 0
        ORDER BY time_ms
        """
        
        cursor.execute(query, (session_id,))
        times = [row[0] for row in cursor.fetchall()]
        
        if not times:
            print("No valid solves to calculate stats")
            return
        
        # Calculate stats
        best_single = min(times)
        worst_single = max(times)
        session_mean = sum(times) / len(times)
        
        # Calculate Ao5 (average of 5, remove best and worst)
        ao5 = None
        if len(times) >= 5:
            ao5_times = times[-5:]  # Last 5 solves
            ao5 = sum(sorted(ao5_times)[1:-1]) / 3  # Remove best and worst
        
        # Calculate Ao12
        ao12 = None
        if len(times) >= 12:
            ao12_times = times[-12:]
            ao12 = sum(sorted(ao12_times)[1:-1]) / 10
        
        # Update session
        query = """
        UPDATE training_sessions
        SET solve_count = ?,
            best_single = ?,
            worst_single = ?,
            session_mean = ?,
            ao5 = ?,
            ao12 = ?
        WHERE id = ?
        """
        
        cursor.execute(query, (
            len(times), best_single, worst_single,
            session_mean, ao5, ao12, session_id
        ))
        self.conn.commit()
        
        print(f"\n✓ Session stats updated:")
        print(f"  Total solves: {len(times)}")
        print(f"  Best: {best_single/1000:.2f}s")
        print(f"  Worst: {worst_single/1000:.2f}s")
        print(f"  Mean: {session_mean/1000:.2f}s")
        if ao5:
            print(f"  Ao5: {ao5/1000:.2f}s")
        if ao12:
            print(f"  Ao12: {ao12/1000:.2f}s")
    
    def get_session_solves(self, session_id):
        """Get all solves from a session"""
        query = """
        SELECT solve_number, time_ms, penalty, scramble, notes, timestamp
        FROM personal_solves
        WHERE session_id = ?
        ORDER BY solve_number
        """
        
        df = pd.read_sql_query(query, self.conn, params=(session_id,))
        df['time_seconds'] = df['time_ms'] / 1000
        
        return df
    
    def get_all_sessions(self):
        """Get all training sessions"""
        query = """
        SELECT 
            id, date, event_id, solve_count,
            best_single, session_mean, ao5, ao12, notes
        FROM training_sessions
        ORDER BY date DESC
        """
        
        df = pd.read_sql_query(query, self.conn)
        
        # Convert to seconds
        for col in ['best_single', 'session_mean', 'ao5', 'ao12']:
            if col in df.columns:
                df[col] = df[col] / 1000
        
        return df
    
    def get_personal_bests(self):
        """Get personal best times for each event"""
        query = """
        SELECT 
            ts.event_id,
            MIN(ps.time_ms) as pb_single,
            COUNT(DISTINCT ts.id) as total_sessions,
            COUNT(ps.id) as total_solves
        FROM training_sessions ts
        JOIN personal_solves ps ON ts.id = ps.session_id
        WHERE ps.dnf = 0
        GROUP BY ts.event_id
        """
        
        df = pd.read_sql_query(query, self.conn)
        df['pb_single'] = df['pb_single'] / 1000
        
        return df
    
    def delete_session(self, session_id):
        """Delete a training session and all its solves"""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM personal_solves WHERE session_id = ?", (session_id,))
        cursor.execute("DELETE FROM training_sessions WHERE id = ?", (session_id,))
        self.conn.commit()
        print(f"✓ Deleted session #{session_id}")


def interactive_session():
    """Interactive session logging"""
    logger = TrainingLogger()
    logger.connect()
    
    print("="*60)
    print("TRAINING SESSION LOGGER")
    print("="*60)
    
    # Get event
    event_id = input("\nEvent (default: 333): ").strip() or '333'
    notes = input("Session notes (optional): ").strip()
    
    # Create session
    session_id = logger.create_session(event_id, notes)
    
    print("\nEnter solve times (in seconds)")
    print("Type 'dnf' for DNF, '+2' for +2 penalty")
    print("Type 'done' when finished\n")
    
    solve_num = 1
    
    while True:
        time_input = input(f"Solve #{solve_num}: ").strip().lower()
        
        if time_input == 'done':
            break
        
        try:
            if time_input == 'dnf':
                penalty = 'DNF'
                time_val = 999.99  # Placeholder
            elif time_input.endswith('+2'):
                penalty = '+2'
                time_val = float(time_input.replace('+2', ''))
            else:
                penalty = None
                time_val = float(time_input)
            
            logger.add_solve(session_id, time_val, penalty=penalty)
            solve_num += 1
            
        except ValueError:
            print("Invalid input. Enter a number or 'dnf'")
    
    # Calculate stats
    logger.update_session_stats(session_id)
    
    logger.disconnect()
    print("\n✓ Session saved!")


def quick_session_example():
    """Quick example: Log a sample session"""
    logger = TrainingLogger()
    logger.connect()
    
    print("="*60)
    print("QUICK EXAMPLE: Logging Sample Session")
    print("="*60)
    
    # Create session
    session_id = logger.create_session('333', 'Morning practice')
    
    # Add some example times (in seconds)
    times = [18.5, 21.3, 19.8, 20.1, 22.4, 19.5, 21.0, 18.9, 20.7, 21.5,
             19.3, 20.8, 21.9, 19.7, 20.3]
    
    logger.add_multiple_solves(session_id, times)
    
    # Show results
    print("\n" + "="*60)
    print("SESSION DETAILS")
    print("="*60)
    solves = logger.get_session_solves(session_id)
    print(solves[['solve_number', 'time_seconds', 'penalty']].to_string(index=False))
    
    logger.disconnect()
    return session_id


def main():
    """Main function"""
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == '--interactive':
        interactive_session()
    else:
        print("\n💡 TIP: Run with --interactive for manual entry")
        print("   Example: python src/python/training_logger.py --interactive\n")
        quick_session_example()


if __name__ == "__main__":
    main()