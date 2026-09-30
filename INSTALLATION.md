# Installation Guide 📦

**One tool to install. One command to start.**

Speedcube Training Explorer is a web app that runs on your own computer. A small program (the
"server") keeps your data and shows the app in your web browser. You start it with one command,
`uv run app.py`, and everything else happens in the browser.

The only thing to install is **uv**, a free tool that downloads the right version of Python and
everything the app needs, automatically.

---

## 🧰 1. Install uv

You only need to do this once.

**On Windows:** open **PowerShell** from the Start menu, paste this line in and press Enter:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**On a Mac (or Linux):** open **Terminal**, paste this line in and press Enter:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

When it finishes, close that window. Other ways to install uv are listed in the
[uv installation docs](https://docs.astral.sh/uv/getting-started/installation/).

You don't need to install Python yourself. If your computer doesn't have a suitable version,
uv fetches one for the app automatically.

---

## 📥 2. Download the App

On the [GitHub page](https://github.com/havl-code/speedcube-training-explorer), click the green
**Code** button, then **Download ZIP**. Unzip it somewhere you'll remember, such as your
Documents folder.

---

## 🚀 3. Start the App

1. **Open a terminal in the app's folder** (the one containing `app.py`):
   - **Windows:** right-click the folder in File Explorer and choose **Open in Terminal**
   - **Mac:** right-click the folder in Finder and choose **New Terminal at Folder**
2. **Start the app** by typing this and pressing Enter:

   ```bash
   uv run app.py
   ```

The app opens in your browser. The very first start takes a few seconds while uv sets everything
up (it creates a `.venv` folder inside the app's folder); after that it's quick.

**Keep the terminal window open while you use the app.** When you're finished, close the window
(or press **Ctrl+C** in it) to stop the app. Next time, open a terminal in the folder and run
`uv run app.py` again.

---

## 💾 Where Your Data Lives

Everything (your cubes, sessions, solves and WCA ID) is saved in one file, `data/speedcube.db`,
inside the app's folder. It's created the first time you start the app.

The app only accepts connections from your own computer, so nobody else on your network can see
it. Two features use the internet, and the rest of the app works fine without them:

- **World Rank:** your estimated WCA world rank and percentile on the dashboard
- **Name Lookup:** finding your name from your WCA ID, for the personalised greeting

Everything else (the timer, sessions, cubes, analytics, charts and CSTimer import) works
completely offline. The fonts and the charting library are bundled with the app.

The app starts in dark mode. Use the sun or moon button at the top right to switch; it
remembers your choice.

### Backing Up

- **Copy the file:** copy `data/speedcube.db` somewhere safe while the app isn't running
- **Export a backup:** click **Export backup** in the app's footer to download everything as one
  JSON file, and **Import backup** to restore from it (this replaces all current data)

### Bringing Your Data Across from the Browser-Only Version

The older browser-only version (2.x) kept its data inside the browser rather than in a file. To
bring it across, open your old copy of the app, click **Export backup** in the footer, then start
this version and use **Import backup** with that file.

---

## 🔧 Troubleshooting

- **"uv" isn't recognised as a command:** close the terminal and open a new one, since the
  installer only takes effect in new windows. If it still isn't found, try the installer again
  or see the [uv installation docs](https://docs.astral.sh/uv/getting-started/installation/).
- **"No such file or directory: app.py":** the terminal isn't in the app's folder. Open the
  terminal from the folder that contains `app.py` (see step 3).
- **The browser didn't open:** the terminal shows an address like `http://127.0.0.1:8577`. Copy
  it into your browser.
- **The app opened at a different address:** if something else is already using the usual
  address (for example, the app is already open in another terminal), the app picks a free one
  instead. That's fine: your data is the same either way.
- **World Rank shows "No data":** this needs an internet connection to reach the public WCA
  rankings. Everything else still works without one.
- **WCA ID setup fails:** check the ID format (four digits, four letters, two digits, such as
  `2003POCH01`) and your internet connection. The app looks your name up on the official WCA
  website.
- **CSTimer import fails:** make sure the file is a `.json` or `.txt` export straight from
  CSTimer's Export menu, without any changes.

---

## 🔄 Updating the App

Download the latest ZIP from GitHub and unzip it. To keep your data, copy the `data` folder from
your old copy into the new one before you start it. Then run `uv run app.py` in the new folder
as usual; uv picks up any changes to what the app needs by itself.

---

## 🧹 Uninstalling

Delete the app's folder. If you want to keep your data, copy `data/speedcube.db` (or use
**Export backup**) first, because it lives inside that folder.

---

## 🙋 Getting Help

- **The README:** [README.md](README.md) has an overview of every feature and how to use it
- **Known problems:** check the
  [existing issues](https://github.com/havl-code/speedcube-training-explorer/issues) in case
  yours has already been reported
- **Something else:** [open an issue](https://github.com/havl-code/speedcube-training-explorer/issues/new)
  on GitHub

---

Happy cubing! 🎲✨
