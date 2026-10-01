#!/usr/bin/env bash
# Double-click this (or run it) to start Speedcube Training Explorer on Linux. Some file managers
# ask whether to run it or open it as text: choose Run. The app stops by itself shortly after its
# last browser tab is closed.
cd "$(dirname "$0")" || exit 1

# uv's usual install locations, in case the session running this hasn't put them on the PATH.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

if ! command -v uv >/dev/null 2>&1; then
    message="uv isn't installed yet, and Speedcube Training Explorer needs it. See INSTALLATION.md for the one-line installer."
    echo "$message"
    # Started from a file manager there's no terminal to show that in, so try a notification.
    [ -t 1 ] || notify-send "Speedcube Training Explorer" "$message" 2>/dev/null
    exit 1
fi

uv run app.py
