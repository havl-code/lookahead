#!/bin/bash
# Speedcube Training Explorer - macOS/Linux Installer

set -e

echo "========================================"
echo "  Speedcube Training Explorer Setup"
echo "========================================"
echo

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "Detected OS: $MACHINE"
echo

# Check Python
echo "Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 not found!"
    echo "Please install Python 3.8+ from https://python.org"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo "✓ Python $PYTHON_VERSION found"
echo

# Check pip
if ! command -v pip3 &> /dev/null; then
    echo "❌ Error: pip not found!"
    if [[ "$MACHINE" == "Linux" ]]; then
        echo "Install with: sudo apt install python3-pip"
    else
        echo "Install with: python3 -m ensurepip"
    fi
    exit 1
fi
echo "✓ pip found"
echo

# Create virtual environment
echo "Creating virtual environment..."
if [ ! -d ".venv" ]; then
    python3 -m venv venv
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
source venv/bin/activate
echo "✓ Virtual environment activated"
echo

# Install dependencies
echo "Installing dependencies..."
echo "This may take a minute..."
pip install -q -r requirements.txt
echo "✓ Dependencies installed"
echo

# Create data directories
echo "Setting up data directory..."
mkdir -p data/cache data/processed data/raw
echo "✓ Data directories created"
echo

# Initialize database
echo "Initializing database..."
python -m src.python.db_manager
echo

# Make start script executable
chmod +x start.sh

echo "========================================"
echo "       Installation Complete!"
echo "========================================"
echo
echo "To start the app:"
echo "  1. Run: ./start.sh"
echo "  2. Or run: python main.py"
echo
echo "The app will open in your browser at:"
echo "  http://localhost:5000"
echo