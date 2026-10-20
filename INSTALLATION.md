# Installation Guide 📦

**Nothing to download. Open a link, add it to your Home Screen, and it works offline.**

Lookahead is a web app you install from your browser, at https://havl-code.github.io/lookahead/.
It keeps everything on your own device: there is no account, no server of its own, and no
tracking. After the first visit it works with no internet at all.

---

## 📱 1. Install It

- **iPhone or iPad:** open the link in **Safari**, tap the **Share** button, then **Add to Home
  Screen**. Open Lookahead from the Home Screen from then on. (A Safari tab keeps its own,
  separate data, and Safari may clear a tab's data after a week without a visit; the Home
  Screen app keeps it.)
- **Android:** open the link in **Chrome**, then choose **Install app** (or **Add to Home
  screen**) from the menu.
- **Computer:** open the link in **Chrome** or **Edge**, then click the install button in the
  address bar. In other browsers it works in a normal tab too.

The first time you time a solve, Lookahead asks the browser to keep its data for good, so the
browser doesn't clear it to save space.

---

## 🔁 2. Bring Your Solves Across

### From the Desktop App (3.x)

Until 4.0, Lookahead was a program you started on your computer with `uv run app.py`. Your
solves are in its `data/speedcube.db` file, and a backup moves them across:

1. Start your 3.x copy as usual (or download
   [3.3.0](https://github.com/havl-code/lookahead/releases/tag/v3.3.0) and copy your `data`
   folder into it).
2. On its **Import and Export** tab, click **Export backup**. It saves one JSON file with all
   your cubes, sessions, solves, timer settings, and WCA ID.
3. In Lookahead, open **More**, tap **Restore from a backup**, and choose that file.

Lookahead says how many sessions and solves it restored, and **More** lists what it holds.
Keep the backup file and the `data` folder somewhere safe. On a phone, send the file to
yourself (by email or a cloud drive, say) and choose it from **Files**.

### From the Browser-Only Version (2.x)

Open your old copy (the 2.x `index.html`), click **Export backup** in the footer, then restore
that file in Lookahead the same way.

### From CSTimer

Use **Import from CSTimer** on the **More** tab (see
[Importing CSTimer Data](README.md#importing-cstimer-data) in the README).

---

## 💾 Where Your Data Lives

Everything (your cubes, sessions, solves, timer settings, and WCA ID) is stored in your
browser's storage for Lookahead (IndexedDB), on this device only. Each device and browser
keeps its own: a phone and a computer don't share solves, but a backup moves them between the
two (**Restore** replaces what's there).

Two features use the internet, and the rest of the app works fine without them:

- **World rank:** where your best single would rank in the WCA world rankings. The rankings
  are kept on the device and refreshed once a day when you're online.
- **Name lookup:** finding your name from your WCA ID, for the greeting.

### Backing Up

- **Make backup** on the **More** tab saves everything as one JSON file, named
  `lookahead-backup-<date>.json`. Keep it somewhere other than the device.
- The **Timer** tab reminds you when 100 solves, or a week's worth, aren't backed up yet.
- **Restore from a backup** replaces what's on the device, and can be undone straight
  afterwards.
- **Export solves (CSV)** gives you every solve as a spreadsheet. It's handy for your own
  analysis, but it isn't a backup: only the JSON file can be restored.

Clearing your browser's data for the site, or deleting the Home Screen app, deletes your solves
too, so make a backup first.

---

## 🔧 Troubleshooting

- **There's no Add to Home Screen on iPhone:** it's only in Safari's Share menu, not in other
  browsers on iPhone or inside other apps. Open the link in Safari.
- **My solves aren't there on another device:** each device keeps its own. Make a backup on one
  and restore it on the other.
- **Solves timed in Safari aren't in the Home Screen app:** on iPhone they're kept separately.
  Make a backup in the Safari tab and restore it in the app.
- **World rank says "Needs the internet once":** the rankings haven't been fetched for that
  event yet. Open Analytics once while online.
- **World rank says "Outside the top 1,000":** the WCA rankings list the fastest 1,000 people
  in each event, so Lookahead can only place a time among them. Rather than guess further back,
  it says your best single is outside the top 1,000.
- **The WCA ID isn't accepted:** check its format (four digits, four letters, and two digits,
  such as `2003POCH01`) and your internet connection. Lookahead looks your name up on the
  official WCA website.
- **Ctrl+1 switches browser tabs instead of marking a solve OK:** many browsers keep Ctrl and a
  number for themselves. Use Alt+1, Alt+2, and Alt+3 instead (Option on a Mac).
- **CSTimer import fails:** make sure the file is a `.json` or `.txt` export straight from
  CSTimer's Export menu, without any changes.

---

## 🔄 Updating

There's nothing to do. When a new version is out, Lookahead fetches it in the background and
switches to it the next time you leave the app, or straight away if you tap **Update now**
when it offers. It never updates in the middle of a solve.

---

## 🧹 Uninstalling

Make a backup first if you want to keep your solves. Then delete the Home Screen app (or, on a
computer, uninstall it from the browser's apps page), which deletes its data too.

---

## 🙋 Getting Help

- **The README:** [README.md](README.md) has an overview of every feature and how to use it
- **Known problems:** check the
  [existing issues](https://github.com/havl-code/lookahead/issues) in case
  yours has already been reported
- **Something else:** [open an issue](https://github.com/havl-code/lookahead/issues/new)
  on GitHub

---

Happy cubing! 🎲✨
