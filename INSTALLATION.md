# Installation Guide 📦

**One tool to install. One double-click (or one command) to start.**

Speedcube Training Explorer is a web app that runs on your own computer. A small program (the
"server") keeps your data and shows the app in your web browser. On Windows, Mac or Linux, you
can start it either by double-clicking its launcher or by typing one command, `uv run app.py`.
Both do the same thing, so use whichever you prefer. Everything else happens in the browser.

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

There are two ways to start the app, and they work on every operating system. Pick whichever
you like; you can switch any time, and your data is the same either way.

Either way, the app opens in your browser. The very first start takes a few seconds while uv
sets everything up (it creates a `.venv` folder inside the app's folder); after that it's quick.
When you're finished, just close the app's browser tab. The app stops by itself a few seconds
later.

### Option A: Double-Click the Launcher

The app's folder has a launcher for each operating system. Double-click the one for yours:

| Operating system | Double-click this file |
| --- | --- |
| Windows | **Start on Windows** |
| Mac | **Start on Mac** |
| Linux | **Start on Linux** |

(There's one per system because each system only runs its own kind of file. They all do the
same thing: check that uv is installed, then start the app. Just ignore the other two.)

The first time you open a downloaded launcher, your system may check with you first:

- **Windows** may warn you about running a file from the internet. Choose **Run** (or **More
  info**, then **Run anyway**).
- **Mac** may say it can't check the file for malicious software. Click **Done**, open **System
  Settings**, go to **Privacy & Security**, scroll down and click **Open Anyway** next to the
  launcher's name. You only need to do this once.
- **Linux** file managers may ask whether to run the file or open it as text. Choose **Run**. If
  it opens in a text editor instead, look in your file manager's settings for an option to run
  executable text files.

What happens next depends on your system:

- **Windows:** a window shows for a moment (a few seconds the first time, while uv sets
  things up) and closes once the app is running. After the first start, the folder also has a
  **Speedcube Training Explorer** shortcut with the app's icon, which starts the app with no
  window at all, so use it from then on. You can drag it to your desktop, or right-click it
  and pin it to the Start menu.
- **Mac:** a Terminal window opens and shows the app's messages. Leave it open while you use the
  app. Once the app stops, you can close it.
- **Linux:** if you chose **Run**, the app runs in the background with no window apart from
  your browser. If you chose **Run in Terminal**, a terminal shows its messages instead.

### Option B: Type One Command

1. **Open a terminal in the app's folder** (the one containing `app.py`):
   - **Windows:** right-click the folder in File Explorer and choose **Open in Terminal**
   - **Mac:** right-click the folder in Finder and choose **New Terminal at Folder**
   - **Linux:** right-click the folder in your file manager and choose **Open in Terminal**
2. **Start the app** by typing this and pressing Enter:

   ```bash
   uv run app.py
   ```

**Keep the terminal window open while you use the app.** Once the app stops, you can close it.
Next time, open a terminal in the folder and run `uv run app.py` again.

---

## 💾 Where Your Data Lives

Everything (your cubes, sessions, solves, and WCA ID) is saved in one file, `data/speedcube.db`,
inside the app's folder. It's created the first time you start the app.

The app only accepts connections from your own computer, so nobody else on your network can see
it. It also refuses requests from other websites open in your browser, so a page you visit can't
read or change your data (see [Security](README.md#-security) in the README). Two features use
the internet, and the rest of the app works fine without them:

- **World Rank:** where your best single would rank in the WCA world rankings, on the dashboard
- **Name Lookup:** finding your name from your WCA ID, for the personalised greeting

Everything else (the timer, sessions, cubes, analytics, charts, and CSTimer import) works
completely offline. The fonts, the charting library, and the summary of WCA results that the
Analytics scores compare with are all bundled with the app.

The app starts in dark mode. Use the sun or moon button at the top right to switch; it
remembers your choice.

### Backing Up

- **Copy the file:** copy `data/speedcube.db` somewhere safe while the app isn't running
- **Export a backup:** click **Export backup** in the app's footer to download everything as one
  JSON file, and **Import backup** to restore from it (this replaces all current data)
- **Export solves as CSV:** **Export solves (CSV)** in the footer gives you every solve as a
  spreadsheet. It's handy for your own analysis, but it isn't a backup: only the JSON file can
  be restored
- **Daily copies:** the first time you start the app each day, it copies `data/speedcube.db`
  into `data/backups` by itself (unless nothing has changed since the last copy), and keeps the
  newest seven. They take about seven times the space of your database
- **Safety copies:** before restoring a backup, or updating your data for a new version of the
  app, the app copies `data/speedcube.db` into `data/backups` too, and keeps the newest five
- **Going back to a copy:** close the app, then copy the one you want over `data/speedcube.db`
  (keeping that name). The daily ones end in `-daily.db`, and the safety ones say what they
  came before, such as `-before-restore.db`

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
- **The browser didn't open:** go to `http://127.0.0.1:8577` in your browser. (If you started
  the app from a terminal and it shows a different address there, use that one.) Open it within
  2 minutes: if no page connects by then, the app stops by itself, and you can simply start it
  again.
- **The app opened at a different address:** if something else is already using the usual
  address (another program, an out-of-date copy of the app that's still open, or a copy in a
  different folder), the app picks a free one instead. That's fine: your data is the same
  either way. (Starting the app while this same copy is already running just opens another
  tab of it.)
- **Double-clicking says uv isn't installed:** install it (see step 1), then try again. If you
  only just installed it and it still isn't found, sign out of your computer and back in.
- **Double-clicking the launcher does nothing, or opens it as text:** some unzip tools and
  file managers stop launchers from running. Start the app with Option B (`uv run app.py`)
  instead; it does exactly the same thing.
- **Windows: the shortcut with the icon stopped working after moving the folder:** it remembers
  where the folder was. Delete it and double-click **Start on Windows**; the app makes a fresh one.
- **A notice says the app was updated while it was running:** the app's files changed (for
  example, you updated it) while it was open, so part of it is still the old version. Close
  all of its tabs, wait a few seconds for it to stop, then start it again.
- **The app stopped while I was using it:** it stops a few seconds after its last tab closes,
  so start it again. Your data is all saved.
- **World Rank shows "No data":** this needs an internet connection to reach the public WCA
  rankings. Everything else still works without one.
- **World Rank says "Outside the top 1,000":** the WCA rankings list the fastest 1,000 people in
  each event, so the app can only place a time among them. Rather than guess further back, it
  says your best single is outside the top 1,000.
- **WCA ID setup fails:** check the ID format (four digits, four letters, and two digits, such as
  `2003POCH01`) and your internet connection. The app looks your name up on the official WCA
  website.
- **Ctrl+1 switches browser tabs instead of marking a solve OK:** many browsers keep Ctrl and a
  number for themselves. Use Alt+1, Alt+2, and Alt+3 instead (Option on a Mac).
- **CSTimer import fails:** make sure the file is a `.json` or `.txt` export straight from
  CSTimer's Export menu, without any changes.

---

## 🔄 Updating the App

First close the app's tabs so the old version stops. Then download the latest ZIP from GitHub
and unzip it. To keep your data, copy the `data` folder from your old copy into the new one
before you start it. Then start the app from the new folder as usual; uv picks up any changes
to what the app needs by itself.

A new version sometimes needs to update your data (for example, to work out your stats under
newer rules). It does that by itself on its first start, after keeping a safety copy of your
database in `data/backups`, so there's always a way back.

**Updating to 3.1:** the first start adds room for best averages and timer settings,
and works out every session's stats again under the WCA's rounding rules. With a big history
this takes a few seconds, once. If you'd like a copy of your own as well as the safety copy,
click **Export backup** in the old version before you update.

On Windows, the shortcut with the app's icon (and any copy of it on your desktop or Start menu)
still points to the old folder. Delete it; the new folder makes its own on its first start.

---

## 🧹 Uninstalling

Delete the app's folder. If you want to keep your data, copy `data/speedcube.db` (or use
**Export backup**) first, because it lives inside that folder. On Windows, also delete any
copies of the app's shortcut you put on your desktop or Start menu.

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
