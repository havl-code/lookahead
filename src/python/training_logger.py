"""
Training Logger - Fixed to use singleton DatabaseManager
"""

from pathlib import Path
import pandas as pd
import sys

# Import the DatabaseManager
sys.path.insert(0, str(Path(__file__).parent))
from db_manager import DatabaseManager


class TrainingLogger:
    """Log personal training sessions and solves"""
    
    def __init__(self, db_path="data/speedcube.db"):
        self.db_manager = DatabaseManager(db_path)
    
    def connect(self):
        """Connect to database"""
        return self.db_manager.connect()
    
    @property
    def conn(self):
        """Get current connection"""
        return self.db_manager.conn
    
    def disconnect(self):
        """Close connection"""
        self.db_manager.disconnect()
    
    def create_session(self, event_id='333', notes='', cube_id=None):
        """Create a new training session"""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            query = """
            INSERT INTO training_sessions (date, event_id, cube_id, notes)
            VALUES (DATE('now'), ?, ?, ?)
            """
            
            cursor.execute(query, (event_id, cube_id, notes))
            conn.commit()
            
            session_id = cursor.lastrowid
            print(f"✓ Created session #{session_id}")
            return session_id
    
    def add_solve(self, session_id, time_seconds, scramble='', penalty=None, notes=''):
        """Add a solve to a session"""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Determine DNF/+2
            dnf = 1 if penalty == 'DNF' else 0
            plus_two = 1 if penalty == '+2' else 0
            
            # Store DNF as 0ms
            if dnf:
                time_ms = 0
            else:
                time_ms = int(time_seconds * 1000)
            
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
            conn.commit()
            
            print(f"  Solve #{solve_number}: {time_seconds:.2f}s" + 
                  (f" ({penalty})" if penalty else ""))
    
    def update_session_stats(self, session_id):
        """Calculate and update session statistics"""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get all solves for this session
            query = """
            SELECT time_ms, dnf FROM personal_solves
            WHERE session_id = ?
            ORDER BY solve_number
            """
            
            cursor.execute(query, (session_id,))
            all_solves = cursor.fetchall()
            
            if not all_solves:
                return
            
            # Separate valid times from DNFs
            times = []
            dnf_count = 0
            
            for time_ms, is_dnf in all_solves:
                if is_dnf:
                    dnf_count += 1
                else:
                    times.append(time_ms)
            
            total_solves = len(all_solves)
            
            # Calculate basic stats
            if times:
                best_single = min(times)
                worst_single = max(times)
                session_mean = sum(times) / len(times)
            else:
                best_single = None
                worst_single = None
                session_mean = None
            
            # Calculate Ao5
            ao5 = None
            if total_solves >= 5:
                last_5 = all_solves[-5:]
                last_5_times = [t for t, dnf in last_5 if not dnf]
                
                if len(last_5_times) >= 3:
                    sorted_times = sorted(last_5_times)
                    if len(sorted_times) == 3:
                        middle = sorted_times
                    elif len(sorted_times) == 4:
                        middle = sorted_times[1:3]
                    else:  # len == 5
                        middle = sorted_times[1:4]
                    
                    ao5 = sum(middle) / len(middle)
            
            # Calculate Ao12
            ao12 = None
            if total_solves >= 12:
                last_12 = all_solves[-12:]
                last_12_times = [t for t, dnf in last_12 if not dnf]
                
                if len(last_12_times) >= 10:
                    sorted_times = sorted(last_12_times)
                    if len(sorted_times) == 10:
                        middle = sorted_times
                    elif len(sorted_times) == 11:
                        middle = sorted_times[1:11]
                    else:  # len == 12
                        middle = sorted_times[1:11]
                    
                    ao12 = sum(middle) / len(middle)
            
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
                total_solves, best_single, worst_single,
                session_mean, ao5, ao12, session_id
            ))
            conn.commit()
    
    def get_all_sessions(self):
        """Get all training sessions"""
        query = """
        SELECT 
            id, date, event_id, solve_count,
            best_single, session_mean, ao5, ao12, notes
        FROM training_sessions
        ORDER BY date DESC
        """
        
        with self.db_manager.get_connection() as conn:
            df = pd.read_sql_query(query, conn)
        
        # Convert to seconds
        for col in ['best_single', 'session_mean', 'ao5', 'ao12']:
            if col in df.columns:
                df[col] = df[col] / 1000
        
        return df
    
    def delete_solve(self, solve_id):
        """Delete a specific solve"""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get session_id before deleting
            cursor.execute("SELECT session_id FROM personal_solves WHERE id = ?", (solve_id,))
            result = cursor.fetchone()
            
            if not result:
                return False
            
            session_id = result[0]
            
            # Delete the solve
            cursor.execute("DELETE FROM personal_solves WHERE id = ?", (solve_id,))
            
            # Renumber remaining solves
            cursor.execute("""
                SELECT id FROM personal_solves 
                WHERE session_id = ? 
                ORDER BY solve_number
            """, (session_id,))
            
            solves = cursor.fetchall()
            for idx, (sid,) in enumerate(solves, 1):
                cursor.execute("UPDATE personal_solves SET solve_number = ? WHERE id = ?", (idx, sid))
            
            conn.commit()
            
            return True
    
    def delete_session(self, session_id):
        """Delete a training session and all its solves"""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM personal_solves WHERE session_id = ?", (session_id,))
            cursor.execute("DELETE FROM training_sessions WHERE id = ?", (session_id,))
            conn.commit()