# Speedcube Training Explorer

Personal speedcubing training analysis tool that combines your training data with WCA (World Cube Association) rankings for comprehensive performance tracking and improvement analysis.

## Features

### Core Features
- **Training Session Management**: Log solves manually or import from CSTimer
- **Automatic Statistics**: Ao5, Ao12, Ao50, Ao100 calculated automatically  
- **WCA Comparison**: Compare your times against world rankings via REST API
- **Progress Tracking**: Visualize improvement over time with charts
- **Cube Inventory**: Track performance across different speedcubes
- **Session Management**: Edit/delete solves and sessions
- **Statistical Analysis**: Percentile rankings, personal bests, trends

### New in Latest Version
- Cube inventory management with performance tracking
- WCA REST API integration (no database download needed)
- Enhanced visualizations using live WCA data
- Cube-specific performance comparisons
- Improved percentile calculations

## Data Sources

### Personal Training Data
- Manual entry via interactive session logger
- Import from CSTimer TXT/JSON/CSV exports
- Edit and manage historical data

### WCA Comparison Data  
- Live rankings via [WCA REST API](https://github.com/robiningelbrecht/wca-rest-api)
- No 2GB database download required
- Real-time world record information
- Percentile calculations against ~200,000 ranked competitors
- Top 1000 rankings for all events

## 🚀 Installation

### Requirements
- Python 3.9+
- SQLite3 (included with Python)
- Git

### Setup

```bash
# Clone repository
git clone https://github.com/havl-code/speedcube-training-explorer.git
cd speedcube-training-explorer

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Linux/Mac
# venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt

# Initialize database
python src/python/db_manager.py
```

## Quick Start

### First Time Users

1. **Clone and setup**:
```bash
git clone https://github.com/havl-code/speedcube-training-explorer.git
cd speedcube-training-explorer
python -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
python src/python/db_manager.py
```

2. **Launch the interactive menu**:
```bash
python main.py
```

3. **Add your cubes** (optional):
   - Select option `5` from menu
   - Add your speedcubes with brand/model info

4. **Import CSTimer data**:
   - Select option `1` from menu  
   - Place your CSTimer export in `data/raw/`
   - Enter the filename

5. **View your progress**:
   - Select option `6` for detailed statistics
   - Select option `7` for WCA comparison
   - Select option `8` to generate visualizations

### Daily Usage
```bash
cd speedcube-training-explorer
source venv/bin/activate
python main.py
```

## Usage Guide

### 1. Import CSTimer Data

**Export from CSTimer**:
1. Go to [cstimer.net](https://cstimer.net)
2. Click "Export" in the menu
3. Save the file (will be a .txt file containing JSON data)

**Import the file**:
```bash
python src/python/import_cstimer.py data/raw/your_cstimer_file.txt
```

Or use the interactive menu (option 1).

### 2. Manual Session Logging

Log a training session interactively:
```bash
python src/python/training_logger.py --interactive
```

**Enter times**:
- Regular solve: `18.5`
- Plus two: `20.3+2`  
- DNF: `dnf`
- Finish: `done`

**With cube tracking**:
- Answer "y" when asked about tracking cube
- Select from your cube inventory

### 3. Manage Cube Inventory

Add and track your speedcubes:
```bash
python src/python/cube_manager.py
```

**Features**:
- Add cubes with brand/model info
- Track which cube was used in each session
- Compare performance across different cubes
- View cube-specific statistics

### 4. Manage Sessions

Edit or delete existing sessions/solves:
```bash
python src/python/training_logger.py --manage
```

**Options**:
- View all sessions
- View solve details  
- Edit individual solves
- Delete solves or entire sessions
- Edit session notes

### 5. View Progress & Statistics

Analyze your training data:
```bash
python src/python/my_progress.py
```

**Shows**:
- Personal bests and averages
- Total session and solve counts
- Comparison to WCA world rankings
- Estimated world rank and percentile
- Improvement over time
- Gap analysis (PB vs average)

### 6. Generate Visualizations

Create charts and graphs:
```bash
python src/python/visualizer.py
```

**Generates**:
- Time distribution (top ranked)
- Top 10 solvers bar chart
- Percentile comparison chart
- Personal progress over time

All images saved to `data/processed/`.

### 7. Test WCA API

Verify API connectivity:
```bash
python src/python/wca_api_client.py
```

Shows world records, top rankings, and percentile calculations.

## Updating Your Data

### Replace All Data
```bash
# 1. Export new data from CSTimer
# 2. Clear existing data
sqlite3 data/speedcube.db "DELETE FROM personal_solves; DELETE FROM training_sessions;"

# 3. Import new file
python src/python/import_cstimer.py data/raw/my_new_export.txt

# 4. Regenerate visualizations
python src/python/visualizer.py
```

### Add New Sessions
```bash
# Import additional file (adds to existing data)
python src/python/import_cstimer.py data/raw/december_solves.txt
```

### Use Interactive Menu
```bash
python main.py
# Select option 1, follow prompts
```

## Project Structure

```
speedcube-training-explorer/
├── data/
│   ├── raw/                    # CSTimer exports go here
│   ├── processed/              # Generated charts (gitignored)
│   └── speedcube.db            # Personal training database
├── src/
│   └── python/
│       ├── import_cstimer.py   # Import CSTimer data
│       ├── training_logger.py  # Log/manage sessions
│       ├── cube_manager.py     # Manage cube inventory
│       ├── my_progress.py      # Analyze progress
│       ├── wca_api_client.py   # WCA API integration
│       ├── analyzer.py         # Statistical analysis
│       ├── visualizer.py       # Create charts
│       └── db_manager.py       # Database management
├── sql/
│   └── schema.sql              # Database schema
├── config/
│   └── config.yaml             # Configuration
├── main.py                     # Interactive menu
├── requirements.txt            # Dependencies
├── setup.py                    # Package installation
└── README.md                   # This file
```

## Database Schema

### Personal Training Tables

- **cubes**: Speedcube inventory with brand/model info
- **training_sessions**: Session metadata (date, event, cube used, stats)
- **personal_solves**: Individual solve times with scrambles and penalties
- **training_goals**: Performance goals and tracking
- **user_profile**: User settings and WCA ID

### Views

- **view_personal_bests**: Personal best times by event
- **view_session_stats**: Session statistics with cube info
- **view_progress_timeline**: Progress over time
- **view_cube_comparison**: Performance comparison across cubes

## WCA API Integration

Uses the unofficial WCA REST API (static JSON files):
- **Base URL**: `https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/master/api`
- **Authentication**: None required
- **Rate Limits**: None (static files)
- **Update Frequency**: Updated periodically

### Features
- World rankings (top 1000 per event)
- World records for all events
- Person lookup by WCA ID
- Percentile estimation against ~200,000 ranked competitors

### Limitations
- Rankings limited to top 1000 competitors per event
- Broader rankings (beyond top 1000) estimated using statistical models
- Data not real-time (updated periodically)

## Technology Stack

- **Backend**: Python 3.9+, Flask, SQLite
- **Frontend**: HTML, CSS (Montserrat font), JavaScript
- **Charts**: Plotly (interactive), Matplotlib (CLI)
- **Data**: Pandas, NumPy
- **API**: Requests (for WCA data)

## Privacy

- All personal data stays local (SQLite database)
- No data uploaded to any server
- CSTimer files excluded from git
- No API keys or authentication required
- Generated charts not tracked in git

## Example Workflow

1. **Add your cubes**: Track which speedcube you're using
2. **Import history**: Load your CSTimer data from past sessions
3. **Log sessions**: Record new training sessions with cube info
4. **Check progress**: View improvement over time
5. **Compare to WCA**: See how you rank globally
6. **Generate charts**: Create visualizations to share
7. **Set goals**: Track progress toward target times

## Advanced Usage

### Direct Python API

```python
from src.python.training_logger import TrainingLogger
from src.python.wca_api_client import WCAApiClient

# Log a session
logger = TrainingLogger()
logger.connect()
session_id = logger.create_session(event_id='333', cube_id=1)
logger.add_solve(session_id, 18.5)
logger.update_session_stats(session_id)
logger.disconnect()

# Compare to WCA
wca = WCAApiClient()
result = wca.estimate_percentile(18.5, '333', 'single')
print(f"Rank: ~{result['rank_estimate']}")
print(f"Percentile: {result['faster_than']}")
```

### SQL Queries

```bash
# View all sessions
sqlite3 data/speedcube.db "SELECT * FROM training_sessions;"

# Check cube performance
sqlite3 data/speedcube.db "SELECT * FROM view_cube_comparison;"

# Export to CSV
sqlite3 -header -csv data/speedcube.db "SELECT * FROM personal_solves;" > my_solves.csv
```

## Contributing

This is a personal project for portfolio purposes. Feel free to:
- Fork and adapt for your own use
- Submit bug reports via Issues
- Suggest features via Issues
- Share your improvements via Pull Requests

## License

MIT License - see [LICENSE](LICENSE) file for details.

You are free to:
- Use commercially
- Modify
- Distribute  
- Use privately

Under the conditions:
- Include original license and copyright notice

## Acknowledgments

- **WCA** for competition data standards and events
- **[CSTimer](https://cstimer.net)** for the excellent timer interface
- **[Unofficial WCA REST API](https://github.com/robiningelbrecht/wca-rest-api)** by Robin Ingelbrecht for making WCA data easily accessible
- **Speedcubing community** for inspiration and support

## Contact

**Viet Ha Ly**
- GitHub: [@havl-code](https://github.com/havl-code)
- Email: havl21@outlook.com
- Project: [speedcube-training-explorer](https://github.com/havl-code/speedcube-training-explorer)

---

**Happy Cubing!**