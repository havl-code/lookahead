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
    
    def list_all_sessions(self):
        """List all sessions with summary"""
        query = """
        SELECT 
            id, date, event_id, solve_count,
            best_single/1000.0 as best, 
            session_mean/1000.0 as mean,
            ao5/1000.0 as ao5,
            notes
        FROM training_sessions
        ORDER BY date DESC, id DESC
        """
        
        df = pd.read_sql_query(query, self.conn)
        return df
    
    def view_session_details(self, session_id):
        """View all solves in a session"""
        query = """
        SELECT 
            id,
            solve_number,
            time_ms/1000.0 as time_seconds,
            scramble,
            penalty,
            dnf,
            plus_two,
            notes
        FROM personal_solves
        WHERE session_id = ?
        ORDER BY solve_number
        """
        
        df = pd.read_sql_query(query, self.conn, params=(session_id,))
        return df
    
    def edit_solve(self, solve_id, new_time_seconds=None, new_scramble=None, 
                   new_penalty=None, new_notes=None):
        """Edit an existing solve"""
        cursor = self.conn.cursor()
        
        # Get current solve
        cursor.execute("SELECT * FROM personal_solves WHERE id = ?", (solve_id,))
        solve = cursor.fetchone()
        
        if not solve:
            print(f"❌ Solve ID {solve_id} not found")
            return False
        
        session_id = solve[1]  # session_id is 2nd column
        
        # Build update query
        updates = []
        params = []
        
        if new_time_seconds is not None:
            updates.append("time_ms = ?")
            params.append(int(new_time_seconds * 1000))
        
        if new_scramble is not None:
            updates.append("scramble = ?")
            params.append(new_scramble)
        
        if new_penalty is not None:
            updates.append("penalty = ?")
            params.append(new_penalty)
            updates.append("dnf = ?")
            params.append(1 if new_penalty == 'DNF' else 0)
            updates.append("plus_two = ?")
            params.append(1 if new_penalty == '+2' else 0)
        
        if new_notes is not None:
            updates.append("notes = ?")
            params.append(new_notes)
        
        if not updates:
            print("No changes specified")
            return False
        
        # Execute update
        query = f"UPDATE personal_solves SET {', '.join(updates)} WHERE id = ?"
        params.append(solve_id)
        
        cursor.execute(query, params)
        self.conn.commit()
        
        print(f"✓ Updated solve #{solve_id}")
        
        # Recalculate session stats
        self.update_session_stats(session_id)
        
        return True
    
    def delete_solve(self, solve_id):
        """Delete a specific solve"""
        cursor = self.conn.cursor()
        
        # Get session_id before deleting
        cursor.execute("SELECT session_id FROM personal_solves WHERE id = ?", (solve_id,))
        result = cursor.fetchone()
        
        if not result:
            print(f"❌ Solve ID {solve_id} not found")
            return False
        
        session_id = result[0]
        
        # Delete the solve
        cursor.execute("DELETE FROM personal_solves WHERE id = ?", (solve_id,))
        self.conn.commit()
        
        print(f"✓ Deleted solve #{solve_id}")
        
        # Renumber remaining solves
        cursor.execute("""
            SELECT id FROM personal_solves 
            WHERE session_id = ? 
            ORDER BY solve_number
        """, (session_id,))
        
        solves = cursor.fetchall()
        for idx, (sid,) in enumerate(solves, 1):
            cursor.execute("UPDATE personal_solves SET solve_number = ? WHERE id = ?", (idx, sid))
        
        self.conn.commit()
        
        # Recalculate session stats
        self.update_session_stats(session_id)
        
        return True
    
    def edit_session_notes(self, session_id, new_notes):
        """Edit session notes"""
        cursor = self.conn.cursor()
        cursor.execute("UPDATE training_sessions SET notes = ? WHERE id = ?", (new_notes, session_id))
        self.conn.commit()
        print(f"✓ Updated notes for session #{session_id}")

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

def manage_sessions():
    """Interactive session management"""
    logger = TrainingLogger()
    logger.connect()
    
    while True:
        print("\n" + "="*60)
        print("SESSION MANAGEMENT")
        print("="*60)
        print("1. List all sessions")
        print("2. View session details")
        print("3. Edit a solve")
        print("4. Delete a solve")
        print("5. Delete entire session")
        print("6. Edit session notes")
        print("7. Exit")
        
        choice = input("\nChoice: ").strip()
        
        if choice == '1':
            # List sessions
            sessions = logger.list_all_sessions()
            print("\n" + sessions.to_string(index=False))
        
        elif choice == '2':
            # View session details
            session_id = int(input("Session ID: "))
            solves = logger.view_session_details(session_id)
            if len(solves) > 0:
                print("\n" + solves.to_string(index=False))
            else:
                print("❌ Session not found or has no solves")
        
        elif choice == '3':
            # Edit solve
            solve_id = int(input("Solve ID to edit: "))
            
            # Show current solve
            cursor = logger.conn.cursor()
            cursor.execute("""
                SELECT solve_number, time_ms/1000.0, scramble, penalty 
                FROM personal_solves WHERE id = ?
            """, (solve_id,))
            current = cursor.fetchone()
            
            if current:
                print(f"\nCurrent: Solve #{current[0]}: {current[1]:.2f}s, Penalty: {current[3]}")
                
                new_time = input("New time (seconds, or press Enter to skip): ").strip()
                new_penalty = input("New penalty (DNF/+2/none, or press Enter to skip): ").strip()
                new_notes = input("New notes (or press Enter to skip): ").strip()
                
                logger.edit_solve(
                    solve_id,
                    new_time_seconds=float(new_time) if new_time else None,
                    new_penalty=new_penalty.upper() if new_penalty and new_penalty.lower() != 'none' else None,
                    new_notes=new_notes if new_notes else None
                )
            else:
                print("❌ Solve not found")
        
        elif choice == '4':
            # Delete solve
            solve_id = int(input("Solve ID to delete: "))
            confirm = input(f"Really delete solve #{solve_id}? (yes/no): ")
            if confirm.lower() == 'yes':
                logger.delete_solve(solve_id)
        
        elif choice == '5':
            # Delete session
            session_id = int(input("Session ID to delete: "))
            confirm = input(f"Really delete entire session #{session_id}? (yes/no): ")
            if confirm.lower() == 'yes':
                logger.delete_session(session_id)
        
        elif choice == '6':
            # Edit session notes
            session_id = int(input("Session ID: "))
            new_notes = input("New notes: ")
            logger.edit_session_notes(session_id, new_notes)
        
        elif choice == '7':
            break
        
        else:
            print("Invalid choice")
    
    logger.disconnect()
    print("\n✓ Exited session management")

def main():
    """Main function"""
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == '--interactive':
            interactive_session()
        elif sys.argv[1] == '--manage':
            manage_sessions()
        else:
            print("Unknown option. Use --interactive or --manage")
    else:
        print("\n💡 Options:")
        print("  --interactive : Add new training session")
        print("  --manage      : Manage/edit existing sessions")
        print("\nRunning example...\n")
        quick_session_example()

if __name__ == "__main__":
    main()