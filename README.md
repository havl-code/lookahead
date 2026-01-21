# Speedcube Training Explorer 🎲

**Track your progress. Analyze your solves. Compare with the world.**

A comprehensive web-based training tracker for speedcubers. Track your solving sessions, analyze your progress with beautiful charts, manage your cube inventory, and see how you stack up against WCA world rankings—all stored locally on your machine.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## 📸 Screenshots

> **Note:** Screenshots coming soon! The app features a clean, minimalist black-and-white interface with subtle color accents in charts.

- **Dashboard** - Overview of your stats, PBs, and recent sessions
- **Live Timer** - Competition-ready timer with inspection mode
- **Charts** - Progress tracking, distributions, rolling averages, and consistency analysis
- **Analytics** - Performance metrics and insights

---

## ✨ Features

### 📊 Dashboard & Statistics
- **Personal Best Tracking** - Track PB singles for all WCA events
- **Session Statistics** - Ao5, Ao12, mean, and best/worst times per session
- **WCA Comparison** - See your estimated world rank and percentile based on your PB
- **Event Filtering** - Filter stats by specific events (3x3, 4x4, etc.) or view all combined

### ⏱️ Live Timer
- **Competition-Ready Timer** - WCA-style space bar timer (hold to start, release to stop)
- **Inspection Mode** - Optional 15-second inspection countdown (configurable)
- **Automatic Scrambles** - Generated 3x3 scrambles for each solve
- **Real-Time Statistics** - Live Ao5, mean, and session stats as you solve
- **Penalty Support** - Track +2 penalties and DNFs
- **Fullscreen Mode** - Distraction-free solving environment

### 📈 Advanced Charts & Analytics
- **Progress Over Time** - Visualize improvement across sessions
- **Time Distribution** - Histogram showing solve time patterns
- **Rolling Averages** - Track Ao5 and Ao12 trends over time
- **Consistency Analysis** - Box plots comparing performance across sessions
- **Performance Metrics** - Speed, consistency, accuracy, and overall scores

### 📦 Cube Inventory
- **Cube Database** - Track all your cubes by type, brand, and model
- **Usage History** - Link cubes to training sessions
- **Active/Inactive Status** - Manage your current rotation

### 📥 Import/Export
- **CSTimer Import** - Import your existing CSTimer sessions (JSON/TXT formats)
- **Selective Import** - Choose which sessions to import
- **Batch Processing** - Import hundreds of solves at once

### 🎨 User Experience
- **Dark/Light Mode** - Toggle between themes with one click
- **Minimalist Design** - Clean black-and-white interface with subtle chart colors
- **Personalized Greeting** - Optional WCA ID integration for personalized features
- **Responsive Design** - Works great on desktop and mobile
- **No Login Required** - All data stored locally in SQLite database

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.8 or higher** - [Download Python](https://www.python.org/downloads/)
- **pip** (comes with Python)
- **Modern web browser** (Chrome, Firefox, Safari, Edge)

### Installation

> 📖 **For complete step-by-step installation instructions, troubleshooting, and configuration options, see [INSTALLATION.md](INSTALLATION.md).**

**Quick version:**
1. Clone this repository
2. Run `install.bat` (Windows) or `./install.sh` (macOS/Linux)
3. Run `start.bat` (Windows) or `./start.sh` (macOS/Linux)
4. Your browser will open to `http://localhost:5000`

That's it! 🎉

> 💡 **Having issues?** Check the [troubleshooting section](INSTALLATION.md#troubleshooting) in INSTALLATION.md.

---

## 📖 Usage Guide

> 📋 **New to the app?** Make sure you've completed the [installation steps](INSTALLATION.md) first!

### First Time Setup

1. **Launch the app** - Run `start.bat` (Windows) or `./start.sh` (macOS/Linux)
   - If you haven't installed yet, see [INSTALLATION.md](INSTALLATION.md)
2. **The app opens** in your browser at `http://localhost:5000`
3. **Optional:** Set up your WCA ID in the dashboard for personalized features
4. **Start tracking** - Use the Timer or import existing data

### Using the Timer

1. Navigate to **Timer** tab
2. Select your event (3x3, 4x4, etc.) and session
3. Press **SPACE** to start inspection (if enabled)
4. Hold **SPACE** until timer turns green (ready state)
5. Release **SPACE** to start solving
6. Press **SPACE** again to stop

Times are automatically saved to the current session!

### Importing CSTimer Data

1. **Export from CSTimer:**
   - Open CSTimer → Export → Download as JSON or TXT

2. **Import to Speedcube Explorer:**
   - Go to **Import** tab
   - Click "Choose File" and select your export
   - Click "Preview Sessions"
   - Select which sessions to import
   - Choose the event type
   - Click "Import Selected"

### Managing Sessions

- **View all sessions** - Sessions tab shows all your training with filters
- **Add solves manually** - Click "Add Session" → Add individual solves
- **Edit/Delete** - Manage existing sessions and solves
- **Sort & Filter** - Organize by date, event, or performance

---

## 🛠️ Advanced Usage

> 📖 **For detailed configuration, database management, and troubleshooting, see [INSTALLATION.md](INSTALLATION.md).**

### Manual Start (Without Scripts)

If you prefer to start the app manually:

```bash
# Activate virtual environment
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows

# Start the app
python main.py
```

### Database Management

```bash
# Reset/initialize database
python main.py --init-db

# Show help
python main.py --help
```

### Configuration

The app runs on **port 5000** by default. To change the port or configure other settings, see the [Configuration section](INSTALLATION.md#configuration) in INSTALLATION.md.

---

## 🛠️ Tech Stack

- **Backend:** Python 3.8+, Flask 3.1.2
- **Database:** SQLite (local storage)
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Charts:** Plotly.js
- **Data Processing:** Pandas
- **External APIs:** WCA REST API (for rankings)

---

## 📁 Project Structure

```
speedcube-training-explorer/
├── data/                  # Your training data (SQLite database)
│   ├── cache/            # WCA API cache
│   ├── processed/        # Processed import files
│   └── raw/              # Raw import files
├── src/
│   ├── python/           # Backend logic
│   │   ├── db_manager.py
│   │   ├── training_logger.py
│   │   ├── cube_manager.py
│   │   ├── import_cstimer.py
│   │   └── wca_api_client.py
│   └── web/              # Frontend
│       ├── api/          # Flask API routes
│       ├── css/          # Stylesheets
│       ├── js/           # JavaScript modules
│       └── index.html    # Main page
├── sql/                  # Database schema
├── install.bat           # Windows installer
├── install.sh            # macOS/Linux installer
├── start.bat             # Windows launcher
├── start.sh              # macOS/Linux launcher
├── main.py               # Python entry point
├── website_server.py     # Flask server entry point
└── requirements.txt      # Python dependencies
```

---

## 🤝 Contributing

Contributions are welcome! Whether you're a speedcuber with feature ideas or a developer looking to help, we'd love to have you.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Feel free to open an issue for bugs or feature requests!

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **[WCA REST API](https://github.com/robiningelbrecht/wca-rest-api)** by [@robiningelbrecht](https://github.com/robiningelbrecht) - Unofficial REST API for World Cube Association data
- **WCA** - World Cube Association for their official database and rankings
- **CSTimer** - For inspiration and export format compatibility
- **Plotly.js** - For beautiful interactive charts
- **Speedcubing Community** - For feedback, support, and keeping the passion alive

---

## 📧 Contact & Support

**Creator:** Viet Ha Ly  
**GitHub:** [@havl-code](https://github.com/havl-code)  
**Repository:** [speedcube-training-explorer](https://github.com/havl-code/speedcube-training-explorer)  
**Issues:** [Report bugs or request features](https://github.com/havl-code/speedcube-training-explorer/issues)

> 🔧 **Having installation or setup issues?** Check the [troubleshooting guide](INSTALLATION.md#troubleshooting) in INSTALLATION.md first!

---

**Happy Cubing! 🎲✨**

*Track your progress, beat your PBs, and join the global speedcubing community.*
