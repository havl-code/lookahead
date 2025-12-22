# Speedcube Training Explorer

A web-based speedcubing training analysis tool with WCA rankings integration. Track personal progress, analyze statistics, and compare performance against worldwide competitors.

## ✨ Features

### 📊 Core Functionality
- **Session Management**: Track training sessions with solve-by-solve data
- **Multi-Event Support**: 3x3, 2x2, 4x4, and all official WCA events
- **Cube Inventory**: Manage and track performance by specific cubes
- **Statistics Dashboard**: Real-time PB, averages, Ao5/Ao12, session counts
- **WCA Integration**: Percentile rankings and estimated world rank via REST API

### 📈 Data Visualization
- Progress tracking over time with Plotly charts
- Solve time distribution analysis
- Rolling averages (Ao5, Ao12)
- Session consistency comparisons
- Interactive charts with zoom/pan

### 💾 Import & Export
- CSTimer JSON/TXT import with session selection
- Preserve scrambles and penalties
- Batch import with preview

### 🎨 UI Features
- Dark/light mode with persistent preference
- Sortable tables (sessions, solves)
- Responsive design
- Session filtering by event
- Clickable stats with detail modals

## 🛠️ Tech Stack

**Backend:**
- Python 3.13 | Flask | SQLite | Pandas
- WCA REST API client

**Frontend:**
- Vanilla JavaScript (ES6+) | Plotly.js | CSS3
- No framework dependencies

## 🚀 Installation

```bash
# Clone repository
git clone https://github.com/havl-code/speedcube-training-explorer.git
cd speedcube-training-explorer

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Initialize database
python src/python/db_manager.py
```

## 📱 Usage

### Web Interface (Recommended)

```bash
python website_server.py
# Navigate to http://localhost:5000
```

Or via main menu:
```bash
python main.py  # Select option 1
```

### CLI Interface

```bash
python main.py  # Select option 2 for CLI menu

# Or direct commands:
python src/python/import_cstimer.py data/raw/your_file.txt
python src/python/training_logger.py --interactive
python src/python/my_progress.py
```

## 📁 Project Structure

```
speedcube-training-explorer/
├── src/
│   ├── python/              # Backend logic
│   │   ├── training_logger.py
│   │   ├── import_cstimer.py
│   │   ├── wca_api_client.py
│   │   ├── cube_manager.py
│   │   └── analyzer.py
│   └── web/
│       ├── api/             # Flask routes (Blueprints)
│       │   ├── routes/
│       │   │   ├── stats.py
│       │   │   ├── sessions.py
│       │   │   ├── cubes.py
│       │   │   ├── charts.py
│       │   │   └── imports.py
│       │   └── __init__.py
│       ├── css/
│       ├── js/
│       └── index.html
├── data/
│   ├── speedcube.db         # SQLite database
│   └── raw/                 # Import files
├── website_server.py        # Flask entry point
└── requirements.txt
```

## 🗄️ Database Schema

**Tables:**
- `training_sessions`: Session metadata, aggregated stats
- `personal_solves`: Individual solve records with timestamps
- `cubes`: Cube inventory with purchase dates

**Key Implementation:**
- Times stored in milliseconds (ms)
- DNF stored as `time_ms = 0`, `dnf = 1`
- Ao5/Ao12 calculated per WCA rules (remove best/worst)

## 🌐 API Endpoints

```
GET  /api/stats                        # Dashboard statistics
GET  /api/pb-details                   # Personal best details
GET  /api/sessions                     # All sessions
POST /api/sessions/add                 # Create session
GET  /api/sessions/<id>/solves         # Session solves
POST /api/sessions/<id>/solves/add     # Add solve
GET  /api/cubes                        # Cube inventory
GET  /api/charts/*                     # Chart data
POST /api/import/preview               # Preview import
POST /api/import/selected              # Import sessions
```

## ✅ WCA Rules Compliance

- **DNF Handling**: DNF excluded from averages, not converted to numbers
- **Ao5**: Remove best/worst, average middle 3 (DNF if <3 valid)
- **Ao12**: Remove best/worst, average middle 10 (DNF if <10 valid)
- **Session Mean**: Average of all valid (non-DNF) solves

## 🔧 Development

### Adding New Routes

1. Create route file in `src/web/api/routes/`
2. Define Blueprint with endpoints
3. Import in `src/web/api/routes/__init__.py`
4. Register in `src/web/api/__init__.py`

### Running Tests

```bash
python src/python/wca_api_client.py    # Test WCA API
python src/python/db_manager.py         # Verify database
```

## 📊 Data Sources

- **WCA Rankings**: [robiningelbrecht/wca-rest-api](https://github.com/robiningelbrecht/wca-rest-api)
- Static JSON files updated regularly
- Percentile estimates based on top 1000 + statistical modeling

## 📄 License

MIT License

## 🙏 Acknowledgments

- WCA REST API by Robin Ingelbrecht
- CSTimer for export format compatibility
- WCA for official competition data

## 👤 Author

**Viet Ha Ly**
- GitHub: [@havl-code](https://github.com/havl-code)
- Email: [havl21@outlook.com](havl21@outlook.com)
- Project: [speedcube-training-explorer](https://github.com/havl-code/speedcube-training-explorer)