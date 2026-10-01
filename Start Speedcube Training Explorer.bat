@echo off
rem Double-click this to start Speedcube Training Explorer on Windows. It starts the app without
rem a terminal window, and the app stops by itself shortly after its last browser tab is closed.
cd /d "%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
    echo uv isn't installed yet, and the app needs it.
    echo See INSTALLATION.md in this folder for the one-line installer, then try again.
    echo.
    pause
    exit /b 1
)

rem The first start downloads what the app needs, so do that here where progress is visible.
if not exist ".venv\" (
    echo Setting up the app for the first time. This only takes a few seconds...
    uv sync --quiet
    if errorlevel 1 (
        echo.
        echo Setup didn't finish. Check your internet connection and try again.
        pause
        exit /b 1
    )
)

where uvw >nul 2>nul
if errorlevel 1 (
    start "Speedcube Training Explorer" /min uv run app.py
) else (
    start "" uvw run app.py
)
