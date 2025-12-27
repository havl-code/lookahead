@echo off
REM Speedcube Training Explorer - Windows Installer

echo ========================================
echo   Speedcube Training Explorer Setup
echo ========================================
echo.

REM Check Python
echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo [X] Error: Python not found!
    echo.
    echo Please install Python 3.8+ from https://python.org
    echo Make sure to check "Add Python to PATH" during installation
    echo.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version') do set PYTHON_VERSION=%%i
echo [OK] Python %PYTHON_VERSION% found
echo.

REM Check pip
echo Checking pip...
pip --version >nul 2>&1
if errorlevel 1 (
    echo [X] Error: pip not found!
    pause
    exit /b 1
)
echo [OK] pip found
echo.

REM Create virtual environment
echo Creating virtual environment...
if not exist "venv" (
    python -m venv venv
    echo [OK] Virtual environment created
) else (
    echo [OK] Virtual environment already exists
)

REM Activate virtual environment
call venv\Scripts\activate.bat
echo [OK] Virtual environment activated
echo.

REM Install dependencies
echo Installing dependencies...
echo This may take a minute...
pip install -q -r requirements.txt
if errorlevel 1 (
    echo [X] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

REM Create data directories
echo Setting up data directory...
if not exist "data" mkdir data
if not exist "data\cache" mkdir data\cache
if not exist "data\processed" mkdir data\processed
if not exist "data\raw" mkdir data\raw
echo [OK] Data directories created
echo.

REM Initialize database
echo Initializing database...
python -m src.python.db_manager
if errorlevel 1 (
    echo [X] Failed to initialize database
    pause
    exit /b 1
)
echo.

echo ========================================
echo        Installation Complete!
echo ========================================
echo.
echo To start the app:
echo   1. Double-click start.bat
echo   2. Or run: python main.py
echo.
echo The app will open in your browser at:
echo   http://localhost:5000
echo.

pause