# Speedcube Training Explorer 🎲

**Track your progress. Analyse your solves. Compare with the world.**

A comprehensive, fully browser-based training tracker for speedcubers. Track your solving
sessions, analyse your progress with beautiful charts, manage your cube inventory, and see
how you stack up against WCA world rankings, all stored locally in your browser, with
nothing to install.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## 📸 Screenshots

> **Note:** Screenshots coming soon! The app features a clean interface with a friendly
> accent colour and colour-coded charts, in light or dark mode.

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
- **Quick Actions** - Jump straight into the timer, or add a session or cube, from the dashboard

### ⏱️ Live Timer
- **Competition-Ready Timer** - WCA-style space bar timer (hold to start, release to stop)
- **Inspection Mode** - Optional 15-second inspection countdown (configurable)
- **Automatic Scrambles** - Generated 3x3 scrambles for each solve
- **Real-Time Statistics** - Live Ao5, mean, and session stats as you solve
- **Penalty Support** - Track +2 penalties and DNFs
- **Fullscreen Mode** - Distraction-free solving environment

### 📈 Advanced Charts & Analytics
- **Progress Over Time** - Visualise improvement across sessions
- **Time Distribution** - Histogram showing solve time patterns
- **Rolling Averages** - Track Ao5 and Ao12 trends over time
- **Consistency Analysis** - Box plots comparing performance across sessions
- **Performance Metrics** - Speed, consistency, accuracy, and overall scores, colour-coded
  from red (needs work) to green (excellent)

### 📦 Cube Inventory
- **Cube Database** - Track all your cubes by type, brand, and model
- **Usage History** - Link cubes to training sessions
- **Active/Inactive Status** - Manage your current rotation

### 📥 Import/Export
- **CSTimer Import** - Import your existing CSTimer sessions (JSON/TXT formats)
- **Selective Import** - Choose which sessions to import
- **Backup/Restore** - Export all your data to one JSON file, or restore from one

### 🎨 User Experience
- **Dark/Light Mode** - Toggle between themes with one click
- **Friendly, Uncluttered Design** - A simple layout with just enough colour and personality
- **Personalised Greeting** - Optional WCA ID integration for personalised features
- **Responsive Design** - Works great on desktop and mobile
- **No Install, No Login** - Nothing to run, nothing to sign into. All data stays in your browser.

---

## 🚀 Quick Start

There's nothing to install and nothing to run from a terminal.

1. Download or clone this repository
2. Open **`index.html`** in your browser (double-click it, or drag it into a browser window)
3. Start tracking!

That's it. 🎉 See [INSTALLATION.md](INSTALLATION.md) for browser recommendations, backing up
your data, and troubleshooting.

---

## 🔄 Why web-only?

Earlier versions of this project were a Python command-line app paired with a small local
web server: you needed Python installed, a virtual environment, `pip install`, and a
terminal command just to open the dashboard. That was a lot of friction for what is, at
heart, a page you look at and click things on. This version drops the CLI and the Python
server entirely and rebuilds the same features as a single static web app: open
`index.html` and you're training. Your data now lives in the browser's own local storage
(IndexedDB) instead of a SQLite file on disk, so there's genuinely nothing to install,
configure, or keep running in the background.

---

## 📖 Usage Guide

### First Time

1. Open `index.html` in your browser
2. **Optional:** Set up your WCA ID in the dashboard for personalised features
3. Start tracking - use the Timer or import existing data

### Using the Timer

1. Navigate to **Timer** tab
2. Select your event (3x3, 4x4, etc.) and session
3. Press **SPACE** to start inspection (if enabled)
4. Hold **SPACE** until timer turns green (ready state)
5. Release **SPACE** to start solving
6. Press **SPACE** again to stop

Times are automatically saved to the current session, in your browser's local storage.

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
- **Sort & Filter** - Organise by date, event, or performance

### Backing Up Your Data

Since your data lives only in this browser (see [INSTALLATION.md](INSTALLATION.md)), use the
**Export backup** / **Import backup** links in the footer to save a JSON snapshot of
everything, or restore from one.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3 - no build step, no framework, no bundler
- **Storage:** IndexedDB (your browser's local storage) - nothing leaves your machine
- **Charts:** Plotly.js (loaded from CDN on first use of Charts/Analytics)
- **External APIs (optional):** the official WCA API for WCA ID lookups, and the
  [Unofficial WCA Public API](https://wca-rest-api.robiningelbrecht.be/) for world rankings
  (there's no official rankings API; this community project, built on the WCA's own results
  export, is what the WCA's own developer documentation points people to). Used only for the
  world-rank/percentile stat and the WCA-ID name lookup - everything else works fully offline.

---

## 📁 Project Structure

```
speedcube-training-explorer/
├── index.html             # The entire app - open this
├── css/                   # Stylesheets
├── js/
│   ├── config.js          # Constants, event names, chart config
│   ├── db.js               # IndexedDB wrapper
│   ├── stats.js             # Ao5/Ao12/mean calculation
│   ├── wca.js                # WCA rank/percentile + WCA ID lookup
│   ├── local-api.js           # Replaces the old backend - serves every UI data request locally
│   ├── cstimer-import.js       # CSTimer import parsing
│   ├── backup.js                # Export/Import a JSON backup
│   ├── dashboard.js, sessions.js, cubes.js, charts.js,
│   │   analytics.js, import.js, greeting.js, timer.js,
│   │   app.js, theme.js         # UI for each tab
├── images/                # Logo/favicon
├── LICENSE
└── README.md / INSTALLATION.md
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

- **[Unofficial WCA Public API](https://wca-rest-api.robiningelbrecht.be/)** by [Robin Ingelbrecht](https://github.com/robiningelbrecht) - the community-run rankings API this app relies on, built from the official WCA results export
- **WCA** - World Cube Association for their official database, results export, and rankings
- **CSTimer** - For inspiration and export format compatibility
- **Plotly.js** - For beautiful interactive charts
- **Speedcubing Community** - For feedback, support, and keeping the passion alive

---

## 📧 Contact & Support

**Creator:** Viet Ha Ly
**GitHub:** [@havl-code](https://github.com/havl-code)
**Email:** [vha.ly@outlook.com](mailto:vha.ly@outlook.com)
**Repository:** [speedcube-training-explorer](https://github.com/havl-code/speedcube-training-explorer)
**Issues:** [Report bugs or request features](https://github.com/havl-code/speedcube-training-explorer/issues)

> 🔧 **Having trouble?** Check the [troubleshooting guide](INSTALLATION.md#troubleshooting) in INSTALLATION.md first!

---

**Happy Cubing! 🎲✨**