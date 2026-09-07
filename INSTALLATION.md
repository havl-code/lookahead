# Installation Guide

There's no installer, no dependencies, and nothing to run from a terminal. The app is a
handful of static HTML/CSS/JS files that run entirely in your browser.

---

## Opening the App

1. **Download or clone the repository:**
   ```bash
   git clone https://github.com/havl-code/speedcube-training-explorer.git
   ```
   Or download the ZIP file and extract it.

2. **Open `index.html`** - double-click it, or drag it into an open browser window.

That's it. The app loads and is ready to use immediately.

### Browser Requirements

Any recent version of **Chrome, Edge, or Firefox** works well. The app uses IndexedDB (your
browser's local storage) to keep all your data on your machine - no account, no server, no
internet connection required for day-to-day use.

Two features do call out to the internet, and degrade gracefully without it:
- Your **WCA world rank / percentile** stat on the Dashboard
- Looking up your name from a **WCA ID** for the personalised greeting

Everything else - the timer, sessions, cubes, charts, analytics, and CSTimer import - works
completely offline.

> If your browser restricts local storage for files opened directly from disk (rare on
> modern Chrome/Edge/Firefox), you can instead serve the folder with any static file server
> (for example `npx serve` or `python -m http.server`) and open the printed `localhost`
> address. This is just an alternative way to open the same files - it is never required.

---

## Backing Up Your Data

Your data lives only in this browser's local storage - it doesn't sync anywhere and isn't
saved as a file you can copy. Use the **Export backup** link in the footer any time to
download a single JSON file with everything (cubes, sessions, solves, WCA ID). Use
**Import backup** to restore from that file - into the same browser, a different browser, or
after clearing your browser data.

Because storage is per-browser, switching browsers (or using a private/incognito window)
means you won't see your existing data there until you import a backup.

---

## Troubleshooting

**Blank page or nothing loads** - Refresh the page. If you opened the file directly, make
sure `css/`, `js/`, and `images/` are still in the same folder as `index.html` (don't move
`index.html` on its own).

**"Your World Rank" / "Your Percentile" show "No data"** - These need an internet connection
to reach the public WCA rankings mirror. Everything else in the app still works without one.

**WCA ID setup fails** - Double-check the ID format (`YYYYLLLL##`, e.g. `2003POCH01`) and your
internet connection; this looks your name up from the official WCA API.

**My data disappeared** - Your browser's storage for this page was cleared (e.g. "Clear
browsing data", a private window, or a fresh browser profile). If you have a backup file from
**Export backup**, use **Import backup** to restore it. If not, unfortunately the data is gone
- this is why backing up periodically is worth doing.

**CSTimer import fails** - Make sure the file is a `.json` or `.txt` export straight from
CSTimer's Export menu (unmodified).

---

## Updating the Application

```bash
git pull
```

Then just reopen `index.html` - your data isn't touched by updating the code, since it lives
in your browser's storage, separate from these files.

---

## Uninstallation

Delete the project folder. If you want to keep your data, use **Export backup** first to save
a copy - deleting the folder doesn't delete browser storage, but clearing your browser's site
data for this page later would.

---

## Getting Help

1. **Check the [README.md](README.md)** for general information
2. **Open an issue** on GitHub: [Report a bug](https://github.com/havl-code/speedcube-training-explorer/issues)
3. **Check existing issues** to see if your problem has been reported

---

**Happy Cubing! 🎲**
