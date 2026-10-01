#!/usr/bin/env bash
# Double-click this in Finder to start Speedcube Training Explorer on a Mac. A Terminal window
# shows the app's messages while it runs, and the app stops by itself shortly after its last
# browser tab is closed.
cd "$(dirname "$0")" || exit 1

# uv's usual install locations, in case the shell running this hasn't put them on the PATH.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v uv >/dev/null 2>&1; then
    echo "uv isn't installed yet, and the app needs it."
    echo "See INSTALLATION.md in this folder for the one-line installer, then try again."
    read -r -p "Press Enter to close. "
    exit 1
fi

uv run app.py
