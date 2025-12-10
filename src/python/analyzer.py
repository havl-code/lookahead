"""
Personal Training Analyzer
Analyze personal training data (no WCA database needed - uses API)
"""

import pandas as pd
import sqlite3
from pathlib import Path


class TrainingAnalyzer:
    """Analyze personal training data"""
    
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
    
    def get_personal_stats(self, event_id='333'):
        """Get personal statistics for an event"""
        query = f"""
        SELECT 
            COUNT(*) as total_solves,
            MIN(time_ms)/1000.0 as pb,
            AVG(time_ms)/1000.0 as average,
            MAX(time_ms)/1000.0 as worst
        FROM personal_solves
        WHERE dnf = 0
        """
        
        df = pd.read_sql_query(query, self.conn)
        return df
    
    def get_session_progression(self):
        """Get progression over sessions"""
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
        
        df = pd.read_sql_query(query, self.conn)
        return df