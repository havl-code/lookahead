# Speedcube Training Explorer

Personal speedcubing training analysis tool that combines your training data with WCA (World Cube Association) rankings for comprehensive performance tracking and improvement analysis.

## Features

- Import training data from CSTimer exports
- Manual session logging with automatic Ao5/Ao12 calculation
- Compare personal times against WCA world rankings via REST API
- Track progress over time with visualizations
- Session management (edit/delete solves)
- Statistical analysis of performance trends

## Data Sources

### Personal Training Data
- Manual entry via interactive logger
- Import from CSTimer TXT/JSON exports

### WCA Comparison Data
- Live rankings via [WCA REST API](https://github.com/robiningelbrecht/wca-rest-api)
- No database download required
- Real-time world record information
- Percentile calculations against ranked competitors

## Installation

### Requirements
- Python 3.9+
- SQLite3
- Git

### Setup
```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/speedcube-training-explorer.git
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

## Usage

### 1. Import CSTimer Data

Export your times from CSTimer:
1. Go to [cstimer.net](https://cstimer.net)
2. Click "Export" in the menu
3. Save the file (will be a .txt file containing JSON data)

Place the file in `data/raw/` and import:
```bash
python src/python/import_cstimer.py data/raw/your_cstimer_file.txt
```

### 2. Manual Session Logging

Log a training session interactively:
```bash
python src/python/training_logger.py --interactive
```

Enter times one by one:
- Regular solve: `18.5`
- Plus two: `20.3+2`
- DNF: `dnf`
- Finish: `done`

### 3. Manage Sessions

Edit or delete existing sessions/solves:
```bash
python src/python/training_logger.py --manage
```

Options:
- View all sessions
- View solve details
- Edit individual solves
- Delete solves or entire sessions

### 4. View Progress

Analyze your training data:
```bash
python src/python/my_progress.py
```

Shows:
- Personal bests and averages
- Comparison to WCA world rankings
- Improvement over time
- Progress visualization chart

### 5. Test WCA API

Test WCA API connectivity:
```bash
python src/python/wca_api_client.py
```

## Project Structure
```
speedcube-training-explorer/
├── data/
│   ├── raw/                    # CSTimer exports go here
│   ├── processed/              # Generated charts
│   └── speedcube.db            # Personal training database
├── src/
│   └── python/
│       ├── import_cstimer.py   # Import CSTimer data
│       ├── training_logger.py  # Log/manage sessions
│       ├── my_progress.py      # Analyze progress
│       ├── wca_api_client.py   # WCA API integration
│       ├── analyzer.py         # Statistical analysis
│       ├── visualizer.py       # Create charts
│       └── db_manager.py       # Database management
├── sql/
│   └── schema.sql              # Database schema
└── config/
    └── config.yaml             # Configuration
```

## Database Schema

### Personal Training Tables

- **training_sessions**: Session metadata (date, event, notes)
- **personal_solves**: Individual solve times with scrambles
- **training_goals**: Performance goals and tracking

## API Integration

Uses the unofficial WCA REST API (static JSON files):
- Base URL: `https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/master/api`
- No authentication required
- No rate limits
- Data updated periodically

## Privacy

- All personal data stays local (SQLite database)
- No data uploaded to any server
- CSTimer files excluded from git (.gitignore)
- No API keys or tokens required

## Contributing

This is a personal project for portfolio purposes. Feel free to fork and adapt for your own use.

## License

MIT License - see LICENSE file

## Acknowledgments

- WCA for competition data standards
- [CSTimer](https://cstimer.net) for the excellent timer interface
- [Unofficial WCA REST API](https://github.com/robiningelbrecht/wca-rest-api) by Robin Ingelbrecht