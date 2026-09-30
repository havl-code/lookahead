# Speedcube Training Explorer 🎲

**Track your progress. Analyse your solves. Compare with the world.**

A training tracker for speedcubers that runs on your own computer and opens in your web
browser. Time your solves, analyse your progress with charts, keep track of your cubes, and
see how you stack up against the WCA world rankings. Everything is stored on your computer,
and one command starts it.

![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-1572B6?logo=css&logoColor=white)
![Plotly](https://img.shields.io/badge/Plotly-3F4F75?logo=plotly&logoColor=white)
![uv](https://img.shields.io/badge/uv-DE5FE9?logo=uv&logoColor=white)
![Licence: MIT](https://img.shields.io/badge/licence-MIT-FF7A1A)

![The dashboard in dark mode, greeting the user by name with their personal best, world rank, average time and recent sessions](docs/screenshots/dashboard-dark.png)

---

## ✨ Features

### 📊 Dashboard

- **Personal Bests:** your best single for every event you've logged, with its date and scramble
- **World Rank:** your estimated WCA world rank and percentile, based on your best single
- **At a Glance:** your average, total solves, sessions and cubes
- **Recent Sessions:** your latest sessions, sortable by any column
- **Quick Actions:** jump straight into the timer, or add a session or cube

### ⏱️ Live Timer

- **Competition-Style Timing:** hold the space bar until the time turns green, let go to
  start, and press again to stop
- **Inspection:** an optional inspection countdown (8, 12, 15 or 17 seconds)
- **Scrambles:** a new random 3x3x3 scramble for every solve
- **Live Statistics:** solve count, best, mean and Ao5 for the whole session as you solve
- **Penalties:** mark any solve as +2 or DNF afterwards
- **Fullscreen Mode:** hides everything except the scramble and the time

### 🗂️ Sessions and Cubes

- **Sortable Tables:** click any column heading (date, time, solves and so on) to sort by it,
  and click again to reverse the order
- **Every Solve:** open a session to see all its solves, sorted however you like, even if it
  holds tens of thousands
- **Add by Hand:** create sessions and add solves yourself
- **Cube Inventory:** record each cube's type, brand, model and when you got it, and link cubes
  to sessions

### 📈 Analytics

- **Scores:** speed, consistency, accuracy and overall scores, colour-coded from red (needs
  work) to green (excellent), with how they've changed recently
- **Insights:** plain-English tips on what to work on next
- **Charts:** progress over time, time distribution, rolling Ao5 and Ao12, and consistency across
  sessions, for a whole event or a single session

### 📥 Import and Backup

- **CSTimer Import:** bring in your existing CSTimer sessions (JSON or TXT export), choosing
  which ones to import
- **Backup and Restore:** export all your data to one JSON file, or restore from one

### 🎨 Look and Feel

- **Clean and Simple:** a calm layout with an orange accent and the Space Grotesk font
- **Dark Mode by Default:** switch to light mode with one click; the app remembers your choice
- **Personalised Greeting:** add your WCA ID and the app greets you by name
- **Fast with Big Histories:** long lists load a page at a time, so even tens of thousands of
  solves stay quick
- **Works Offline:** everything except the WCA rank and name lookup works without internet
- **No Accounts:** nothing to sign up for, and your data never leaves your computer

### 📏 Statistics the WCA Way

- **Averages:** Ao5 and Ao12 drop your best and worst results and average the rest. A DNF
  counts as your worst result, so one DNF is dropped, but two or more make the average a DNF.
- **Penalties:** a +2 is added to the solve's time everywhere it counts: PBs, means,
  averages, charts and the world rank comparison.

---

## 🚀 Quick Start

1. **Install uv**, a small free tool that sets up Python and everything the app needs. You
   only do this once; see [INSTALLATION.md](INSTALLATION.md#-1-install-uv) for the one-line
   installer.
2. **Download this project:** on GitHub, click **Code**, then **Download ZIP**, and unzip it.
3. **Open a terminal in the project folder.** On Windows, right-click the folder and choose
   **Open in Terminal**. On a Mac, right-click it and choose **New Terminal at Folder**.
4. **Start the app** by typing:

   ```bash
   uv run app.py
   ```

The app opens in your browser. That's the only command you'll ever need. 🎉

The first start takes a few seconds while uv gets everything ready; after that it's quick.
Leave the terminal window open while you use the app, and close it when you're done.

---

## 🆕 What's New

- **Runs on your computer, not just in the browser.** The older browser-only version (2.x)
  kept your data inside the browser, so clearing your browsing data (or switching browsers)
  could lose it. Now a small server on your computer saves everything to one file,
  `data/speedcube.db`. It's easy to back up, and it doesn't matter which browser you use.
- **Quick with huge histories.** Importing tens of thousands of solves no longer slows the app
  down: long lists load a page at a time, and stats are worked out by the database.
- **Sortable tables.** Every table of sessions, solves and cubes sorts by any column.
- **Charts are part of Analytics.** One tab now has your scores, insights and charts, all
  driven by the same event menu.
- **A fresh look.** Dark mode by default, an orange accent, the Space Grotesk font, and a
  simpler layout.
- **More accurate statistics.** Ao5 and Ao12 follow the WCA rules for DNFs, and +2 penalties
  are counted in your PBs, means and charts. Stats for your existing sessions are recalculated
  automatically.
- **Fully offline.** The fonts and the charting library are bundled with the app, so only the
  WCA rank and name lookup need the internet.

### Bringing Your Data Across from the Browser-Only Version

1. Open your old copy of the app (the 2.x `index.html`) and click **Export backup** in the footer
2. Start this version with `uv run app.py`
3. Click **Import backup** in the footer and choose the file from step 1

---

## 📖 Usage Guide

### First Time

1. Start the app with `uv run app.py`. It opens in your browser.
2. **Optional:** click **Set up WCA ID** on the dashboard to get a personalised greeting.
3. Start tracking: use the timer, add sessions by hand, or import your CSTimer data.

### Using the Timer

1. Open the **Timer** tab. (3x3x3 is the only event with a timer so far.)
2. Pick a session, or choose **+ Create New Session**. Your first solve starts a session
   automatically if you don't have one.
3. Press the **space bar** to start inspection (if it's turned on).
4. Hold the **space bar** until the time turns green.
5. Let go to start solving.
6. Press the **space bar** again to stop.

Every solve is saved automatically. The list shows your latest 50 solves; use the menu next to
a solve to mark it +2 or DNF, and the gear icon for timer settings.

### Importing CSTimer Data

1. **In CSTimer:** open the Export menu and download your data as JSON or TXT.
2. **In Speedcube Training Explorer:**
   - Open the **Import** tab
   - Click **Choose File** and pick your export
   - Click **Preview Sessions**
   - Tick the sessions you want and choose which event they're for
   - Click **Import Selected**

### Managing Sessions

- **See all sessions:** the Sessions tab lists your training; pick an event to narrow it down
- **Sort:** click a column heading to sort by it, and click again to reverse
- **See every solve:** click **View** on a session, then **Show more** to load further solves
- **Add solves by hand:** click **Add Session**, then **View** to add individual solves
- **Delete:** remove sessions or single solves you don't want

### Backing Up Your Data

Everything lives in one file, `data/speedcube.db`. Copying that file somewhere safe (while the
app isn't running) is a complete backup. You can also use the **Export backup** link in the
footer to download everything as one JSON file, and **Import backup** to restore it. See
[INSTALLATION.md](INSTALLATION.md#-where-your-data-lives) for more.

---

## 🛠️ Tech Stack

- **Backend:** Python with [Flask](https://flask.palletsprojects.com/), started by
  [uv](https://docs.astral.sh/uv/). It's a small server that only accepts connections from
  your own computer.
- **Storage:** SQLite (`data/speedcube.db`). Nothing leaves your machine.
- **Frontend:** plain JavaScript, HTML and CSS, with no build step, framework or bundler.
- **Charts:** [Plotly.js](https://plotly.com/javascript/), bundled with the app.
- **Font:** [Space Grotesk](https://github.com/floriankarsten/space-grotesk), bundled with the app.
- **External APIs (optional):** the official WCA API to look up your name from your WCA ID,
  and the [Unofficial WCA Public API](https://wca-rest-api.robiningelbrecht.be/) for world
  rankings. The WCA has no official rankings API; this community project is built from the
  WCA's own results export, and the WCA's developer documentation points people to it. These
  are only used for the world rank and the name lookup. Everything else works offline.

---

## 📁 Project Structure

```text
speedcube-training-explorer/
├── app.py                 # Start here: `uv run app.py`
├── pyproject.toml         # Python version and dependencies (uv.lock pins exact versions)
├── speedcube/             # The Python backend
│   ├── __init__.py        # Creates the Flask app and serves web/
│   ├── api.py             # The JSON API the web page talks to (/api/...)
│   ├── db.py              # SQLite tables, connections and core data operations
│   ├── stats.py           # Ao5/Ao12 rules and chart maths
│   ├── wca.py             # WCA rank and percentile, and WCA ID lookup
│   ├── cstimer.py         # Reading CSTimer exports
│   └── backup.py          # JSON backup export and restore
├── web/                   # The web page, served by the backend
│   ├── index.html
│   ├── css/               # Stylesheets
│   ├── js/
│   │   ├── config.js      # API address, event names and shared helpers
│   │   ├── tables.js      # Sortable table headings
│   │   ├── backup.js      # Export and import backup links
│   │   ├── dashboard.js, sessions.js, cubes.js, timer.js,
│   │   │   import.js, analytics.js, charts.js, greeting.js,
│   │   │   app.js, theme.js   # One file per tab or feature
│   ├── images/            # Logo and favicon
│   └── vendor/            # Bundled Plotly.js and Space Grotesk (with their licences)
├── docs/screenshots/      # Images used in this README
├── data/                  # Your database (created on first start, never committed)
├── LICENSE
└── README.md, INSTALLATION.md
```

---

## 🤝 Contributing

Contributions are welcome! Whether you're a speedcuber with feature ideas or a developer who'd
like to help, we'd love to have you. Fork the repository on GitHub, make your changes on a new
branch, and open a pull request.

Feel free to open an issue for bugs or feature requests too.

---

## 🙏 Acknowledgements

- **[Unofficial WCA Public API](https://wca-rest-api.robiningelbrecht.be/)** by
  [Robin Ingelbrecht](https://github.com/robiningelbrecht): the community-run rankings API
  this app relies on, built from the official WCA results export
- **WCA:** the World Cube Association, for their official database, results export and rankings
- **CSTimer:** for the inspiration and the export format
- **Plotly.js:** for the interactive charts
- **Space Grotesk:** by Florian Karsten, the font the app uses

---

## 📝 Licence

This project is released under the MIT License. See the [LICENSE](LICENSE) file for details.
The bundled Plotly.js (MIT) and Space Grotesk (SIL Open Font License) keep their own licences,
included in `web/vendor/`.

---

Happy cubing! 🎲✨
