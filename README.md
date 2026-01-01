# Speedcube Training Explorer

A comprehensive web-based training tracker for speedcubers. Track your solving sessions, analyze your progress, manage your cube inventory, and compare your times with WCA world rankings.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.8 or higher** - [Download Python](https://www.python.org/downloads/)
- **pip** (comes with Python)
- **Modern web browser** (Chrome, Firefox, Safari, Edge)

### Installation

#### Windows

1. **Download or clone** this repository:
   ```bash
   git clone https://github.com/havl-code/speedcube-training-explorer.git
   cd speedcube-training-explorer
   ```

2. **Run the installer** by double-clicking `install.bat` or in Command Prompt:
   ```bash
   install.bat
   ```

3. **Start the app** by double-clicking `start.bat` or:
   ```bash
   start.bat
   ```

4. Your browser will automatically open to `http://localhost:5000`

> **Windows Users Note:**
> - If you see security warnings when running `.bat` files, click **"More info"** → **"Run anyway"**
> - Allow Python through Windows Firewall when prompted (required for the web server)
> - If browser opens to a blank page, wait 2-3 seconds and **refresh (F5)** - the server needs time to start

#### macOS / Linux

1. **Download or clone** this repository:
   ```bash
   git clone https://github.com/havl-code/speedcube-training-explorer.git
   cd speedcube-training-explorer
   ```

2. **Make scripts executable**:
   ```bash
   chmod +x install.sh start.sh
   ```

3. **Run the installer**:
   ```bash
   ./install.sh
   ```

4. **Start the app**:
   ```bash
   ./start.sh
   ```

5. Your browser will automatically open to `http://localhost:5000`

---

## ✨ Features

### 📊 Dashboard & Statistics
- **Personal Best Tracking** - Track PB singles for all WCA events
- **Session Statistics** - Ao5, Ao12, mean, and best/worst times
- **WCA Comparison** - See your estimated world rank and percentile
- **Event Filtering** - Filter stats by specific events or view all

### ⏱️ Live Timer
- **Competition-Ready Timer** - WCA-style space bar timer
- **Inspection Mode** - Optional 15-second inspection (configurable)
- **Automatic Scrambles** - Generated 3x3 scrambles
- **Real-Time Statistics** - Live Ao5, mean, and session stats
- **Penalty Support** - +2 and DNF tracking
- **Fullscreen Mode** - Distraction-free solving

### 📈 Advanced Charts
- **Progress Over Time** - Visualize improvement across sessions
- **Time Distribution** - Histogram of solve times
- **Rolling Averages** - Track Ao5 and Ao12 trends
- **Consistency Analysis** - Box plots comparing sessions

### 📦 Cube Inventory
- **Cube Database** - Track all your cubes by type, brand, and model
- **Usage History** - Link cubes to training sessions
- **Active/Inactive Status** - Manage your current rotation

### 📥 Import/Export
- **CSTimer Import** - Import your CSTimer sessions (JSON/TXT)
- **Selective Import** - Choose which sessions to import
- **Batch Processing** - Import hundreds of solves at once

### 🎨 User Experience
- **Dark/Light Mode** - Automatic theme switching
- **Personalized Greeting** - Optional WCA ID integration
- **Responsive Design** - Works on desktop and mobile
- **No Login Required** - All data stored locally

---

## 📖 Usage Guide

### First Time Setup

1. **Launch the app** - Run `start.bat` (Windows) or `./start.sh` (macOS/Linux)
2. **The app opens** in your browser at `http://localhost:5000`
3. **Optional:** Set up your WCA ID for personalized features
4. **Start tracking** - Use the Timer or import existing data

### Using the Timer

1. Navigate to **Timer** tab
2. Press **SPACE** to start inspection (if enabled)
3. Hold **SPACE** until timer turns green
4. Release **SPACE** to start solving
5. Press **SPACE** to stop

Times are automatically saved to the current session!

### Importing CSTimer Data

1. **Export from CSTimer:**
   - Open CSTimer → Export → Download as JSON/TXT

2. **Import to Speedcube Explorer:**
   - Go to **Import** tab
   - Click "Choose File" and select your export
   - Click "Preview Sessions"
   - Select which sessions to import
   - Choose the event type
   - Click "Import Selected"

### Managing Sessions

- **View all sessions** - Sessions tab shows all your training
- **Add solves manually** - Click "Add Session" → Add individual solves
- **Edit/Delete** - Manage existing sessions and solves
- **Sort & Filter** - Organize by date, event, or performance

---

## 🛠️ Advanced Usage

### Manual Start (Without Scripts)

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

The app runs on **port 5000** by default. To change:

Edit `website_server.py`:
```python
app.run(debug=True, host='0.0.0.0', port=5000)
#                                         ^^^^ Change this
```

---

## 📁 Project Structure

```
speedcube-training-explorer/
├── data/              # Your training data (SQLite database)
├── src/
│   ├── python/        # Backend logic
│   └── web/           # Frontend (HTML/CSS/JS)
├── sql/               # Database schema
├── install.bat        # Windows installer
├── install.sh         # macOS/Linux installer
├── start.bat          # Windows launcher
├── start.sh           # macOS/Linux launcher
├── main.py            # Python launcher
└── requirements.txt   # Dependencies
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **[WCA REST API](https://github.com/robiningelbrecht/wca-rest-api)** by [@robiningelbrecht](https://github.com/robiningelbrecht) - Unofficial REST API for World Cube Association data
- **WCA** - World Cube Association for their official database
- **CSTimer** - For inspiration and export format compatibility
- **Plotly.js** - For beautiful interactive charts
- **Speedcubing Community** - For feedback and support

---

## 📧 Contact

**Creator:** Viet Ha Ly  
**GitHub:** [havl-code/speedcube-training-explorer](https://github.com/havl-code/speedcube-training-explorer)  
**Issues:** [Report bugs or request features](https://github.com/havl-code/speedcube-training-explorer/issues)

---

**Happy Cubing! 🎲✨**