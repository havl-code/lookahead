# Speedcube Training Explorer

Personal speedcubing training analysis tool with WCA rankings comparison and interactive web interface.

## ✨ Features

### 🌐 Web Interface (New!)
- **Modern Dashboard**: Real-time statistics with WCA world rankings
- **Interactive Charts**: Colorful Plotly visualizations with zoom/pan
- **Session Management**: Advanced filtering and sorting
- **Cube Inventory**: Track multiple speedcubes with edit functionality
- **CSTimer Import**: Preview and selectively import sessions
- **Responsive Design**: Clean black & white theme

### 📊 Core Features
- **Training Session Management**: Log solves manually or import from CSTimer
- **Automatic Statistics**: Ao5, Ao12, Ao50, Ao100 calculated automatically  
- **WCA Comparison**: Compare times against ~200,000 world rankings via REST API
- **Progress Tracking**: Visualize improvement over time
- **Cube Performance**: Track and compare different speedcubes
- **Statistical Analysis**: Percentile rankings, personal bests, trends

### 🎨 Web Interface Highlights
- **Dashboard Tab**: Overview statistics with WCA percentile rankings
- **Sessions Tab**: Filter by event, date, time range; sort multiple ways
- **Cubes Tab**: Full CRUD operations (create, read, update, deactivate)
- **Import Tab**: Preview CSTimer sessions before importing
- **Charts Tab**: 4 interactive charts (progress, distribution, rolling averages, consistency)

## 🚀 Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/havl-code/speedcube-training-explorer.git
cd speedcube-training-explorer

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Initialize database
python src/python/db_manager.py
```

### Launch Application

```bash
python main.py
```

Choose interface:
- **Option 1: Web Interface** (Recommended) - Modern browser-based UI
- **Option 2: CLI Interface** - Terminal-based menu system

#### Web Interface
```bash
python main.py
# Select 1 (Web Interface)
# Open http://localhost:5000
```

Features:
- Interactive dashboard with real-time stats
- Advanced session filtering and sorting
- Colorful interactive charts (zoom, pan, hover)
- Cube inventory management with edit
- CSTimer import with session preview

#### CLI Interface
```bash
python main.py
# Select 2 (CLI Interface)
```

Features:
- Fast keyboard navigation
- Batch operations
- Direct Python API access
- Matplotlib static charts

## 📖 Usage Guide

### Web Interface

#### Dashboard
1. View overall statistics (PB, average, solve count)
2. See WCA world rankings comparison
3. Filter by event using dropdown
4. View recent sessions table

#### Sessions Management
1. **Filter Sessions**: By event, date range, time range
2. **Sort Sessions**: By date, best time, solve count (ascending/descending)
3. **View Solves**: Click "View" to see individual solves
4. **Add Solves**: Add new solves to existing sessions
5. **Delete**: Remove solves or entire sessions

#### Cube Inventory
1. **Add Cube**: Name, brand, model, purchase date, notes
2. **Edit Cube**: Click "Edit" to modify any field
3. **Deactivate**: Hide cubes without deleting data
4. **Reactivate**: Bring inactive cubes back

#### Import Data
1. **Export from CSTimer**: Menu → Export → Save .txt file
2. **Choose File**: Select your CSTimer export
3. **Preview Sessions**: See all sessions with statistics
4. **Select**: Check/uncheck sessions to import
5. **Choose Event**: Set puzzle type (333, 222, etc.)
6. **Import**: Process selected sessions

#### Charts
1. **Progress Over Time**: Best single, mean, Ao5 trends
2. **Distribution**: Histogram with mean/median markers
3. **Rolling Averages**: Ao5 and Ao12 progression
4. **Consistency**: Box plots across sessions

**Chart Controls**:
- Zoom: Click and drag
- Pan: Hold Shift + drag
- Reset: Double-click
- Hover: See exact values

### CLI Interface

#### Import CSTimer Data
```bash
python src/python/import_cstimer.py data/raw/your_file.txt
```

#### Log Training Session
```bash
python src/python/training_logger.py --interactive
```

#### Manage Sessions
```bash
python src/python/training_logger.py --manage
```

#### View Progress & Stats
```bash
python src/python/my_progress.py
```

#### Manage Cubes
```bash
python src/python/cube_manager.py
```

#### Generate Charts
```bash
python src/python/visualizer.py
```

## 📁 Project Structure

```
speedcube-training-explorer/
├── data/
│   ├── raw/                    # CSTimer exports
│   ├── processed/              # Generated charts (CLI)
│   └── speedcube.db            # SQLite database
├── src/
│   ├── python/                 # Backend logic
│   │   ├── import_cstimer.py
│   │   ├── training_logger.py
│   │   ├── cube_manager.py
│   │   ├── wca_api_client.py
│   │   ├── my_progress.py
│   │   ├── visualizer.py
│   │   ├── analyzer.py
│   │   └── db_manager.py
│   └── web/                    # Web interface
│       ├── css/
│       │   └── style.css
│       ├── js/
│       │   ├── config.js
│       │   ├── dashboard.js
│       │   ├── sessions.js
│       │   ├── cubes.js
│       │   ├── charts.js
│       │   ├── import.js
│       │   └── app.js
│       └── index.html
├── sql/
│   └── schema.sql              # Database schema
├── main.py                     # Main entry point
├── website_server.py           # Flask web server
└── requirements.txt
```

## 🎨 Technology Stack

- **Backend**: Python 3.9+, Flask, SQLite
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Charts**: Plotly (web), Matplotlib (CLI)
- **Data**: Pandas, NumPy
- **API**: WCA REST API (public rankings)

## 🔒 Privacy

- All data stored locally (SQLite)
- No data uploaded to servers
- No authentication required
- Open source - verify yourself

## 🆕 Recent Updates

### Version 1.1 (Latest)
- ✨ Complete web interface with modern UI
- 🎨 Interactive Plotly charts with zoom/pan
- 🔍 Advanced session filtering and sorting
- ✏️ Full cube editing functionality
- 📥 CSTimer import with session preview
- 🎯 Colorful charts (black & white theme)
- 📱 Responsive design for all screen sizes
- ⚡ Modular JavaScript architecture

### Version 1.0
- Initial release with CLI interface
- CSTimer import functionality
- WCA API integration
- Basic statistics and charts

## 🐛 Troubleshooting

### Charts Not Loading
- Check browser console (F12)
- Ensure Plotly CDN is accessible
- Clear browser cache (Ctrl+Shift+R)

### Import Errors
- Verify CSTimer file format (.txt with JSON)
- Check file is in `data/raw/`
- Ensure valid JSON structure

### Database Issues
```bash
# Reinitialize database
python src/python/db_manager.py
```

## 🤝 Contributing

This is a personal portfolio project. Feel free to:
- Fork and adapt for your use
- Report bugs via Issues
- Suggest features via Issues
- Submit improvements via Pull Requests

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- **WCA** - Competition data standards
- **[CSTimer](https://cstimer.net)** - Timer interface
- **[WCA REST API](https://github.com/robiningelbrecht/wca-rest-api)** - Easy API access
- **Speedcubing Community** - Inspiration and support

## 📧 Contact

**Viet Ha Ly**
- GitHub: [@havl-code](https://github.com/havl-code)
- Email: havl21@outlook.com
- Project: [speedcube-training-explorer](https://github.com/havl-code/speedcube-training-explorer)

---

**Happy Cubing! 🎲**