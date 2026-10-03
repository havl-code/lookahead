@echo off
rem Double-click this to start Speedcube Training Explorer on Windows. It checks that uv is
rem installed and hands over to app.py, which closes this window once the app is running.
cd /d "%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
    echo uv isn't installed yet, and the app needs it.
    echo See INSTALLATION.md in this folder for the one-line installer, then try again.
    echo.
    pause
    exit /b 1
)

if not exist ".venv\" echo Setting up the app for the first time. This only takes a few seconds...
set SPEEDCUBE_LAUNCHER=windows
uv run app.py
rem Keep the window open if something went wrong, so the message can be read.
if errorlevel 1 pause
