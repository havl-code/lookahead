"""
Speedcube Training Explorer - Main Entry Point
"""

import sys


def show_menu():
    """Show main menu"""
    print("="*60)
    print("SPEEDCUBE TRAINING EXPLORER")
    print("="*60)
    print("\nAvailable Commands:")
    print("  1. Log new training session    → training_logger.py --interactive")
    print("  2. Manage sessions             → training_logger.py --manage")
    print("  3. Import CSTimer data         → import_cstimer.py <file.txt>")
    print("  4. View progress & stats       → my_progress.py")
    print("  5. Test WCA API                → wca_api_client.py")
    print("\nFor help: python main.py --help")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--help':
        show_menu()
    else:
        show_menu()


if __name__ == "__main__":
    main()