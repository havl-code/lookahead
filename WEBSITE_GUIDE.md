# Website Usage Guide

Complete guide to using the Speedcube Training Explorer web interface.

## Getting Started

### Starting the Server

```bash
cd speedcube-training-explorer
source venv/bin/activate  # Windows: venv\Scripts\activate
python main.py
# Select option 1 (Web Interface)
```

The server will start on `http://localhost:5000`. Open this URL in your browser.

To stop the server, press `Ctrl+C` in the terminal.

## Interface Overview

The web interface has 5 main tabs:

1. **Dashboard** - Overview of your statistics and recent sessions
2. **Sessions** - Manage training sessions and individual solves
3. **Cubes** - Track your speedcube inventory
4. **Import** - Import data from CSTimer
5. **Charts** - Interactive progress visualizations

## Dashboard Tab

### Statistics Cards

**Personal Best** - Your fastest single solve (excludes DNFs)

**Average Time** - Mean of all your solves

**Total Solves** - Count of all recorded solves

**Total Sessions** - Count of training sessions

**Your World Rank** - Estimated rank vs WCA competitors worldwide
- Based on your personal best
- Compared against ~200,000 ranked competitors
- Top 1000 uses actual WCA data, beyond that uses statistical estimation

**Your Percentile** - Where you rank percentage-wise
- "Top 0.63%" means you're faster than 99.37% of ranked competitors
- Lower percentage = faster/better

### Recent Sessions Table

Shows your 5 most recent training sessions with:
- Date
- Event (e.g., 333 for 3x3x3)
- Number of solves
- Best single time
- Session mean

## Sessions Tab

### Viewing Sessions

The sessions table shows:
- **ID**: Session identifier
- **Date**: When the session occurred
- **Event**: Puzzle type (333, 222, etc.)
- **Solves**: Number of solves in session
- **Best**: Best single time
- **Mean**: Average of all solves
- **Ao5**: Average of 5 (removes best/worst)
- **Ao12**: Average of 12 (removes best/worst)

### Managing Sessions

**Add New Session**:
1. Click "Add Session" button
2. Enter event ID (default: 333)
3. Optionally select which cube you used
4. Add notes (optional)
5. Click "Create Session"

**View Solves**:
1. Click "View Solves" on any session
2. Modal opens showing all individual solves
3. See solve number, time, penalty, scramble

**Delete Session**:
1. Click "Delete" button
2. Confirm deletion
3. Session and all its solves are permanently removed

### Managing Individual Solves

**Add Solve to Session**:
1. Click "View Solves" on a session
2. In the modal, fill in:
   - Time in seconds (e.g., 18.5)
   - Penalty (None, +2, or DNF)
   - Scramble (optional)
3. Click "Add Solve"
4. Session stats update automatically

**Delete Solve**:
1. In the solve modal, click "Delete" on any solve
2. Confirm deletion
3. Solve is removed and session stats recalculate

## Cubes Tab

Track your speedcube collection and performance by cube.

### Adding Cubes

1. Click "Add Cube" button
2. Fill in:
   - **Name**: Your identifier (e.g., "Main 3x3")
   - **Brand**: Manufacturer (e.g., "GAN", "MoYu")
   - **Model**: Specific model (e.g., "14 MagLev", "WRM 2021")
   - **Purchase Date**: When you got it (optional)
   - **Notes**: Any additional info (optional)
3. Click "Add Cube"

### Viewing Cubes

The cubes table shows:
- ID, Name, Brand, Model
- Purchase Date
- Status (Active/Inactive)

### Deactivating Cubes

1. Click "Deactivate" on a cube
2. Cube status changes to "Inactive"
3. It won't appear in session cube selection
4. Past sessions with this cube remain intact

## Import Tab

Import your training data from CSTimer.

### Exporting from CSTimer

1. Go to [cstimer.net](https://cstimer.net)
2. Click the menu (☰) → Export
3. Choose "Export to file"
4. Save the .txt file (it contains JSON data)

### Importing to Explorer

1. Click "Choose File"
2. Select your CSTimer export file
3. Click "Preview Sessions"
4. You'll see a list of all sessions with:
   - Session name (e.g., "session1", "session2")
   - Number of solves
   - Best time
   - Mean time
5. Check/uncheck sessions you want to import
6. Click "Import Selected"
7. Wait for import to complete
8. Your stats will update automatically

### Tips

- **Select specific sessions**: Uncheck sessions you don't want (e.g., test sessions, incomplete sessions)
- **Avoid duplicates**: Don't import the same file twice
- **Large imports**: Files with 10,000+ solves may take a minute
- **File location**: Keep CSTimer exports in `data/raw/` for organization

## Charts Tab

Interactive visualizations powered by Plotly.

### Training Progress Over Time

**Shows**:
- Best Single per session (black line)
- Session Mean (dark gray line)
- Ao5 per session (light gray line, if available)

**Interactive Features**:
- **Zoom**: Click and drag to zoom into a region
- **Pan**: Hold shift + drag to pan around
- **Hover**: See exact values for each point
- **Reset**: Double-click to reset view
- **Legend**: Click legend items to show/hide lines

### Solve Time Distribution

**Shows**:
- Histogram of all your solve times
- Median time marked with dashed line
- Frequency distribution

**Interactive Features**:
- Zoom in on specific time ranges
- Hover to see exact bin counts
- Understand your consistency

### Chart Requirements

- **Progress Chart**: Need at least 2 sessions with 5+ solves each
- **Distribution Chart**: Need at least 5 total solves

## Common Tasks

### "I want to track my improvement over time"

1. Regularly log sessions or import from CSTimer
2. Go to Charts tab
3. Watch your lines trend downward (faster times!)

### "I want to compare different cubes"

1. Add all your cubes in Cubes tab
2. When creating sessions, select which cube
3. Use CLI for cube comparison:
   ```bash
   python src/python/cube_manager.py
   # Select option 4 (Compare cubes)
   ```

### "I made a mistake in a solve time"

1. Go to Sessions tab
2. Click "View Solves" on the session
3. Delete the incorrect solve
4. Add the correct one
5. Stats recalculate automatically

### "I want to see how I rank globally"

1. Import your data
2. Dashboard shows your estimated WCA rank
3. Based on your personal best vs world rankings

### "I want to delete old practice sessions"

1. Go to Sessions tab
2. Click "Delete" on unwanted sessions
3. Confirm deletion
4. Stats update automatically

## Troubleshooting

### Charts not loading

- Check browser console (F12 → Console)
- Make sure you have at least 2 sessions with 5+ solves
- Try refreshing the page (Ctrl+Shift+R)

### Import not working

- Make sure file is .txt or .json from CSTimer
- Check file isn't corrupted
- Check server terminal for error messages

### Stats showing "No data"

- Import or log some sessions first
- Make sure solves don't all have DNF penalties

### Server won't start

```bash
# Check if port 5000 is already in use
# On Linux/Mac:
lsof -i :5000

# On Windows:
netstat -ano | findstr :5000

# Kill the process or use a different port in website_server.py
```

## Tips for Best Experience

1. **Regular imports**: Import CSTimer data weekly to keep stats current
2. **Use cube tracking**: Know which cube performs best for you
3. **Clean data**: Delete test sessions or incomplete practice
4. **Explore charts**: Use zoom and hover to find insights
5. **Both interfaces**: Use web for analysis, CLI for quick logging

## Keyboard Shortcuts

- **Tab**: Navigate between form fields
- **Enter**: Submit forms
- **Escape**: Close modals (when implemented)
- **Ctrl+Shift+R**: Hard refresh (clear cache)

## Data Location

All your data is stored locally in:
- `data/speedcube.db` - SQLite database with all your data
- `data/raw/` - Your CSTimer export files
- `data/processed/` - Generated chart images (CLI only)

**Backup tip**: Regularly copy `data/speedcube.db` to a safe location!

## Privacy & Security

- ✓ All data stays on your computer
- ✓ No data sent to external servers (except WCA API for rankings)
- ✓ No account or login required  
- ✓ No tracking or analytics
- ✓ Open source - verify the code yourself

## Advanced: Running on Network

To access from other devices on your network:

1. Find your computer's IP address:
   ```bash
   # Linux/Mac:
   ifconfig | grep inet
   
   # Windows:
   ipconfig
   ```

2. The server already runs on `0.0.0.0:5000`

3. On other devices, go to: `http://YOUR_IP:5000`

Example: If your IP is `192.168.1.100`, use `http://192.168.1.100:5000`

## Still Need Help?

- Check the main README.md for installation issues
- Check the GitHub Issues page
- Review error messages in browser console (F12)
- Check server terminal for Python errors

---

**Happy cubing! May your times always trend downward.**