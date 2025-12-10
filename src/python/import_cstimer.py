"""
CSTimer Data Importer
Import solve times from CSTimer export files
"""

import json
import csv
from datetime import datetime
from pathlib import Path
import pandas as pd
from training_logger import TrainingLogger


class CSTimerImporter:
    """Import data from CSTimer exports"""
    
    def __init__(self, logger):
        self.logger = logger
    
    def import_from_json(self, json_file, event_id='333', session_name=''):
        """
        Import from CSTimer JSON export
        
        CSTimer JSON format (in .txt file):
        {"session1": [[[penalty, time_cs], "scramble", "", timestamp], ...]}
        """
        print(f"Reading CSTimer file: {json_file}")
        
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # CSTimer exports have session keys like "session1", "session2", etc.
        sessions_imported = 0
        total_solves = 0
        
        for session_key, session_data in data.items():
            if not isinstance(session_data, list):
                continue
            
            print(f"\n--- Importing {session_key} ---")
            print(f"Found {len(session_data)} solves")
            
            # Create session name
            if not session_name:
                current_session_name = f"CSTimer {session_key} - {datetime.now().strftime('%Y-%m-%d')}"
            else:
                current_session_name = f"{session_name} ({session_key})"
            
            session_id = self.logger.create_session(event_id, current_session_name)
            
            # Import each solve
            imported = 0
            for solve_data in session_data:
                try:
                    # Format: [[penalty_code, time_cs], "scramble", "", timestamp]
                    solve_info = solve_data[0]  # [penalty, time]
                    scramble = solve_data[1] if len(solve_data) > 1 else ''
                    
                    penalty_code = solve_info[0]
                    time_cs = solve_info[1]
                    
                    # Convert penalty code
                    # 0 = OK, 2000 = +2, -1 = DNF
                    if penalty_code == -1:
                        penalty = 'DNF'
                        time_seconds = 999.99
                    elif penalty_code == 2000:
                        penalty = '+2'
                        time_seconds = time_cs / 1000
                    else:
                        penalty = None
                        time_seconds = time_cs / 1000
                    
                    self.logger.add_solve(session_id, time_seconds, scramble, penalty)
                    imported += 1
                    
                except Exception as e:
                    print(f"⚠️  Skipped solve: {e}")
                    continue
            
            print(f"✓ Imported {imported} solves from {session_key}")
            
            # Calculate stats for this session
            self.logger.update_session_stats(session_id)
            
            sessions_imported += 1
            total_solves += imported
        
        print(f"\n{'='*60}")
        print(f"IMPORT COMPLETE")
        print(f"{'='*60}")
        print(f"  Sessions imported: {sessions_imported}")
        print(f"  Total solves: {total_solves}")
        
        return sessions_imported
    
    def import_from_csv(self, csv_file, event_id='333', session_name=''):
        """
        Import from CSV export
        
        Expected format:
        No., Time(s), Scramble, Date
        1, 18.50, D2 R' F2..., 2024-12-08
        """
        print(f"Reading CSV: {csv_file}")
        
        df = pd.read_csv(csv_file)
        print(f"Found {len(df)} solves")
        
        # Detect column names
        time_col = None
        scramble_col = None
        
        for col in df.columns:
            col_lower = col.lower()
            if 'time' in col_lower:
                time_col = col
            if 'scramble' in col_lower:
                scramble_col = col
        
        if not time_col:
            print("❌ Could not find time column")
            return None
        
        # Create session
        if not session_name:
            session_name = f"CSTimer CSV Import - {datetime.now().strftime('%Y-%m-%d')}"
        
        session_id = self.logger.create_session(event_id, session_name)
        
        # Import solves
        imported = 0
        for _, row in df.iterrows():
            try:
                time_str = str(row[time_col]).strip()
                
                # Handle penalties
                if 'DNF' in time_str.upper():
                    penalty = 'DNF'
                    time_seconds = 999.99
                elif '+2' in time_str:
                    penalty = '+2'
                    time_seconds = float(time_str.replace('+2', '').strip())
                else:
                    penalty = None
                    time_seconds = float(time_str)
                
                scramble = row[scramble_col] if scramble_col else ''
                
                self.logger.add_solve(session_id, time_seconds, scramble, penalty)
                imported += 1
                
            except Exception as e:
                print(f"⚠️  Skipped row: {e}")
                continue
        
        print(f"\n✓ Imported {imported} solves")
        self.logger.update_session_stats(session_id)
        
        return session_id
    
    def import_from_txt(self, txt_file, event_id='333', session_name=''):
        """
        Import from CSTimer TXT export (which is usually JSON inside)
        First try JSON, then fall back to plain text parsing
        """
        # Try JSON first (CSTimer .txt files are usually JSON)
        try:
            return self.import_from_json(txt_file, event_id, session_name)
        except json.JSONDecodeError:
            pass
        
        # Fall back to text parsing
        print(f"Reading as plain text: {txt_file}")
        
        with open(txt_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        if not session_name:
            session_name = f"CSTimer Import - {datetime.now().strftime('%Y-%m-%d')}"
        
        session_id = self.logger.create_session(event_id, session_name)
        
        imported = 0
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            try:
                # Parse formats like: "1. 18.50   D2 R' F2..."
                parts = line.split(maxsplit=2)
                time_str = parts[1] if len(parts) > 1 else parts[0]
                scramble = parts[2] if len(parts) > 2 else ''
                
                # Handle penalties
                if 'DNF' in time_str.upper():
                    penalty = 'DNF'
                    time_seconds = 999.99
                elif '+2' in time_str:
                    penalty = '+2'
                    time_seconds = float(time_str.replace('+2', ''))
                else:
                    penalty = None
                    time_seconds = float(time_str)
                
                self.logger.add_solve(session_id, time_seconds, scramble, penalty)
                imported += 1
                
            except:
                continue
        
        print(f"\n✓ Imported {imported} solves")
        if imported > 0:
            self.logger.update_session_stats(session_id)
        
        return session_id


def main():
    """Interactive CSTimer import"""
    import sys
    
    print("="*60)
    print("CSTIMER DATA IMPORTER")
    print("="*60)
    
    # Setup
    logger = TrainingLogger()
    logger.connect()
    importer = CSTimerImporter(logger)
    
    # Check for file argument
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        print("\nUsage: python src/python/import_cstimer.py <file.txt|file.json|file.csv>")
        print("\nOr enter file path now:")
        file_path = input("File path: ").strip()
    
    file_path = Path(file_path)
    
    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        return
    
    # Get event
    event_id = input("\nEvent ID (default: 333): ").strip() or '333'
    
    # Import based on file type
    if file_path.suffix in ['.json', '.txt']:
        sessions = importer.import_from_json(file_path, event_id)
    elif file_path.suffix == '.csv':
        session_id = importer.import_from_csv(file_path, event_id)
    else:
        print("❌ Unknown file type. Use .txt, .json or .csv")
        return
    
    # Show summary
    print("\n" + "="*60)
    print("ALL SESSIONS")
    print("="*60)
    all_sessions = logger.get_all_sessions()
    print(all_sessions.to_string(index=False))
    
    # Show personal bests
    print("\n" + "="*60)
    print("PERSONAL BESTS")
    print("="*60)
    pbs = logger.get_personal_bests()
    print(pbs.to_string(index=False))
    
    logger.disconnect()


if __name__ == "__main__":
    main()
