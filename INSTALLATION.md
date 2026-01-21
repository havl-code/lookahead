# Installation Guide

Complete step-by-step instructions for setting up Speedcube Training Explorer on your system.

---

## Prerequisites

Before you begin, make sure you have:

- **Python 3.8 or higher** - [Download Python](https://www.python.org/downloads/)
  - During installation on Windows, check **"Add Python to PATH"**
  - macOS/Linux usually comes with Python 3 pre-installed
- **pip** (Python package manager) - Comes with Python
- **Modern web browser** - Chrome, Firefox, Safari, or Edge
- **Git** (optional) - For cloning the repository

---

## Installation Methods

### Method 1: Using Convenience Scripts (Recommended) ⭐

The easiest way to get started! The installer scripts handle everything automatically.

#### Windows

1. **Download or clone the repository:**
   ```bash
   git clone https://github.com/havl-code/speedcube-training-explorer.git
   cd speedcube-training-explorer
   ```
   
   Or download the ZIP file and extract it.

2. **Run the installer:**
   - Double-click `install.bat`, or
   - Open Command Prompt in the project folder and run:
     ```bash
     install.bat
     ```

3. **Start the app:**
   - Double-click `start.bat`, or
   - Run in Command Prompt:
     ```bash
     start.bat
     ```

4. **The app opens** automatically in your browser at `http://localhost:5000`

> **Windows Users Note:**
> - If you see security warnings when running `.bat` files, click **"More info"** → **"Run anyway"**
> - Allow Python through Windows Firewall when prompted (required for the web server)
> - If browser opens to a blank page, wait 2-3 seconds and **refresh (F5)** - the server needs time to start

#### macOS / Linux

1. **Download or clone the repository:**
   ```bash
   git clone https://github.com/havl-code/speedcube-training-explorer.git
   cd speedcube-training-explorer
   ```

2. **Make scripts executable:**
   ```bash
   chmod +x install.sh start.sh
   ```

3. **Run the installer:**
   ```bash
   ./install.sh
   ```

4. **Start the app:**
   ```bash
   ./start.sh
   ```

5. **The app opens** automatically in your browser at `http://localhost:5000`

---

### Method 2: Manual Installation

If you prefer to set things up manually or the scripts don't work on your system:

#### Step 1: Clone/Download the Repository

```bash
git clone https://github.com/havl-code/speedcube-training-explorer.git
cd speedcube-training-explorer
```

Or download the ZIP file and extract it.

#### Step 2: Create Virtual Environment

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

You should see `(venv)` in your terminal prompt.

#### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- Flask (web framework)
- flask-cors (CORS support)
- pandas (data processing)
- requests (HTTP client)
- PyYAML (YAML parsing)

#### Step 4: Create Data Directories

**Windows:**
```bash
mkdir data
mkdir data\cache
mkdir data\processed
mkdir data\raw
```

**macOS/Linux:**
```bash
mkdir -p data/cache data/processed data/raw
```

#### Step 5: Initialize Database

```bash
python -m src.python.db_manager
```

This creates the SQLite database and all necessary tables.

#### Step 6: Start the Application

**Option A: Using main.py (recommended)**
```bash
python main.py
```

**Option B: Direct Flask server**
```bash
python website_server.py
```

#### Step 7: Open in Browser

Navigate to `http://localhost:5000` in your web browser.

---

## Running the Application

### Using Convenience Scripts

**Windows:**
```bash
start.bat
```

**macOS/Linux:**
```bash
./start.sh
```

### Using Python Directly

Make sure your virtual environment is activated, then:

```bash
python main.py
```

Or:

```bash
python website_server.py
```

The app will be available at `http://localhost:5000`

---

## Database Management

### Initialize/Reset Database

If you need to reset or initialize the database:

```bash
python main.py --init-db
```

Or:

```bash
python -m src.python.db_manager
```

### Database Location

The SQLite database is stored at:
- **Windows:** `data\speedcube_training.db`
- **macOS/Linux:** `data/speedcube_training.db`

You can back up your data by copying this file.

---

## Configuration

### Change Port

The app runs on port 5000 by default. To change it:

1. Open `website_server.py`
2. Find the line:
   ```python
   app.run(debug=True, host='0.0.0.0', port=5000)
   ```
3. Change `port=5000` to your desired port
4. Update the URL in your browser accordingly

### Change Host

By default, the app is accessible at `localhost` (127.0.0.1). To make it accessible on your network:

1. Open `website_server.py`
2. Change `host='0.0.0.0'` (already set for network access)
3. Access from other devices using your computer's IP address: `http://YOUR_IP:5000`

---

## Troubleshooting

### Python Not Found

**Windows:**
- Make sure Python is installed and added to PATH
- Try `py` instead of `python`:
  ```bash
  py -m venv venv
  py -m pip install -r requirements.txt
  ```

**macOS/Linux:**
- Use `python3` instead of `python`:
  ```bash
  python3 -m venv venv
  python3 -m pip install -r requirements.txt
  ```

### Port Already in Use

If you see "Port 5000 is already in use":

1. **Check if the app is already running:**
   - Look for a terminal window with the server running
   - Check Task Manager (Windows) or Activity Monitor (macOS) for Python processes

2. **Kill the existing process:**
   - **Windows:** `taskkill /F /IM python.exe`
   - **macOS/Linux:** `pkill -f website_server.py`

3. **Or change the port** (see Configuration section above)

### Virtual Environment Issues

**Windows:**
- If activation fails, try:
  ```bash
  venv\Scripts\activate.bat
  ```

**macOS/Linux:**
- If activation fails, try:
  ```bash
  source venv/bin/activate
  ```

### Database Errors

If you see database-related errors:

1. **Reinitialize the database:**
   ```bash
   python main.py --init-db
   ```

2. **Check file permissions:**
   - Make sure the `data/` directory is writable
   - On Linux/macOS, you might need: `chmod -R 755 data/`

### Import Errors

If you see "ModuleNotFoundError":

1. **Make sure virtual environment is activated:**
   - You should see `(venv)` in your terminal prompt

2. **Reinstall dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Check Python path:**
   - Make sure you're running Python from the virtual environment:
     ```bash
     which python  # macOS/Linux
     where python # Windows
     ```
   - Should point to `venv/bin/python` or `venv\Scripts\python.exe`

### Browser Shows Blank Page

1. **Wait a few seconds** - The server needs time to start
2. **Refresh the page** (F5 or Ctrl+R)
3. **Check the terminal** for error messages
4. **Verify the server is running:**
   - You should see "Starting server..." in the terminal
   - Try accessing `http://localhost:5000` directly

### Windows Firewall Blocking

If the app doesn't start on Windows:

1. **Allow Python through Firewall:**
   - Windows Security → Firewall & network protection
   - Allow an app through firewall
   - Add Python or allow Python when prompted

2. **Or temporarily disable firewall** for testing (not recommended for production)

---

## Updating the Application

To update to the latest version:

1. **Pull latest changes:**
   ```bash
   git pull
   ```

2. **Update dependencies:**
   ```bash
   pip install -r requirements.txt --upgrade
   ```

3. **Restart the application**

---

## Uninstallation

To completely remove the application:

1. **Delete the project folder**
2. **That's it!** All data is stored locally in the `data/` folder, so deleting the project removes everything.

If you want to keep your data:
- Copy `data/speedcube_training.db` before deleting
- Restore it when you reinstall

---

## Getting Help

If you're still having issues:

1. **Check the [README.md](README.md)** for general information
2. **Open an issue** on GitHub: [Report a bug](https://github.com/havl-code/speedcube-training-explorer/issues)
3. **Check existing issues** to see if your problem has been reported

---

**Happy Installing! 🎲**

Once installed, head back to the [README.md](README.md) to learn how to use the app.
