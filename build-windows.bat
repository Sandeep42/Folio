@echo off
echo ========================================
echo  Folio - CAS Portfolio Analyzer Build
echo ========================================
echo.

REM Setup Visual C++ environment
set VS_PATH=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools
if not exist "%VS_PATH%" (
    echo ERROR: Visual Studio Build Tools not found at %VS_PATH%
    echo Please install from: https://aka.ms/vs/17/release/vs_BuildTools.exe
    echo Select: Desktop development with C++
    pause
    exit /b 1
)

echo [1/5] Setting up MSVC environment...
call "%VS_PATH%\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 (
    echo ERROR: Failed to set up MSVC environment
    pause
    exit /b 1
)
echo       Compiler: 
where cl.exe

echo [2/5] Installing root npm dependencies...
cd /d "%~dp0"
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo [3/5] Installing frontend npm dependencies...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: frontend npm install failed
    pause
    exit /b 1
)
cd ..

echo [4/5] Preparing Python backend sidecar...
REM Install Python deps if needed
cd backend
call python -m pip install -r requirements.txt > nul 2>&1
cd ..

echo [5/5] Building Tauri app...
call npx tauri build
if errorlevel 1 (
    echo.
    echo Build failed. See errors above.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  Build complete!
echo  Bundles are in src-tauri/target/release/bundle/
echo ========================================
pause
