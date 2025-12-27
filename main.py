#!/usr/bin/env python3
"""
Speedcube Training Explorer - Main Entry Point
Simplified launcher that starts the web interface
"""

import sys
import webbrowser
import time
import subprocess
import socket
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src' / 'python'))


def print_banner():
    """Print welcome banner"""
    print("\n" + "="*60)
    print("        SPEEDCUBE TRAINING EXPLORER")
    print("="*60)
    print()


def check_port_available(port=5000):
    """Check if port is available"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('localhost', port))
    sock.close()
    return result != 0


def check_database():
    """Quick database check and initialization if needed"""
    try:
        from db_manager import DatabaseManager
        
        db = DatabaseManager()
        with db.get_connection() as conn:
            cursor = conn.cursor()
            
            # Check if tables exist
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            if not tables or 'cubes' not in tables:
                print("⚠️  Database needs initialization...")
                db.create_schema()
                print("✅ Database initialized!")
            else:
                print(f"✅ Database ready ({len(tables)} tables)")
        
        return True
    except Exception as e:
        print(f"❌ Database error: {e}")
        print("\nTry running:")
        print("  python -m src.python.db_manager")
        return False


def launch_web_app():
    """Launch the web application"""
    print_banner()
    print("🚀 Starting Speedcube Training Explorer...")
    print()
    
    # Check database
    if not check_database():
        print("\n❌ Cannot start without a valid database")
        input("\nPress Enter to exit...")
        return
    
    print()
    
    # Check if port is already in use
    if not check_port_available(5000):
        print("⚠️  Port 5000 is already in use!")
        print("The app might already be running.")
        response = input("\nOpen browser anyway? (y/n): ").lower()
        if response == 'y':
            webbrowser.open('http://localhost:5000')
        return
    
    # Start the server
    print("⏳ Starting web server...")
    
    try:
        # Start server in background
        process = subprocess.Popen(
            [sys.executable, 'website_server.py'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        print("⏳ Waiting for server to start...")
        time.sleep(2)
        
        # Check if server started successfully
        if process.poll() is None:
            print("✅ Server started!")
            print("🌐 Opening browser at http://localhost:5000")
            print()
            print("Press Ctrl+C to stop the server")
            print()
            
            # Open browser
            webbrowser.open('http://localhost:5000')
            
            # Wait for user to stop
            try:
                process.wait()
            except KeyboardInterrupt:
                print("\n\n👋 Shutting down server...")
                process.terminate()
                process.wait()
        else:
            print("❌ Server failed to start")
            stdout, stderr = process.communicate()
            if stderr:
                print(f"Error: {stderr.decode()}")
            
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        print("\nTry running manually:")
        print("  python website_server.py")


def init_database():
    """Initialize or reset database"""
    print_banner()
    print("DATABASE INITIALIZATION")
    print("-" * 60)
    print()
    print("⚠️  This will create/reset the database.")
    print("All existing data will be lost!")
    print()
    
    confirm = input("Continue? (type 'yes' to confirm): ").strip()
    
    if confirm.lower() == 'yes':
        try:
            from db_manager import DatabaseManager
            
            print("\n🔄 Initializing database...")
            db = DatabaseManager()
            db.create_schema()
            db.get_table_info()
            print("\n✅ Database initialized successfully!")
        except Exception as e:
            print(f"\n❌ Error: {e}")
    else:
        print("\n❌ Cancelled")


def show_help():
    """Show help information"""
    print_banner()
    print("USAGE")
    print("-" * 60)
    print()
    print("Start the web interface:")
    print("  python main.py")
    print("  python main.py --web")
    print()
    print("Initialize/reset database:")
    print("  python main.py --init-db")
    print()
    print("Show this help:")
    print("  python main.py --help")
    print()
    print("-" * 60)
    print()
    print("Once the web interface is open:")
    print("  • Use the Timer for live solving")
    print("  • Import CSTimer data from the Import tab")
    print("  • View sessions and statistics")
    print("  • Manage your cube inventory")
    print("  • Analyze progress with interactive charts")
    print()


def main():
    """Main entry point"""
    
    # Handle command line arguments
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        
        if arg in ['--help', '-h', 'help']:
            show_help()
        elif arg in ['--init-db', '--init', 'init']:
            init_database()
        elif arg in ['--web', 'web']:
            launch_web_app()
        else:
            print(f"Unknown argument: {sys.argv[1]}")
            print("Use --help for usage information")
        
        return
    
    # No arguments - launch web interface
    launch_web_app()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Interrupted. Goodbye!")
        sys.exit(0)