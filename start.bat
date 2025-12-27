@echo off
REM Speedcube Training Explorer - Windows Launcher

echo Starting Speedcube Training Explorer...
echo.

REM Activate virtual environment
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
)

REM Open browser after 2 seconds
timeout /t 2 /nobreak >nul
start http://localhost:5000

REM Start Flask server
echo ========================================
echo    Speedcube Training Explorer
echo    Running at http://localhost:5000
echo ========================================
echo.
echo Press Ctrl+C to stop the server
echo.

python main.py