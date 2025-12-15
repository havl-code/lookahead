"""
Speedcube Training Explorer - Main Entry Point
Interactive menu for all features
"""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, 'src/python')

def clear_screen():
    """Clear terminal screen"""
    subprocess.run('clear' if sys.platform != 'win32' else 'cls', shell=True)


def run_command(command):
    """Run a Python script"""
    result = subprocess.run(command, shell=True)
    input("\nPress Enter to continue...")


def show_banner():
    """Show application banner"""
    print("="*60)
    print("         SPEEDCUBE TRAINING EXPLORER")
    print("="*60)
    print()


def main_menu():
    """Show main menu"""
    while True:
        clear_screen()
        show_banner()
        
        print("Main Menu:")
        print()
        print("  DATA IMPORT")
        print("  1. Import CSTimer file")
        print("  2. Log new training session (interactive)")
        print()
        print("  DATA MANAGEMENT")
        print("  3. Manage sessions (edit/delete)")
        print("  4. View all sessions")
        print("  5. Manage cube inventory")
        print()
        print("  ANALYSIS")
        print("  6. View progress & statistics")
        print("  7. Compare with WCA rankings")
        print("  8. Generate visualizations")
        print()
        print("  TOOLS")
        print("  9. Test WCA API connection")
        print("  10. Initialize/reset database")
        print()
        print("  0. Exit")
        print()
        
        choice = input("Select option: ").strip()
        
        if choice == '1':
            # Import CSTimer
            clear_screen()
            show_banner()
            print("IMPORT CSTIMER FILE")
            print("-" * 60)
            print("\nYour CSTimer export file should be in: data/raw/")
            file_path = input("\nEnter filename (or full path): ").strip()
            
            if not file_path.startswith('/'):
                file_path = f"data/raw/{file_path}"
            
            if Path(file_path).exists():
                print("\nImporting... This may take a minute for large files.")
                run_command(f"python src/python/import_cstimer.py {file_path}")
            else:
                print(f"\n✗ File not found: {file_path}")
                input("\nPress Enter to continue...")
        
        elif choice == '2':
            # Log session
            clear_screen()
            run_command("python src/python/training_logger.py --interactive")
        
        elif choice == '3':
            # Manage sessions
            clear_screen()
            run_command("python src/python/training_logger.py --manage")
        
        elif choice == '4':
            # View all sessions
            clear_screen()
            show_banner()
            print("ALL TRAINING SESSIONS")
            print("-" * 60)
            run_command("python -c \"from src.python.training_logger import TrainingLogger; import sys; sys.path.insert(0, 'src/python'); l = TrainingLogger(); l.connect(); print(l.get_all_sessions()); l.disconnect()\"")
        
        elif choice == '5':
            # Manage cubes
            clear_screen()
            run_command("python src/python/cube_manager.py")
        
        elif choice == '6':
            # View progress
            clear_screen()
            run_command("python src/python/my_progress.py")
        
        elif choice == '7':
            # Compare with WCA
            clear_screen()
            show_banner()
            print("WCA COMPARISON")
            print("-" * 60)
            
            try:
                from src.python.wca_api_client import WCAApiClient
                from src.python.training_logger import TrainingLogger
                import pandas as pd
                
                logger = TrainingLogger()
                logger.connect()
                
                pb_query = "SELECT MIN(time_ms)/1000.0 as pb FROM personal_solves WHERE dnf = 0"
                my_pb = pd.read_sql_query(pb_query, logger.conn)['pb'].values[0]
                
                logger.disconnect()
                
                wca = WCAApiClient()
                result = wca.estimate_percentile(my_pb, '333', 'single')
                
                print(f"\nYour PB: {my_pb:.2f}s")
                print(f"Rank: ~{result['rank_estimate']}")
                print(f"Percentile: {result['faster_than']}")
                print(f"\n{result['note']}")
                
            except Exception as e:
                print(f"\n✗ Error: {e}")
            
            input("\nPress Enter to continue...")
        
        elif choice == '8':
            # Generate visualizations
            clear_screen()
            run_command("python src/python/visualizer.py")
        
        elif choice == '9':
            # Test WCA API
            clear_screen()
            run_command("python src/python/wca_api_client.py")
        
        elif choice == '10':
            # Initialize database
            clear_screen()
            show_banner()
            print("DATABASE INITIALIZATION")
            print("-" * 60)
            confirm = input("\nThis will create/reset the database. Continue? (yes/no): ")
            
            if confirm.lower() == 'yes':
                run_command("python src/python/db_manager.py")
            else:
                print("Cancelled.")
                input("\nPress Enter to continue...")
        
        elif choice == '0':
            clear_screen()
            print("Thanks for using Speedcube Training Explorer!")
            print("Keep cubing!")
            sys.exit(0)
        
        else:
            print("\n✗ Invalid option. Please try again.")
            input("\nPress Enter to continue...")


def main():
    """Entry point - Choose Web or CLI"""
    if len(sys.argv) > 1 and sys.argv[1] == '--help':
        show_banner()
        print("Usage:")
        print("  python main.py              - Choose Web or CLI interface")
        print("  python main.py --help       - Show this help")
        print("  python main.py --web        - Start web server directly")
        print("  python main.py --cli        - Start CLI menu directly")
        print()
        print("Direct commands:")
        print("  python src/python/import_cstimer.py <file>")
        print("  python src/python/training_logger.py --interactive")
        print("  python src/python/my_progress.py")
        print("  python src/python/cube_manager.py")
        print("  python src/python/visualizer.py")
        return
    
    # Check for direct flags
    if len(sys.argv) > 1:
        if sys.argv[1] == '--web':
            clear_screen()
            show_banner()
            print("Starting web server...")
            print()
            subprocess.run(['python', 'website_server.py'])
            return
        elif sys.argv[1] == '--cli':
            try:
                main_menu()
            except KeyboardInterrupt:
                clear_screen()
                print("\n\nExiting... Goodbye!")
                sys.exit(0)
            return
    
    # Ask user preference
    try:
        clear_screen()
        show_banner()
        print("How would you like to use Speedcube Training Explorer?")
        print()
        print("  1. Web Interface (Browser) - Recommended")
        print("     • Clean visual interface")
        print("     • Interactive charts with zoom/pan")
        print("     • Manage sessions and solves")
        print("     • Preview and select CSTimer sessions")
        print()
        print("  2. CLI Interface (Terminal)")
        print("     • Command-line menu")
        print("     • Fast for experienced users")
        print("     • All features available")
        print()
        print("  0. Exit")
        print()
        
        choice = input("Select option (1, 2, or 0): ").strip()
        
        if choice == '1':
            # Start web server
            clear_screen()
            show_banner()
            print("Starting web server...")
            print("Once started, open your browser to: http://localhost:5000")
            print()
            print("Press Ctrl+C to stop the server")
            print()
            subprocess.run(['python', 'website_server.py'])
        elif choice == '2':
            # Start CLI menu
            main_menu()
        elif choice == '0':
            clear_screen()
            print("Goodbye!")
            sys.exit(0)
        else:
            print("\nInvalid choice. Please run again and select 1, 2, or 0.")
    except KeyboardInterrupt:
        clear_screen()
        print("\n\nExiting... Goodbye!")
        sys.exit(0)


if __name__ == "__main__":
    main()