#!/bin/bash
# Speedcube Training Explorer - macOS/Linux Launcher

echo "Starting Speedcube Training Explorer..."
echo

# Activate virtual environment
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

# Start Flask server in background
python main.py &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Open browser
echo "Opening browser..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open http://localhost:5000
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:5000
    elif command -v gnome-open &> /dev/null; then
        gnome-open http://localhost:5000
    fi
fi

echo
echo "========================================"
echo "   Speedcube Training Explorer"
echo "   Running at http://localhost:5000"
echo "========================================"
echo
echo "Press Ctrl+C to stop the server"

# Wait for Flask process
wait $SERVER_PID